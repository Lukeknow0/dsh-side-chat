//#region src/typert.host.d.ts
declare const TYPERT: {
  readonly package: "dsh-side-chat";
  readonly face: "host";
  readonly schemas: readonly [];
  readonly invocations: readonly {
    id: string;
    service: string;
    namespace: string;
    method: string;
    invocation: {
      kind: "direct";
    };
    parameters: {
      name: string;
      wire: "request";
      source: "json";
      codec: {
        mode: "strict";
        typeSymbol: string;
        schema: import("@deepseek-ai/dsh-typert-protocol").TypertSchema<unknown>;
      };
    }[];
    result: {
      mode: "strict";
      typeSymbol: string;
      schema: import("@deepseek-ai/dsh-typert-protocol").TypertSchema<unknown>;
    };
    sourceLocation: {
      file: string;
      line: number;
      column: number;
    };
  }[];
  readonly model: {
    readonly services: readonly [{
      readonly description: "Creates, reads, prompts, cancels, and closes temporary read-only side conversations.";
      readonly summary: "Temporary side conversations.";
      readonly tags: readonly [];
      readonly jsDoc: "/** Temporary read-only side conversation service. */";
      readonly key: "sideChat";
      readonly exportName: "SideChatService";
      readonly members: readonly [{
        readonly kind: "method";
        readonly name: "start";
        readonly signature: "start(request: StartSideChatRequest): Promise<StartSideChatResult>";
        readonly summary: "Start a temporary side conversation.";
        readonly jsDoc: "/** Start a temporary side conversation. */";
      }, {
        readonly kind: "method";
        readonly name: "read";
        readonly signature: "read(request: ReadSideChatRequest): ReadSideChatResult";
        readonly summary: "Read the live child transcript.";
        readonly jsDoc: "/** Read a Side Chat transcript snapshot. */";
      }, {
        readonly kind: "method";
        readonly name: "send";
        readonly signature: "send(request: SendSideChatRequest): Promise<SendSideChatResult>";
        readonly summary: "Submit a turn to the owned child agent.";
        readonly jsDoc: "/** Submit a side question. */";
      }, {
        readonly kind: "method";
        readonly name: "cancel";
        readonly signature: "cancel(request: CancelSideChatRequest): Promise<CancelSideChatResult>";
        readonly summary: "Cancel active child generation.";
        readonly jsDoc: "/** Cancel active Side Chat work. */";
      }, {
        readonly kind: "method";
        readonly name: "close";
        readonly signature: "close(request: CloseSideChatRequest): Promise<CloseSideChatResult>";
        readonly summary: "Close and clean up a side conversation.";
        readonly jsDoc: "/** Close and clean up a side conversation. */";
      }];
      readonly types: readonly [];
    }];
    readonly events: readonly [];
    readonly objects: readonly [];
  };
};
//#endregion
export { TYPERT, TYPERT as default };