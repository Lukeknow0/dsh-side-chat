import { t as sideChatRemoteDescriptors } from "./remote-descriptors-DFf8QRxS.js";
//#region src/typert.host.ts
const TYPERT = {
	package: "dsh-side-chat",
	face: "host",
	schemas: [],
	invocations: sideChatRemoteDescriptors,
	model: {
		services: [{
			description: "Creates, reads, prompts, cancels, and closes temporary read-only side conversations.",
			summary: "Temporary side conversations.",
			tags: [],
			jsDoc: "/** Temporary read-only side conversation service. */",
			key: "sideChat",
			exportName: "SideChatService",
			members: [
				{
					kind: "method",
					name: "start",
					signature: "start(request: StartSideChatRequest): Promise<StartSideChatResult>",
					summary: "Start a temporary side conversation.",
					jsDoc: "/** Start a temporary side conversation. */"
				},
				{
					kind: "method",
					name: "read",
					signature: "read(request: ReadSideChatRequest): ReadSideChatResult",
					summary: "Read the live child transcript.",
					jsDoc: "/** Read a Side Chat transcript snapshot. */"
				},
				{
					kind: "method",
					name: "send",
					signature: "send(request: SendSideChatRequest): Promise<SendSideChatResult>",
					summary: "Submit a turn to the owned child agent.",
					jsDoc: "/** Submit a side question. */"
				},
				{
					kind: "method",
					name: "cancel",
					signature: "cancel(request: CancelSideChatRequest): Promise<CancelSideChatResult>",
					summary: "Cancel active child generation.",
					jsDoc: "/** Cancel active Side Chat work. */"
				},
				{
					kind: "method",
					name: "close",
					signature: "close(request: CloseSideChatRequest): Promise<CloseSideChatResult>",
					summary: "Close and clean up a side conversation.",
					jsDoc: "/** Close and clean up a side conversation. */"
				}
			],
			types: []
		}],
		events: [],
		objects: []
	}
};
//#endregion
export { TYPERT, TYPERT as default };
