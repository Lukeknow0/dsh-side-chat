import { z } from "zod";
//#region src/shared/remote.d.ts
declare const sideChatErrorCodeSchema: z.ZodEnum<{
  "parent-not-found": "parent-not-found";
  "no-completed-turn": "no-completed-turn";
  "already-open": "already-open";
  "not-open": "not-open";
  "invalid-input": "invalid-input";
  compatibility: "compatibility";
  cancelled: "cancelled";
  internal: "internal";
}>;
type SideChatErrorCode = z.infer<typeof sideChatErrorCodeSchema>;
declare const sideChatErrorSchema: z.ZodObject<{
  code: z.ZodEnum<{
    "parent-not-found": "parent-not-found";
    "no-completed-turn": "no-completed-turn";
    "already-open": "already-open";
    "not-open": "not-open";
    "invalid-input": "invalid-input";
    compatibility: "compatibility";
    cancelled: "cancelled";
    internal: "internal";
  }>;
  message: z.ZodString;
}, z.core.$strict>;
type SideChatError = z.infer<typeof sideChatErrorSchema>;
declare const startSideChatRequestSchema: z.ZodObject<{
  parentSessionId: z.ZodString;
  chatToken: z.ZodString;
}, z.core.$strict>;
type StartSideChatRequest = z.infer<typeof startSideChatRequestSchema>;
declare const startSideChatValueSchema: z.ZodObject<{
  parentSessionId: z.ZodString;
  childSessionId: z.ZodString;
  chatToken: z.ZodString;
  seedLength: z.ZodNumber;
  expiresAt: z.ZodNumber;
  cleanupMode: z.ZodEnum<{
    "archive-on-close": "archive-on-close";
    "runtime-only": "runtime-only";
  }>;
}, z.core.$strict>;
type StartSideChatValue = z.infer<typeof startSideChatValueSchema>;
declare const startSideChatResultSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  ok: z.ZodLiteral<true>;
  value: z.ZodObject<{
    parentSessionId: z.ZodString;
    childSessionId: z.ZodString;
    chatToken: z.ZodString;
    seedLength: z.ZodNumber;
    expiresAt: z.ZodNumber;
    cleanupMode: z.ZodEnum<{
      "archive-on-close": "archive-on-close";
      "runtime-only": "runtime-only";
    }>;
  }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodObject<{
    code: z.ZodEnum<{
      "parent-not-found": "parent-not-found";
      "no-completed-turn": "no-completed-turn";
      "already-open": "already-open";
      "not-open": "not-open";
      "invalid-input": "invalid-input";
      compatibility: "compatibility";
      cancelled: "cancelled";
      internal: "internal";
    }>;
    message: z.ZodString;
  }, z.core.$strict>;
}, z.core.$strict>], "ok">;
type StartSideChatResult = z.infer<typeof startSideChatResultSchema>;
declare const readSideChatRequestSchema: z.ZodObject<{
  chatToken: z.ZodString;
}, z.core.$strict>;
type ReadSideChatRequest = z.infer<typeof readSideChatRequestSchema>;
declare const sideChatTranscriptMessageSchema: z.ZodObject<{
  id: z.ZodString;
  role: z.ZodEnum<{
    user: "user";
    assistant: "assistant";
  }>;
  text: z.ZodString;
}, z.core.$strict>;
type SideChatTranscriptMessage = z.infer<typeof sideChatTranscriptMessageSchema>;
declare const readSideChatResultSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  ok: z.ZodLiteral<true>;
  value: z.ZodObject<{
    chatToken: z.ZodString;
    revision: z.ZodNumber;
    expiresAt: z.ZodNumber;
    messages: z.ZodArray<z.ZodObject<{
      id: z.ZodString;
      role: z.ZodEnum<{
        user: "user";
        assistant: "assistant";
      }>;
      text: z.ZodString;
    }, z.core.$strict>>;
    partial: z.ZodString;
    running: z.ZodBoolean;
    runningTool: z.ZodOptional<z.ZodString>;
  }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodObject<{
    code: z.ZodEnum<{
      "parent-not-found": "parent-not-found";
      "no-completed-turn": "no-completed-turn";
      "already-open": "already-open";
      "not-open": "not-open";
      "invalid-input": "invalid-input";
      compatibility: "compatibility";
      cancelled: "cancelled";
      internal: "internal";
    }>;
    message: z.ZodString;
  }, z.core.$strict>;
}, z.core.$strict>], "ok">;
type ReadSideChatResult = z.infer<typeof readSideChatResultSchema>;
declare const sendSideChatRequestSchema: z.ZodObject<{
  chatToken: z.ZodString;
  requestId: z.ZodString;
  text: z.ZodString;
}, z.core.$strict>;
type SendSideChatRequest = z.infer<typeof sendSideChatRequestSchema>;
declare const sendSideChatValueSchema: z.ZodObject<{
  chatToken: z.ZodString;
  requestId: z.ZodString;
  accepted: z.ZodLiteral<true>;
  messageId: z.ZodString;
}, z.core.$strict>;
type SendSideChatValue = z.infer<typeof sendSideChatValueSchema>;
declare const sendSideChatResultSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  ok: z.ZodLiteral<true>;
  value: z.ZodObject<{
    chatToken: z.ZodString;
    requestId: z.ZodString;
    accepted: z.ZodLiteral<true>;
    messageId: z.ZodString;
  }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodObject<{
    code: z.ZodEnum<{
      "parent-not-found": "parent-not-found";
      "no-completed-turn": "no-completed-turn";
      "already-open": "already-open";
      "not-open": "not-open";
      "invalid-input": "invalid-input";
      compatibility: "compatibility";
      cancelled: "cancelled";
      internal: "internal";
    }>;
    message: z.ZodString;
  }, z.core.$strict>;
}, z.core.$strict>], "ok">;
type SendSideChatResult = z.infer<typeof sendSideChatResultSchema>;
declare const cancelSideChatRequestSchema: z.ZodObject<{
  chatToken: z.ZodString;
}, z.core.$strict>;
type CancelSideChatRequest = z.infer<typeof cancelSideChatRequestSchema>;
declare const cancelSideChatResultSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  ok: z.ZodLiteral<true>;
  value: z.ZodObject<{
    chatToken: z.ZodString;
    accepted: z.ZodLiteral<true>;
  }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodObject<{
    code: z.ZodEnum<{
      "parent-not-found": "parent-not-found";
      "no-completed-turn": "no-completed-turn";
      "already-open": "already-open";
      "not-open": "not-open";
      "invalid-input": "invalid-input";
      compatibility: "compatibility";
      cancelled: "cancelled";
      internal: "internal";
    }>;
    message: z.ZodString;
  }, z.core.$strict>;
}, z.core.$strict>], "ok">;
type CancelSideChatResult = z.infer<typeof cancelSideChatResultSchema>;
declare const closeSideChatRequestSchema: z.ZodObject<{
  chatToken: z.ZodString;
}, z.core.$strict>;
type CloseSideChatRequest = z.infer<typeof closeSideChatRequestSchema>;
declare const closeSideChatValueSchema: z.ZodObject<{
  chatToken: z.ZodString;
  closed: z.ZodBoolean;
  cleanup: z.ZodEnum<{
    "runtime-only": "runtime-only";
    archived: "archived";
    absent: "absent";
  }>;
  warning: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
type CloseSideChatValue = z.infer<typeof closeSideChatValueSchema>;
declare const closeSideChatResultSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  ok: z.ZodLiteral<true>;
  value: z.ZodObject<{
    chatToken: z.ZodString;
    closed: z.ZodBoolean;
    cleanup: z.ZodEnum<{
      "runtime-only": "runtime-only";
      archived: "archived";
      absent: "absent";
    }>;
    warning: z.ZodOptional<z.ZodString>;
  }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
  ok: z.ZodLiteral<false>;
  error: z.ZodObject<{
    code: z.ZodEnum<{
      "parent-not-found": "parent-not-found";
      "no-completed-turn": "no-completed-turn";
      "already-open": "already-open";
      "not-open": "not-open";
      "invalid-input": "invalid-input";
      compatibility: "compatibility";
      cancelled: "cancelled";
      internal: "internal";
    }>;
    message: z.ZodString;
  }, z.core.$strict>;
}, z.core.$strict>], "ok">;
type CloseSideChatResult = z.infer<typeof closeSideChatResultSchema>;
//#endregion
export { startSideChatRequestSchema as A, readSideChatResultSchema as C, sideChatErrorCodeSchema as D, sendSideChatValueSchema as E, startSideChatValueSchema as M, sideChatErrorSchema as O, readSideChatRequestSchema as S, sendSideChatResultSchema as T, cancelSideChatRequestSchema as _, CloseSideChatValue as a, closeSideChatResultSchema as b, SendSideChatRequest as c, SideChatError as d, SideChatErrorCode as f, StartSideChatValue as g, StartSideChatResult as h, CloseSideChatResult as i, startSideChatResultSchema as j, sideChatTranscriptMessageSchema as k, SendSideChatResult as l, StartSideChatRequest as m, CancelSideChatResult as n, ReadSideChatRequest as o, SideChatTranscriptMessage as p, CloseSideChatRequest as r, ReadSideChatResult as s, CancelSideChatRequest as t, SendSideChatValue as u, cancelSideChatResultSchema as v, sendSideChatRequestSchema as w, closeSideChatValueSchema as x, closeSideChatRequestSchema as y };