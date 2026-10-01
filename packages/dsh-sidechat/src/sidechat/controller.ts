import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { health } from '../health.js'
import { mapSidechatRemoteError } from './errors.js'
import type {
  AnswerQuestionInput,
  ChildInput,
  EventsInput,
  ListInput,
  ParentInput,
  PromptInput,
  RenameInput,
  ResolveApprovalInput,
  SelectModelInput,
  SelectPermissionInput,
  SidechatConfiguration,
  SidechatConfigurationCatalogs,
  SidechatEventPage,
  SidechatModelSelection,
  SidechatThreadSummary,
} from './types.js'

interface SidechatOperationsContract {
  answerQuestion(input: AnswerQuestionInput): Promise<{ answered: true }>
  archive(input: ChildInput): Promise<{ ok: true }>
  cancel(input: ChildInput): Promise<{ accepted: true }>
  configuration(input: ChildInput, signal: AbortSignal): Promise<SidechatConfiguration>
  configurationCatalogs(): Promise<SidechatConfigurationCatalogs>
  events(input: EventsInput, signal: AbortSignal): Promise<SidechatEventPage>
  info(input: ChildInput): Promise<SidechatThreadSummary>
  list(input: ListInput): Promise<{ threads: readonly SidechatThreadSummary[] }>
  prompt(input: PromptInput, signal: AbortSignal): Promise<{ accepted: true }>
  rename(input: RenameInput): Promise<{ ok: true }>
  resolveApproval(input: ResolveApprovalInput): Promise<{ resolved: true }>
  selectModel(input: SelectModelInput): Promise<{ selected: SidechatModelSelection }>
  selectPermission(input: SelectPermissionInput): Promise<{ selected: string }>
  start(input: ParentInput): Promise<{ childSessionId: string }>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'sidechat/not-found': { readonly childSessionId: string }
    'sidechat/archived': { readonly childSessionId: string }
    'sidechat/session-unavailable': { readonly childSessionId: string }
    'sidechat/cursor-invalid': { readonly childSessionId: string; readonly committedCursor?: number }
    'sidechat/model-unavailable': {
      readonly childSessionId: string
      readonly provider: string
      readonly model: string
      readonly reasoningEffort?: string
    }
    'sidechat/permission-unavailable': { readonly childSessionId: string; readonly permissionPreset: string }
    'sidechat/risk-acknowledgement-required': { readonly childSessionId: string; readonly permissionPreset: string }
    'sidechat/child-running': { readonly childSessionId: string }
    'sidechat/interaction-not-found': { readonly childSessionId: string; readonly interactionId: string }
    'sidechat/interaction-stale': { readonly childSessionId: string; readonly interactionId: string }
    'sidechat/interaction-response-invalid': { readonly childSessionId: string; readonly interactionId: string }
  }
}

export class SidechatController extends TypertRemoteService {
  constructor(ctx: Context, private readonly operations: SidechatOperationsContract) {
    super(ctx, 'sideChatController', { namespace: 'sideChat' })
  }

  @Remote('answerQuestion')
  answerQuestion(input: AnswerQuestionInput): Promise<{ answered: true }> {
    return this.invoke(() => this.operations.answerQuestion(input))
  }

  @Remote('archive')
  archive(input: ChildInput): Promise<{ ok: true }> {
    return this.invoke(() => this.operations.archive(input))
  }

  @Remote('cancel')
  cancel(input: ChildInput): Promise<{ accepted: true }> {
    return this.invoke(() => this.operations.cancel(input))
  }

  @Remote('configuration')
  configuration(input: ChildInput, signal: AbortSignal): Promise<SidechatConfiguration> {
    return this.invoke(() => this.operations.configuration(input, signal))
  }

  @Remote('configurationCatalogs')
  configurationCatalogs(): Promise<SidechatConfigurationCatalogs> {
    return this.invoke(() => this.operations.configurationCatalogs())
  }

  @Remote('events')
  events(input: EventsInput, signal: AbortSignal): Promise<SidechatEventPage> {
    return this.invoke(() => this.operations.events(input, signal))
  }

  @Remote('info')
  info(input: ChildInput): Promise<SidechatThreadSummary> {
    return this.invoke(() => this.operations.info(input))
  }

  @Remote('list')
  list(input: ListInput): Promise<{ threads: readonly SidechatThreadSummary[] }> {
    return this.invoke(() => this.operations.list(input))
  }

  @Remote('ping')
  ping(): { ok: true } {
    return health()
  }

  @Remote('prompt')
  prompt(input: PromptInput, signal: AbortSignal): Promise<{ accepted: true }> {
    return this.invoke(() => this.operations.prompt(input, signal))
  }

  @Remote('rename')
  rename(input: RenameInput): Promise<{ ok: true }> {
    return this.invoke(() => this.operations.rename(input))
  }

  @Remote('resolveApproval')
  resolveApproval(input: ResolveApprovalInput): Promise<{ resolved: true }> {
    return this.invoke(() => this.operations.resolveApproval(input))
  }

  @Remote('selectModel')
  selectModel(input: SelectModelInput): Promise<{ selected: SidechatModelSelection }> {
    return this.invoke(() => this.operations.selectModel(input))
  }

  @Remote('selectPermission')
  selectPermission(input: SelectPermissionInput): Promise<{ selected: string }> {
    return this.invoke(() => this.operations.selectPermission(input))
  }

  @Remote('start')
  start(input: ParentInput): Promise<{ childSessionId: string }> {
    return this.invoke(() => this.operations.start(input))
  }

  private async invoke<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      throw mapSidechatRemoteError(error)
    }
  }
}
