import { z } from "zod";
//#region src/shared/remote.ts
const sideChatErrorCodeSchema = z.enum([
	"parent-not-found",
	"no-completed-turn",
	"already-open",
	"not-open",
	"invalid-input",
	"compatibility",
	"cancelled",
	"internal"
]);
const sideChatErrorSchema = z.object({
	code: sideChatErrorCodeSchema,
	message: z.string()
}).strict();
const startSideChatRequestSchema = z.object({
	parentSessionId: z.string().min(1).max(256),
	chatToken: z.string().uuid()
}).strict();
const startSideChatValueSchema = z.object({
	parentSessionId: z.string(),
	childSessionId: z.string(),
	chatToken: z.string().uuid(),
	seedLength: z.number().int().nonnegative(),
	cleanupMode: z.enum(["archive-on-close", "runtime-only"])
}).strict();
const startSideChatResultSchema = z.discriminatedUnion("ok", [z.object({
	ok: z.literal(true),
	value: startSideChatValueSchema
}).strict(), z.object({
	ok: z.literal(false),
	error: sideChatErrorSchema
}).strict()]);
const readSideChatRequestSchema = z.object({ chatToken: z.string().uuid() }).strict();
const sideChatTranscriptMessageSchema = z.object({
	id: z.string(),
	role: z.enum(["user", "assistant"]),
	text: z.string()
}).strict();
const readSideChatResultSchema = z.discriminatedUnion("ok", [z.object({
	ok: z.literal(true),
	value: z.object({
		chatToken: z.string().uuid(),
		revision: z.number().int().nonnegative(),
		messages: z.array(sideChatTranscriptMessageSchema),
		partial: z.string(),
		running: z.boolean(),
		runningTool: z.string().optional()
	}).strict()
}).strict(), z.object({
	ok: z.literal(false),
	error: sideChatErrorSchema
}).strict()]);
const sendSideChatRequestSchema = z.object({
	chatToken: z.string().uuid(),
	requestId: z.string().uuid(),
	text: z.string().trim().min(1).max(1e5)
}).strict();
const sendSideChatValueSchema = z.object({
	chatToken: z.string().uuid(),
	requestId: z.string().uuid(),
	accepted: z.literal(true),
	messageId: z.string()
}).strict();
const sendSideChatResultSchema = z.discriminatedUnion("ok", [z.object({
	ok: z.literal(true),
	value: sendSideChatValueSchema
}).strict(), z.object({
	ok: z.literal(false),
	error: sideChatErrorSchema
}).strict()]);
const cancelSideChatRequestSchema = z.object({ chatToken: z.string().uuid() }).strict();
const cancelSideChatResultSchema = z.discriminatedUnion("ok", [z.object({
	ok: z.literal(true),
	value: z.object({
		chatToken: z.string().uuid(),
		accepted: z.literal(true)
	}).strict()
}).strict(), z.object({
	ok: z.literal(false),
	error: sideChatErrorSchema
}).strict()]);
const closeSideChatRequestSchema = z.object({ chatToken: z.string().uuid() }).strict();
const closeSideChatValueSchema = z.object({
	chatToken: z.string().uuid(),
	closed: z.boolean(),
	cleanup: z.enum([
		"archived",
		"runtime-only",
		"absent"
	]),
	warning: z.string().optional()
}).strict();
const closeSideChatResultSchema = z.discriminatedUnion("ok", [z.object({
	ok: z.literal(true),
	value: closeSideChatValueSchema
}).strict(), z.object({
	ok: z.literal(false),
	error: sideChatErrorSchema
}).strict()]);
//#endregion
//#region src/remote-descriptors.ts
function directDescriptor(method, requestSymbol, requestSchema, resultSymbol, resultSchema, line) {
	return {
		id: `dsh-side-chat#sideChat/${method}`,
		service: "sideChat",
		namespace: "sideChat",
		method,
		invocation: { kind: "direct" },
		parameters: [{
			name: "request",
			wire: "request",
			source: "json",
			codec: {
				mode: "strict",
				typeSymbol: `dsh-side-chat#${requestSymbol}`,
				schema: requestSchema
			}
		}],
		result: {
			mode: "strict",
			typeSymbol: `dsh-side-chat#${resultSymbol}`,
			schema: resultSchema
		},
		sourceLocation: {
			file: "src/host/side-chat-service.ts",
			line,
			column: 3
		}
	};
}
const sideChatRemoteDescriptors = Object.freeze([
	directDescriptor("start", "StartSideChatRequest", startSideChatRequestSchema, "StartSideChatResult", startSideChatResultSchema, 90),
	directDescriptor("read", "ReadSideChatRequest", readSideChatRequestSchema, "ReadSideChatResult", readSideChatResultSchema, 160),
	directDescriptor("send", "SendSideChatRequest", sendSideChatRequestSchema, "SendSideChatResult", sendSideChatResultSchema, 160),
	directDescriptor("cancel", "CancelSideChatRequest", cancelSideChatRequestSchema, "CancelSideChatResult", cancelSideChatResultSchema, 195),
	directDescriptor("close", "CloseSideChatRequest", closeSideChatRequestSchema, "CloseSideChatResult", closeSideChatResultSchema, 210)
]);
//#endregion
export { sideChatRemoteDescriptors as t };
