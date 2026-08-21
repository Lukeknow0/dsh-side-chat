import type { Context } from '@deepseek-ai/cordis'
import { SideChatService } from './host/side-chat-service.ts'

export const name = 'dsh-side-chat'

export function apply(ctx: Context): void {
  ctx.plugin(SideChatService)
}

export { SideChatService, completedTurnSeed } from './host/side-chat-service.ts'
export { isSideChatToolAllowed, READ_ONLY_TOOL_CANDIDATES, READ_ONLY_TOOL_SET } from './shared/tool-policy.ts'
export type * from './shared/remote.ts'
