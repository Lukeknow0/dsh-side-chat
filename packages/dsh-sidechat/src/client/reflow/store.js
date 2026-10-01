/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} StorageLike */
/**
 * @typedef {{
 *   id: string,
 *   parentSessionId: string,
 *   childSessionId: string,
 *   turnId: string,
 *   question: string,
 *   answer: string,
 * }} ReflowItem
 */

const STORAGE_KEY = 'dsh-sidechat.pending-reflow.v1'

/** @param {unknown} value */
function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

/** @param {Record<string, unknown>} record @param {string} field @param {boolean} [identifier] @returns {string} */
function readField(record, field, identifier = false) {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Reflow item ${field} must be a non-empty string.`)
  }
  if (identifier && value.trim() !== value) {
    throw new TypeError(`Reflow item ${field} must not contain surrounding whitespace.`)
  }
  return value
}

/** @param {unknown} value @returns {ReflowItem} */
function normalizeItem(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Reflow item must be an object.')
  }
  const record = /** @type {Record<string, unknown>} */ (value)
  return {
    id: readField(record, 'id', true),
    parentSessionId: readField(record, 'parentSessionId', true),
    childSessionId: readField(record, 'childSessionId', true),
    turnId: readField(record, 'turnId', true),
    question: readField(record, 'question'),
    answer: readField(record, 'answer'),
  }
}

/** @param {ReflowItem} item @returns {ReflowItem} */
function cloneItem(item) {
  return { ...item }
}

/** @param {StorageLike | null | undefined} storage @returns {ReflowItem[]} */
function load(storage) {
  if (storage === null || storage === undefined) return []
  let raw
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (raw === null) return []

  try {
    const snapshot = JSON.parse(raw)
    if (
      snapshot === null
      || typeof snapshot !== 'object'
      || snapshot.version !== 1
      || !Array.isArray(snapshot.items)
    ) return []

    const items = []
    const ids = new Set()
    for (const candidate of snapshot.items) {
      try {
        const item = normalizeItem(candidate)
        if (ids.has(item.id)) continue
        ids.add(item.id)
        items.push(item)
      } catch {
        // A corrupt row cannot make another parent's valid queue unavailable.
      }
    }
    return items
  } catch {
    return []
  }
}

/** @param {StorageLike | null | undefined} storage @param {readonly ReflowItem[]} items */
function persist(storage, items) {
  if (storage === null || storage === undefined) return
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items }))
}

/**
 * Create a pending reflow queue isolated by parent Session.
 *
 * @param {{ storage?: StorageLike | null }} [options]
 */
export function createReflowStore({ storage = null } = {}) {
  let items = load(storage)

  /** @param {ReflowItem[]} next */
  function replace(next) {
    persist(storage, next)
    items = next
  }

  return {
    /** @param {unknown} value */
    add(value) {
      const item = normalizeItem(value)
      if (items.some((candidate) => candidate.id === item.id)) {
        throw new TypeError(`Reflow item ${item.id} already exists.`)
      }
      replace([...items, item])
      return cloneItem(item)
    },

    /** @param {string} id */
    remove(id) {
      const index = items.findIndex((item) => item.id === id)
      if (index === -1) return false
      replace([...items.slice(0, index), ...items.slice(index + 1)])
      return true
    },

    /** @param {string} parentSessionId */
    clear(parentSessionId) {
      if (!requiredString(parentSessionId)) {
        throw new TypeError('Parent session ID must be a non-empty string.')
      }
      const next = items.filter((item) => item.parentSessionId !== parentSessionId)
      if (next.length !== items.length) replace(next)
    },

    /** @param {string} parentSessionId */
    list(parentSessionId) {
      if (!requiredString(parentSessionId)) {
        throw new TypeError('Parent session ID must be a non-empty string.')
      }
      return items
        .filter((item) => item.parentSessionId === parentSessionId)
        .map(cloneItem)
    },
  }
}
