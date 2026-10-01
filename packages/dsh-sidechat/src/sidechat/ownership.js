/**
 * Thread association ownership service for dsh-sidechat.
 */
import { ThreadRecordSchema, SCHEMA_VERSION } from './storage.js'

export class OwnershipError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'OwnershipError'
    this.code = code
  }
}

function toSummary(record) {
  return {
    childSessionId: record.childSessionId,
    parentSessionId: record.parentSessionId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    archivedAt: record.archivedAt,
  }
}

export class OwnershipStore {
  constructor(table) {
    this.table = table
  }

  async create(input) {
    const { parentSessionId, childSessionId, title = '' } = input
    const existing = this.table.get(childSessionId)

    if (existing !== undefined) {
      if (existing.parentSessionId === parentSessionId) {
        return existing
      }
      throw new OwnershipError(
        'child-already-owned',
        `childSessionId "${childSessionId}" is already owned by a different parent`,
      )
    }

    const now = Date.now()
    const record = {
      schemaVersion: SCHEMA_VERSION,
      parentSessionId,
      childSessionId,
      createdAt: now,
      updatedAt: now,
      title,
    }

    ThreadRecordSchema.parse(record)
    await this.table.put(childSessionId, record)
    return record
  }

  resolve(childSessionId, expectedParentSessionId) {
    const record = this.table.get(childSessionId)
    if (record === undefined) {
      throw new OwnershipError('not-found', `thread "${childSessionId}" not found`)
    }
    if (
      expectedParentSessionId !== undefined &&
      record.parentSessionId !== expectedParentSessionId
    ) {
      throw new OwnershipError(
        'parent-mismatch',
        `thread "${childSessionId}" does not belong to the supplied parent`,
      )
    }
    return record
  }

  listByParent(parentSessionId, options) {
    const { includeArchived = false } = options ?? {}
    const results = []

    for (const [, record] of this.table.entries()) {
      if (record.parentSessionId !== parentSessionId) continue
      if (!includeArchived && record.archivedAt !== undefined) continue
      results.push(toSummary(record))
    }

    results.sort((a, b) => a.createdAt - b.createdAt)
    return results
  }

  async rename(childSessionId, parentSessionId, title) {
    this.resolve(childSessionId, parentSessionId)

    return this.table.update(childSessionId, (rec) => ({
      ...rec,
      title,
      updatedAt: Date.now(),
    }))
  }

  async archive(childSessionId, parentSessionId) {
    this.resolve(childSessionId, parentSessionId)

    return this.table.update(childSessionId, (rec) => {
      if (rec.archivedAt !== undefined) return rec
      return { ...rec, archivedAt: Date.now(), updatedAt: Date.now() }
    })
  }
}
