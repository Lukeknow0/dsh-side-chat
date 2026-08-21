import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { sideChatRemoteDescriptors } from '../remote-descriptors.ts'
import type {
  CancelSideChatRequest, CancelSideChatResult, CloseSideChatRequest, CloseSideChatResult,
  ReadSideChatRequest, ReadSideChatResult, SendSideChatRequest, SendSideChatResult, StartSideChatRequest, StartSideChatResult,
} from '../shared/remote.ts'

export interface SideChatRemoteNamespace {
  start: (request: StartSideChatRequest) => Promise<RemoteResult<StartSideChatResult>>
  read: (request: ReadSideChatRequest) => Promise<RemoteResult<ReadSideChatResult>>
  send: (request: SendSideChatRequest) => Promise<RemoteResult<SendSideChatResult>>
  cancel: (request: CancelSideChatRequest) => Promise<RemoteResult<CancelSideChatResult>>
  close: (request: CloseSideChatRequest) => Promise<RemoteResult<CloseSideChatResult>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'sideChat/start': SideChatRemoteNamespace['start']
    'sideChat/read': SideChatRemoteNamespace['read']
    'sideChat/send': SideChatRemoteNamespace['send']
    'sideChat/cancel': SideChatRemoteNamespace['cancel']
    'sideChat/close': SideChatRemoteNamespace['close']
  }
  interface TypertRemoteNamespaceMap { sideChat: SideChatRemoteNamespace }
}

export const TYPERT_REMOTE: TypertRemoteContribution = { package: 'dsh-side-chat', descriptors: sideChatRemoteDescriptors }
export default TYPERT_REMOTE
