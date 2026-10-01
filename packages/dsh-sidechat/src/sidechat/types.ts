export interface SidechatThreadSummary {
  readonly childSessionId: string
  readonly parentSessionId: string
  readonly title: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly status: 'idle' | 'running' | 'needs-input' | 'error' | 'archived'
  readonly provider?: string
  readonly model?: string
  readonly permission?: string
}

/** Wire input accepted by the Host Session Controller prompt path. */
export type SidechatContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; readonly data: string; readonly name?: string }
  | { readonly type: 'file'; readonly receiptId: string }

/** Durable content emitted from persisted Session history. */
export type SidechatEventContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly attachmentId: string; readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; readonly bytes: number; readonly width: number; readonly height: number; readonly name?: string }
  | { readonly type: 'file'; readonly attachmentId: string; readonly name: string; readonly bytes: number }

export type SidechatEvent =
  | { readonly seq: number; readonly kind: 'message'; readonly turnId: string; readonly role: 'user' | 'assistant'; readonly source: 'user' | 'assistant' | 'plugin-injection'; readonly content: readonly SidechatEventContentPart[] }
  | { readonly seq: number; readonly kind: 'turn-start'; readonly turnId: string }
  | { readonly seq: number; readonly kind: 'turn-end'; readonly turnId: string; readonly reason: string }
  | { readonly seq: number; readonly kind: 'tool'; readonly turnId: string; readonly callId: string; readonly name: string; readonly state: 'running' | 'succeeded' | 'failed'; readonly summary?: string }
  | { readonly seq: number; readonly kind: 'interaction'; readonly turnId: string; readonly interactionId: string; readonly interactionKind: 'approval' | 'question'; readonly state: 'pending' | 'resolved' | 'expired'; readonly prompt: string }
  | { readonly seq: number; readonly kind: 'error'; readonly turnId?: string; readonly message: string }

export interface SidechatLiveSnapshot {
  readonly childSessionId: string
  readonly attemptId: string
  readonly turnId: string
  readonly step: number
  readonly text: string
  readonly truncated: boolean
}

export interface SidechatQuestionSnapshot {
  readonly id: string
  readonly question: string
  readonly detail?: string
  readonly header?: string
  readonly options?: readonly { readonly label: string; readonly description?: string }[]
  readonly multiSelect?: boolean
}

export interface SidechatQuestionRequestSnapshot {
  readonly childSessionId: string
  readonly requestId: string
  readonly questions: readonly SidechatQuestionSnapshot[]
  readonly truncated: boolean
}

export interface SidechatLiveErrorSnapshot {
  readonly childSessionId: string
  readonly turnId: string
  readonly step: number
  readonly message: string
  readonly code?: string
  readonly truncated: boolean
}

export interface SidechatTransientSnapshot {
  readonly questions: readonly SidechatQuestionRequestSnapshot[]
  readonly error: SidechatLiveErrorSnapshot | null
}

export interface SidechatEventPage {
  readonly events: readonly SidechatEvent[]
  /** Exclusive sequence cursor to pass back as the next request's afterSeq. */
  readonly nextSeq: number
  /** Current bounded assistant attempt; durable events remain authoritative. */
  readonly live: SidechatLiveSnapshot | null
  /** Process-local child state that is replaced on every poll. */
  readonly transient: SidechatTransientSnapshot
}

export interface ParentInput {
  readonly parentSessionId: string
}

export interface ChildInput {
  readonly childSessionId: string
}

export interface ListInput extends ParentInput {
  readonly includeArchived?: boolean
}

export interface RenameInput extends ChildInput {
  readonly title: string
}

export interface PromptInput extends ChildInput {
  readonly requestId: string
  readonly content: readonly SidechatContentPart[]
}

export interface EventsInput extends ChildInput {
  readonly afterSeq?: number
}

export interface SidechatModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}

export interface SidechatModelCatalog {
  readonly default: SidechatModelSelection
  readonly routableProviders: readonly string[]
  readonly groups: readonly {
    readonly id: string
    readonly name: string
    readonly models: readonly {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly reasoning?: {
        readonly efforts: readonly { readonly id: string; readonly name: string; readonly description?: string }[]
        readonly defaultEffort?: string
      }
    }[]
  }[]
  readonly failures: readonly { readonly id: string; readonly name: string; readonly message: string }[]
}

export interface SidechatConfigurationCatalogs {
  readonly models: SidechatModelCatalog
  readonly agentPresets: {
    readonly presets: readonly {
      readonly id: string
      readonly isDefault: boolean
      readonly name?: string
      readonly description?: string
      readonly broken?: string
    }[]
  }
  readonly permissions: {
    readonly options: readonly { readonly value: string; readonly name: string; readonly description?: string }[]
    readonly defaultOptions: readonly { readonly value: string; readonly name: string; readonly description?: string }[]
    readonly defaultPreset: string
  }
}

export interface SidechatConfiguration {
  readonly model: SidechatModelSelection
  readonly agentPreset: string | null
  readonly permissionPreset: string
  readonly agentPresetMutable: false
}

export interface SelectModelInput extends ChildInput, SidechatModelSelection {}

export interface SelectPermissionInput extends ChildInput {
  readonly permissionPreset: string
  readonly riskAcknowledged: boolean
}

export interface SidechatQuestionAnswer {
  readonly id: string
  readonly selected: readonly string[]
  readonly custom?: string
}

export interface AnswerQuestionInput extends ChildInput {
  readonly requestId: string
  readonly answers: readonly SidechatQuestionAnswer[]
}

export interface ResolveApprovalInput extends ChildInput {
  readonly interactionId: string
  readonly decision: 'allowed-once' | 'rejected'
}
