import '@deepseek-ai/dsh-api-remotes/client'
import '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import '@deepseek-ai/dsh-client-ui-layout/client'
import '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { applySidechatClient } from '../src/client/plugin.js'

declare const ctx: Context
declare const remoteContribution: TypertRemoteContribution

void applySidechatClient(ctx, remoteContribution)
