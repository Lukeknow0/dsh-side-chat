import { z } from 'zod'

export const sideChatErrorCodeSchema = z.enum([
  'parent-not-found', 'no-completed-turn', 'already-open', 'not-open', 'invalid-input',
  'compatibility', 'cancelled', 'internal',
])
export type SideChatErrorCode = z.infer<typeof sideChatErrorCodeSchema>

export const sideChatErrorSchema = z.object({ code: sideChatErrorCodeSchema, message: z.string() }).strict()
export type SideChatError = z.infer<typeof sideChatErrorSchema>

export const startSideChatRequestSchema = z.object({
  parentSessionId: z.string().min(1).max(256),
  chatToken: z.string().uuid(),
}).strict()
export type StartSideChatRequest = z.infer<typeof startSideChatRequestSchema>

export const startSideChatValueSchema = z.object({
  parentSessionId: z.string(),
  childSessionId: z.string(),
  chatToken: z.string().uuid(),
  seedLength: z.number().int().nonnegative(),
  cleanupMode: z.enum(['archive-on-close', 'runtime-only']),
}).strict()
export type StartSideChatValue = z.infer<typeof startSideChatValueSchema>

export const startSideChatResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: startSideChatValueSchema }).strict(),
  z.object({ ok: z.literal(false), error: sideChatErrorSchema }).strict(),
])
export type StartSideChatResult = z.infer<typeof startSideChatResultSchema>

export const readSideChatRequestSchema = z.object({ chatToken: z.string().uuid() }).strict()
export type ReadSideChatRequest = z.infer<typeof readSideChatRequestSchema>

export const sideChatTranscriptMessageSchema = z.object({
  id: z.string(), role: z.enum(['user', 'assistant']), text: z.string(),
}).strict()
export type SideChatTranscriptMessage = z.infer<typeof sideChatTranscriptMessageSchema>

export const readSideChatResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.object({
    chatToken: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    messages: z.array(sideChatTranscriptMessageSchema),
    partial: z.string(),
    running: z.boolean(),
    runningTool: z.string().optional(),
  }).strict() }).strict(),
  z.object({ ok: z.literal(false), error: sideChatErrorSchema }).strict(),
])
export type ReadSideChatResult = z.infer<typeof readSideChatResultSchema>

export const sendSideChatRequestSchema = z.object({
  chatToken: z.string().uuid(),
  requestId: z.string().uuid(),
  text: z.string().trim().min(1).max(100_000),
}).strict()
export type SendSideChatRequest = z.infer<typeof sendSideChatRequestSchema>

export const sendSideChatValueSchema = z.object({
  chatToken: z.string().uuid(),
  requestId: z.string().uuid(),
  accepted: z.literal(true),
  messageId: z.string(),
}).strict()
export type SendSideChatValue = z.infer<typeof sendSideChatValueSchema>

export const sendSideChatResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: sendSideChatValueSchema }).strict(),
  z.object({ ok: z.literal(false), error: sideChatErrorSchema }).strict(),
])
export type SendSideChatResult = z.infer<typeof sendSideChatResultSchema>

export const cancelSideChatRequestSchema = z.object({ chatToken: z.string().uuid() }).strict()
export type CancelSideChatRequest = z.infer<typeof cancelSideChatRequestSchema>

export const cancelSideChatResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.object({
    chatToken: z.string().uuid(), accepted: z.literal(true),
  }).strict() }).strict(),
  z.object({ ok: z.literal(false), error: sideChatErrorSchema }).strict(),
])
export type CancelSideChatResult = z.infer<typeof cancelSideChatResultSchema>

export const closeSideChatRequestSchema = z.object({ chatToken: z.string().uuid() }).strict()
export type CloseSideChatRequest = z.infer<typeof closeSideChatRequestSchema>

export const closeSideChatValueSchema = z.object({
  chatToken: z.string().uuid(),
  closed: z.boolean(),
  cleanup: z.enum(['archived', 'runtime-only', 'absent']),
  warning: z.string().optional(),
}).strict()
export type CloseSideChatValue = z.infer<typeof closeSideChatValueSchema>

export const closeSideChatResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: closeSideChatValueSchema }).strict(),
  z.object({ ok: z.literal(false), error: sideChatErrorSchema }).strict(),
])
export type CloseSideChatResult = z.infer<typeof closeSideChatResultSchema>
