import { A as startSideChatRequestSchema, C as readSideChatResultSchema, D as sideChatErrorCodeSchema, E as sendSideChatValueSchema, M as startSideChatValueSchema, O as sideChatErrorSchema, S as readSideChatRequestSchema, T as sendSideChatResultSchema, _ as cancelSideChatRequestSchema, a as CloseSideChatValue, b as closeSideChatResultSchema, c as SendSideChatRequest, d as SideChatError, f as SideChatErrorCode, g as StartSideChatValue, h as StartSideChatResult, i as CloseSideChatResult, j as startSideChatResultSchema, k as sideChatTranscriptMessageSchema, l as SendSideChatResult, m as StartSideChatRequest, n as CancelSideChatResult, o as ReadSideChatRequest, p as SideChatTranscriptMessage, r as CloseSideChatRequest, s as ReadSideChatResult, t as CancelSideChatRequest, u as SendSideChatValue, v as cancelSideChatResultSchema, w as sendSideChatRequestSchema, x as closeSideChatValueSchema, y as closeSideChatRequestSchema } from "./remote-C2q_fsSd.js";
import { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { SessionEvent } from "@deepseek-ai/dsh-session";
//#region src/host/side-chat-service.d.ts
declare function completedTurnSeed(events: readonly SessionEvent[]): SessionEvent[];
declare class SideChatService extends TypertRemoteService {
  static inject: string[];
  private readonly byToken;
  private readonly tokenByParent;
  constructor(ctx: Context);
  start(request: StartSideChatRequest): Promise<StartSideChatResult>;
  read(request: ReadSideChatRequest): ReadSideChatResult;
  send(request: SendSideChatRequest): Promise<SendSideChatResult>;
  cancel(request: CancelSideChatRequest): Promise<CancelSideChatResult>;
  close(request: CloseSideChatRequest): Promise<CloseSideChatResult>;
  private startValue;
  private forget;
  private disposeAll;
}
//#endregion
//#region src/shared/tool-policy.d.ts
declare const READ_ONLY_TOOL_CANDIDATES: readonly ["read", "read_image", "glob", "grep", "lsp", "view_image", "web_search", "skill", "session_event_read", "session_event_search", "session_event_trace", "session_search", "session_trace", "job_list", "job_output", "terminal_list", "terminal_read", "list_agents", "get_goal", "mnemon_document_search", "mnemon_memory_bodies", "mnemon_recall", "mnemon_related", "mnemon_status"];
declare const READ_ONLY_TOOL_SET: ReadonlySet<string>;
declare function isSideChatToolAllowed(name: string): boolean;
//#endregion
//#region src/index.d.ts
declare const name = "dsh-side-chat";
declare function apply(ctx: Context): void;
//#endregion
export { type CancelSideChatRequest, type CancelSideChatResult, type CloseSideChatRequest, type CloseSideChatResult, type CloseSideChatValue, READ_ONLY_TOOL_CANDIDATES, READ_ONLY_TOOL_SET, type ReadSideChatRequest, type ReadSideChatResult, type SendSideChatRequest, type SendSideChatResult, type SendSideChatValue, type SideChatError, type SideChatErrorCode, SideChatService, type SideChatTranscriptMessage, type StartSideChatRequest, type StartSideChatResult, type StartSideChatValue, apply, type cancelSideChatRequestSchema, type cancelSideChatResultSchema, type closeSideChatRequestSchema, type closeSideChatResultSchema, type closeSideChatValueSchema, completedTurnSeed, isSideChatToolAllowed, name, type readSideChatRequestSchema, type readSideChatResultSchema, type sendSideChatRequestSchema, type sendSideChatResultSchema, type sendSideChatValueSchema, type sideChatErrorCodeSchema, type sideChatErrorSchema, type sideChatTranscriptMessageSchema, type startSideChatRequestSchema, type startSideChatResultSchema, type startSideChatValueSchema };