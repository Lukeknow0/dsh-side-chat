import { randomUUID } from "node:crypto";
import "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import { appendDelegatedPolicyOverrides, applyChildComposition, childSessionMeta, resolveChildAgentOptions, resolveChildDepth } from "@deepseek-ai/dsh-subagent";
//#region src/shared/tool-policy.ts
const READ_ONLY_TOOL_CANDIDATES = Object.freeze([
	"read",
	"read_image",
	"glob",
	"grep",
	"lsp",
	"view_image",
	"web_search",
	"skill",
	"session_event_read",
	"session_event_search",
	"session_event_trace",
	"session_search",
	"session_trace",
	"job_list",
	"job_output",
	"terminal_list",
	"terminal_read",
	"list_agents",
	"get_goal",
	"mnemon_document_search",
	"mnemon_memory_bodies",
	"mnemon_recall",
	"mnemon_related",
	"mnemon_status"
]);
const READ_ONLY_TOOL_SET = Object.freeze(/* @__PURE__ */ new Set([...READ_ONLY_TOOL_CANDIDATES, "run_code"]));
function isSideChatToolAllowed(name) {
	return READ_ONLY_TOOL_SET.has(name);
}
const READ_ONLY_DENIAL = "Side Chat is read-only. This tool could change external state, files, sessions, or processes. Answer using inherited context and read-only inspection instead.";
//#endregion
//#region src/host/side-chat-service.ts
const SIDE_CHAT_PERSONA = "You are in a temporary side conversation, separate from the main task. Treat inherited history as reference context only. Do not continue or complete the parent task. Answer only instructions submitted in this side conversation. Use lightweight, read-only exploration. Never modify files, repositories, sessions, processes, remote systems, or external state. Do not delegate to subagents.";
const SIDE_CHAT_BOUNDARY = "Side conversation boundary. Everything before this message is inherited history from the parent thread and is reference context only, not your current task. Do not continue any earlier plan, edit, command, approval, or tool call. Only direct user messages after this boundary are active instructions. This conversation is read-only.";
const SIDE_CHAT_IDLE_TTL_MS = 18e5;
const SIDE_CHAT_LEASE_POLL_MS = 1e3;
function evaluateSideChatLease(input) {
	if (input.parentRunning || input.childRunning) return {
		expiresAt: input.now + SIDE_CHAT_IDLE_TTL_MS,
		busy: true,
		expire: false,
		delay: SIDE_CHAT_LEASE_POLL_MS
	};
	if (input.wasBusy) return {
		expiresAt: input.now + SIDE_CHAT_IDLE_TTL_MS,
		busy: false,
		expire: false,
		delay: SIDE_CHAT_LEASE_POLL_MS
	};
	if (input.expiresAt <= input.now) return {
		expiresAt: input.expiresAt,
		busy: false,
		expire: true,
		delay: 0
	};
	return {
		expiresAt: input.expiresAt,
		busy: false,
		expire: false,
		delay: Math.max(1, Math.min(SIDE_CHAT_LEASE_POLL_MS, input.expiresAt - input.now))
	};
}
function failure(code, message) {
	return {
		ok: false,
		error: {
			code,
			message
		}
	};
}
function completedTurnSeed(events) {
	const lastTurnEnd = events.findLast((event) => event.type === "turn/end");
	if (lastTurnEnd === void 0) return [];
	return events.slice(0, lastTurnEnd.seq + 1);
}
function visibleReadTools(parent) {
	return READ_ONLY_TOOL_CANDIDATES.filter((name) => parent.ctx.tools.get(name, parent) !== void 0);
}
function hiddenSideChatMeta(parent, depth, forkSeq) {
	const { parentSession: durableParentLink, ...meta } = childSessionMeta(parent, depth, forkSeq);
	return meta;
}
function errorText(error) {
	return error instanceof Error ? error.message : String(error);
}
function contentText(content) {
	return content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
}
function transcript(entry) {
	const events = entry.handle?.agent.session.events.slice(entry.seedLength) ?? [];
	const messages = [];
	const finalized = /* @__PURE__ */ new Set();
	const chunkText = /* @__PURE__ */ new Map();
	let runningTool;
	for (const event of events) {
		if (event.type === "user/message" && event.data.source.kind === "user") {
			const text = contentText(event.data.content);
			if (text !== "") messages.push({
				id: String(event.data.id),
				role: "user",
				text
			});
			continue;
		}
		if (event.type === "assistant/chunk") {
			const key = `${event.data.turn}:${event.data.step}`;
			if (event.data.chunk.type === "text-delta") chunkText.set(key, (chunkText.get(key) ?? "") + event.data.chunk.text);
			continue;
		}
		if (event.type === "assistant/message") {
			const key = `${event.data.turn}:${event.data.step}`;
			finalized.add(key);
			const text = contentText(event.data.message.content);
			if (text !== "") messages.push({
				id: String(event.data.message.id),
				role: "assistant",
				text
			});
			continue;
		}
		if (event.type === "tool/call") runningTool = event.data.name;
	}
	const partial = [...chunkText.entries()].filter(([key]) => !finalized.has(key)).map(([, text]) => text).join("");
	return {
		chatToken: entry.chatToken,
		revision: events.at(-1)?.seq ?? entry.seedLength,
		expiresAt: entry.expiresAt,
		messages,
		partial,
		running: entry.handle?.agent.status === "running",
		...entry.handle?.agent.status === "running" && runningTool !== void 0 ? { runningTool } : {}
	};
}
var SideChatService = class extends TypertRemoteService {
	static inject = ["agents", "sessions"];
	byToken = /* @__PURE__ */ new Map();
	tokenByParent = /* @__PURE__ */ new Map();
	constructor(ctx) {
		super(ctx, "sideChat");
		ctx.effect(() => () => this.disposeAll(), "side-chat: dispose live side conversations");
		ctx.on("agent/disposed", ({ agent }) => {
			const token = [...this.byToken.values()].find((entry) => String(entry.childSessionId) === String(agent.id))?.chatToken;
			if (token !== void 0) this.forget(token);
		});
	}
	async start(request) {
		const duplicate = this.byToken.get(request.chatToken);
		if (duplicate !== void 0 && !duplicate.closing) {
			const handle = duplicate.handle ?? await duplicate.creation?.catch(() => void 0);
			if (handle !== void 0 && !duplicate.closing) {
				duplicate.handle = handle;
				this.touch(duplicate);
				return this.startValue(duplicate);
			}
			if (this.byToken.get(request.chatToken) === duplicate) return failure("already-open", "This Side Chat is still opening.");
		}
		const existingToken = this.tokenByParent.get(request.parentSessionId);
		if (existingToken !== void 0 && existingToken !== request.chatToken) {
			const existing = this.byToken.get(existingToken);
			if (existing !== void 0 && !existing.closing) {
				const handle = existing.handle ?? await existing.creation?.catch(() => void 0);
				if (handle !== void 0 && !existing.closing) {
					existing.handle = handle;
					this.adoptToken(existing, request.chatToken);
					this.touch(existing);
					return this.startValue(existing);
				}
			}
			if (this.tokenByParent.get(request.parentSessionId) === existingToken) this.tokenByParent.delete(request.parentSessionId);
		}
		const parentId = SessionId(request.parentSessionId);
		const parent = this.ctx.agents.get(parentId);
		if (parent === void 0) return failure("parent-not-found", "The parent conversation is not live.");
		const seed = completedTurnSeed(parent.session.events);
		if (seed.length === 0) return failure("no-completed-turn", "Send at least one message and wait for a completed turn before opening Side Chat.");
		const childId = SessionId(randomUUID());
		const entry = {
			chatToken: request.chatToken,
			parentSessionId: request.parentSessionId,
			childSessionId: childId,
			seedLength: seed.length,
			abort: new AbortController(),
			sentRequests: /* @__PURE__ */ new Map(),
			expiresAt: Date.now() + SIDE_CHAT_IDLE_TTL_MS,
			expiryTimer: void 0,
			leaseBusy: false,
			closing: false
		};
		this.byToken.set(request.chatToken, entry);
		this.tokenByParent.set(request.parentSessionId, request.chatToken);
		this.scheduleExpiry(entry);
		try {
			const childDepth = resolveChildDepth(parent, void 0);
			const allowedTools = visibleReadTools(parent);
			const creation = parent.ctx.agents.create({
				sessionId: childId,
				seed,
				meta: hiddenSideChatMeta(parent, childDepth, seed.length),
				agentOptions: resolveChildAgentOptions(parent, void 0, childDepth),
				signal: entry.abort.signal,
				setup: (childCtx) => {
					appendDelegatedPolicyOverrides(childCtx.agent.session, {
						sandboxMode: "read-only",
						approvalPolicy: "never"
					});
					applyChildComposition(childCtx, parent, {
						persona: SIDE_CHAT_PERSONA,
						toolFilter: { allow: allowedTools }
					});
					childCtx.tools.guard((execution) => isSideChatToolAllowed(execution.name) ? void 0 : READ_ONLY_DENIAL);
				}
			});
			entry.creation = creation;
			const handle = await creation;
			if (entry.closing || this.byToken.get(entry.chatToken) !== entry) {
				await handle.dispose();
				return failure("cancelled", "Side Chat was closed before it finished opening.");
			}
			entry.handle = handle;
			handle.agent.inject(createUserMessage({
				content: [{
					type: "text",
					text: SIDE_CHAT_BOUNDARY
				}],
				source: {
					kind: "plugin",
					plugin: "dsh-side-chat",
					form: "notice",
					summary: "Side conversation boundary"
				}
			}));
			return this.startValue(entry);
		} catch (error) {
			this.forget(entry.chatToken);
			if (entry.abort.signal.aborted || entry.closing) return failure("cancelled", "Side Chat opening was cancelled.");
			const message = errorText(error);
			return failure(message.includes("tool") || message.includes("factory") ? "compatibility" : "internal", message);
		}
	}
	read(request) {
		const entry = this.byToken.get(request.chatToken);
		if (entry === void 0 || entry.closing || entry.handle === void 0) return {
			ok: false,
			error: {
				code: "not-open",
				message: "This Side Chat is no longer open."
			}
		};
		this.touch(entry);
		return {
			ok: true,
			value: transcript(entry)
		};
	}
	async send(request) {
		const entry = this.byToken.get(request.chatToken);
		if (entry === void 0 || entry.closing || entry.handle === void 0) return {
			ok: false,
			error: {
				code: "not-open",
				message: "This Side Chat is no longer open."
			}
		};
		const existing = entry.sentRequests.get(request.requestId);
		this.touch(entry);
		if (existing !== void 0) return {
			ok: true,
			value: {
				chatToken: request.chatToken,
				requestId: request.requestId,
				accepted: true,
				messageId: existing
			}
		};
		const text = request.text.trim();
		if (text.length === 0) return {
			ok: false,
			error: {
				code: "invalid-input",
				message: "A Side Chat question cannot be empty."
			}
		};
		const message = createUserMessage({
			content: [{
				type: "text",
				text
			}],
			source: { kind: "user" }
		});
		entry.sentRequests.set(request.requestId, String(message.id));
		entry.handle.agent.followup(message);
		this.scheduleExpiry(entry);
		return {
			ok: true,
			value: {
				chatToken: request.chatToken,
				requestId: request.requestId,
				accepted: true,
				messageId: String(message.id)
			}
		};
	}
	async cancel(request) {
		const entry = this.byToken.get(request.chatToken);
		if (entry === void 0 || entry.closing || entry.handle === void 0) return {
			ok: false,
			error: {
				code: "not-open",
				message: "This Side Chat is no longer open."
			}
		};
		entry.handle.agent.cancel({ kind: "user" });
		this.touch(entry);
		return {
			ok: true,
			value: {
				chatToken: request.chatToken,
				accepted: true
			}
		};
	}
	async close(request) {
		const entry = this.byToken.get(request.chatToken);
		if (entry === void 0) return {
			ok: true,
			value: {
				chatToken: request.chatToken,
				closed: true,
				cleanup: "absent"
			}
		};
		entry.closing = true;
		entry.abort.abort();
		this.forget(entry.chatToken);
		try {
			const handle = entry.handle ?? await entry.creation?.catch(() => void 0);
			if (handle !== void 0) await handle.dispose();
			const workspace = this.ctx.get("workspaceRegistry");
			if (workspace !== void 0) try {
				await workspace.archiveSession(entry.childSessionId);
				return {
					ok: true,
					value: {
						chatToken: request.chatToken,
						closed: true,
						cleanup: "archived"
					}
				};
			} catch (error) {
				return {
					ok: true,
					value: {
						chatToken: request.chatToken,
						closed: true,
						cleanup: "runtime-only",
						warning: "Runtime state was removed, but archive cleanup failed: " + errorText(error)
					}
				};
			}
			return {
				ok: true,
				value: {
					chatToken: request.chatToken,
					closed: true,
					cleanup: "runtime-only",
					warning: "This DSH build exposes no durable cleanup capability; the live session was removed."
				}
			};
		} catch (error) {
			return {
				ok: false,
				error: {
					code: "internal",
					message: errorText(error)
				}
			};
		}
	}
	startValue(entry) {
		return {
			ok: true,
			value: {
				parentSessionId: entry.parentSessionId,
				childSessionId: String(entry.childSessionId),
				chatToken: entry.chatToken,
				seedLength: entry.seedLength,
				expiresAt: entry.expiresAt,
				cleanupMode: this.ctx.get("workspaceRegistry") === void 0 ? "runtime-only" : "archive-on-close"
			}
		};
	}
	adoptToken(entry, chatToken) {
		if (entry.chatToken === chatToken) return;
		this.byToken.delete(entry.chatToken);
		entry.chatToken = chatToken;
		this.byToken.set(chatToken, entry);
		this.tokenByParent.set(entry.parentSessionId, chatToken);
	}
	touch(entry) {
		entry.expiresAt = Date.now() + SIDE_CHAT_IDLE_TTL_MS;
		this.scheduleExpiry(entry);
	}
	scheduleExpiry(entry) {
		if (entry.expiryTimer !== void 0) clearTimeout(entry.expiryTimer);
		if (entry.closing || this.byToken.get(entry.chatToken) !== entry) return;
		const decision = evaluateSideChatLease({
			now: Date.now(),
			expiresAt: entry.expiresAt,
			wasBusy: entry.leaseBusy,
			parentRunning: this.ctx.agents.get(SessionId(entry.parentSessionId))?.status === "running",
			childRunning: entry.handle?.agent.status === "running"
		});
		entry.expiresAt = decision.expiresAt;
		entry.leaseBusy = decision.busy;
		if (decision.expire) {
			this.close({ chatToken: entry.chatToken });
			return;
		}
		entry.expiryTimer = setTimeout(() => {
			entry.expiryTimer = void 0;
			this.scheduleExpiry(entry);
		}, decision.delay);
	}
	forget(chatToken) {
		const entry = this.byToken.get(chatToken);
		if (entry === void 0) return;
		if (entry.expiryTimer !== void 0) clearTimeout(entry.expiryTimer);
		entry.expiryTimer = void 0;
		this.byToken.delete(chatToken);
		if (this.tokenByParent.get(entry.parentSessionId) === chatToken) this.tokenByParent.delete(entry.parentSessionId);
	}
	async disposeAll() {
		const entries = [...this.byToken.values()];
		this.byToken.clear();
		this.tokenByParent.clear();
		await Promise.allSettled(entries.map(async (entry) => {
			if (entry.expiryTimer !== void 0) clearTimeout(entry.expiryTimer);
			entry.expiryTimer = void 0;
			entry.closing = true;
			entry.abort.abort();
			await (entry.handle ?? await entry.creation?.catch(() => void 0))?.dispose();
			const workspace = this.ctx.get("workspaceRegistry");
			if (workspace !== void 0) await workspace.archiveSession(entry.childSessionId).catch(() => void 0);
		}));
	}
};
//#endregion
//#region src/index.ts
const name = "dsh-side-chat";
function apply(ctx) {
	ctx.plugin(SideChatService);
}
//#endregion
export { READ_ONLY_TOOL_CANDIDATES, READ_ONLY_TOOL_SET, SideChatService, apply, completedTurnSeed, isSideChatToolAllowed, name };
