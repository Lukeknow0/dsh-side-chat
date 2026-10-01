/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} StorageLike */
/** @typedef {Record<string, unknown> & { id: string }} AnnotationRecord */

const DEFAULT_STORAGE_KEY = 'dsh-sidechat.annotations.v1'

export class AnnotationStoreError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.name = 'AnnotationStoreError'
    this.code = code
  }
}

function defaultIdFactory() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new AnnotationStoreError(
      'annotation/secure-id-unavailable',
      'Secure annotation IDs are unavailable in this runtime.',
    )
  }
  return globalThis.crypto.randomUUID()
}

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param {string} parentSessionId */
function assertParent(parentSessionId) {
  if (typeof parentSessionId !== 'string' || parentSessionId.trim() === '') {
    throw new AnnotationStoreError('annotation/parent-required', 'Parent session ID is required.')
  }
  return parentSessionId
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function cloneInput(value) {
  if (!isRecord(value)) {
    throw new AnnotationStoreError('annotation/record-invalid', 'Annotation must be an object.')
  }
  try {
    const cloned = JSON.parse(JSON.stringify(value))
    if (!isRecord(cloned)) throw new Error('not an object')
    return cloned
  } catch (cause) {
    throw new AnnotationStoreError(
      'annotation/record-invalid',
      `Annotation must be JSON-serializable: ${cause instanceof Error ? cause.message : String(cause)}`,
    )
  }
}

/** @param {AnnotationRecord} record @returns {AnnotationRecord} */
function cloneRecord(record) {
  return /** @type {AnnotationRecord} */ (cloneInput(record))
}

/**
 * @param {StorageLike | null | undefined} storage
 * @param {string} storageKey
 * @returns {Map<string, AnnotationRecord[]>}
 */
function load(storage, storageKey) {
  const state = new Map()
  if (storage === null || storage === undefined) return state
  let raw
  try {
    raw = storage.getItem(storageKey)
  } catch {
    return state
  }
  if (raw === null) return state

  try {
    const parsed = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.parents)) return state
    for (const [parentSessionId, value] of Object.entries(parsed.parents)) {
      if (parentSessionId.trim() === '' || !Array.isArray(value)) continue
      /** @type {AnnotationRecord[]} */
      const rows = []
      const ids = new Set()
      for (const candidate of value) {
        if (!isRecord(candidate) || typeof candidate.id !== 'string' || candidate.id.trim() === '' || ids.has(candidate.id)) continue
        ids.add(candidate.id)
        rows.push(/** @type {AnnotationRecord} */ (candidate))
      }
      if (rows.length > 0) state.set(parentSessionId, rows)
    }
  } catch {
    return new Map()
  }
  return state
}

/**
 * @param {Map<string, AnnotationRecord[]>} state
 * @param {StorageLike | null | undefined} storage
 * @param {string} storageKey
 */
function persist(state, storage, storageKey) {
  if (storage === null || storage === undefined) return
  const parents = Object.create(null)
  for (const [parentSessionId, rows] of state) parents[parentSessionId] = rows
  storage.setItem(storageKey, JSON.stringify({ version: 1, parents }))
}

/**
 * Create a parent-session-isolated annotation store. Storage is optional and
 * contains only caller-supplied serializable annotation records.
 *
 * @param {{
 *   storage?: StorageLike | null,
 *   storageKey?: string,
 *   idFactory?: () => string,
 * }} [options]
 */
export function createAnnotationStore({
  storage = null,
  storageKey = DEFAULT_STORAGE_KEY,
  idFactory = defaultIdFactory,
} = {}) {
  let state = load(storage, storageKey)

  /** @param {string} parentSessionId @param {AnnotationRecord[]} rows */
  function replaceParent(parentSessionId, rows) {
    const next = new Map(state)
    if (rows.length === 0) next.delete(parentSessionId)
    else next.set(parentSessionId, rows)
    persist(next, storage, storageKey)
    state = next
  }

  return {
    /** @param {string} parentSessionId @param {unknown} annotation */
    add(parentSessionId, annotation) {
      const parent = assertParent(parentSessionId)
      const input = cloneInput(annotation)
      const requestedId = typeof input.id === 'string' ? input.id.trim() : ''
      const id = requestedId || idFactory()
      if (typeof id !== 'string' || id.trim() === '') {
        throw new AnnotationStoreError('annotation/id-invalid', 'Annotation ID is invalid.')
      }
      const rows = state.get(parent) ?? []
      if (rows.some((row) => row.id === id)) {
        throw new AnnotationStoreError('annotation/id-conflict', `Annotation ${id} already exists.`)
      }
      const record = /** @type {AnnotationRecord} */ ({ ...input, id })
      replaceParent(parent, [...rows, record])
      return cloneRecord(record)
    },

    /** @param {string} parentSessionId @param {string} id */
    remove(parentSessionId, id) {
      const parent = assertParent(parentSessionId)
      const rows = state.get(parent) ?? []
      const nextRows = rows.filter((row) => row.id !== id)
      if (nextRows.length === rows.length) return false
      replaceParent(parent, nextRows)
      return true
    },

    /** @param {string} parentSessionId @param {string} id @param {unknown} patch */
    update(parentSessionId, id, patch) {
      const parent = assertParent(parentSessionId)
      const rows = state.get(parent) ?? []
      const index = rows.findIndex((row) => row.id === id)
      if (index === -1) return undefined
      const changes = cloneInput(patch)
      const updated = /** @type {AnnotationRecord} */ ({ ...rows[index], ...changes, id })
      const nextRows = [...rows]
      nextRows[index] = updated
      replaceParent(parent, nextRows)
      return cloneRecord(updated)
    },

    /** @param {string} parentSessionId */
    list(parentSessionId) {
      const parent = assertParent(parentSessionId)
      return (state.get(parent) ?? []).map(cloneRecord)
    },
  }
}
