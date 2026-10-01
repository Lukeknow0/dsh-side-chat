/**
 * Plugin-owned storage domain for dsh-sidechat.
 */
import { z } from 'zod'

export const DOMAIN_VERSION = 1
export const SCHEMA_VERSION = 1

export const ThreadRecordSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  parentSessionId: z.string().min(1),
  childSessionId: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  title: z.string(),
  archivedAt: z.number().int().positive().optional(),
})

export function makeDomainSpec(storageDomain) {
  const { defineDomain, domainTable } = storageDomain
  return defineDomain({
    name: 'sidechat_threads',
    version: DOMAIN_VERSION,
    tables: {
      threads: domainTable(ThreadRecordSchema),
    },
    layout: 'per-record',
    invalidRecords: 'backup-and-skip',
  })
}
