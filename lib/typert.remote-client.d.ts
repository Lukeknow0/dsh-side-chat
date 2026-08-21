import { c as SendSideChatRequest, h as StartSideChatResult, i as CloseSideChatResult, l as SendSideChatResult, m as StartSideChatRequest, n as CancelSideChatResult, o as ReadSideChatRequest, r as CloseSideChatRequest, s as ReadSideChatResult, t as CancelSideChatRequest } from "./remote-C2q_fsSd.js";
import { RemoteResult, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
//#region src/client/remote.d.ts
interface SideChatRemoteNamespace {
  start: (request: StartSideChatRequest) => Promise<RemoteResult<StartSideChatResult>>;
  read: (request: ReadSideChatRequest) => Promise<RemoteResult<ReadSideChatResult>>;
  send: (request: SendSideChatRequest) => Promise<RemoteResult<SendSideChatResult>>;
  cancel: (request: CancelSideChatRequest) => Promise<RemoteResult<CancelSideChatResult>>;
  close: (request: CloseSideChatRequest) => Promise<RemoteResult<CloseSideChatResult>>;
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'sideChat/start': SideChatRemoteNamespace['start'];
    'sideChat/read': SideChatRemoteNamespace['read'];
    'sideChat/send': SideChatRemoteNamespace['send'];
    'sideChat/cancel': SideChatRemoteNamespace['cancel'];
    'sideChat/close': SideChatRemoteNamespace['close'];
  }
  interface TypertRemoteNamespaceMap {
    sideChat: SideChatRemoteNamespace;
  }
}
declare const TYPERT_REMOTE: TypertRemoteContribution;
//#endregion
export { SideChatRemoteNamespace, TYPERT_REMOTE, TYPERT_REMOTE as default };