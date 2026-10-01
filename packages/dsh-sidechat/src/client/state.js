/** @typedef {{ getItem(key: string): string | null, setItem(key: string, value: string): void }} StorageLike */
/** @typedef {{ childSessionId: string, parentSessionId: string, title?: string }} ThreadSummary */
/** @typedef {{ selectedChildId?: string, historyIds: string[], drafts: Record<string, string>, tabChildren: Record<string, string>, labels: Record<string, string> }} ParentState */

export const SIDECHAT_UI_STATE_KEY = 'dsh-sidechat/ui-state/v1'
const STATE_VERSION = 1
const EMPTY_PARENT = Object.freeze({
  selectedChildId: undefined,
  historyIds: Object.freeze([]),
  drafts: Object.freeze({}),
  tabChildren: Object.freeze({}),
  labels: Object.freeze({}),
})

function blankDocument() {
  return { version: STATE_VERSION, parents: {} }
}

function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

/** @param {StorageLike | undefined} storage @param {string} key */
function loadDocument(storage, key) {
  if (storage === undefined) return blankDocument()
  try {
    const raw = storage.getItem(key)
    if (raw === null) return blankDocument()
    const parsed = JSON.parse(raw)
    if (parsed?.version !== STATE_VERSION || parsed.parents === null || typeof parsed.parents !== 'object') {
      return blankDocument()
    }
    return parsed
  } catch {
    return blankDocument()
  }
}

/** @param {unknown} value @returns {Record<string, string>} */
function stringRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string'))
}

/** @param {any} value @returns {ParentState | undefined} */
function validParent(value) {
  if (value === null || typeof value !== 'object') return undefined
  return {
    selectedChildId: typeof value.selectedChildId === 'string' ? value.selectedChildId : undefined,
    historyIds: Array.isArray(value.historyIds)
      ? /** @type {string[]} */ (value.historyIds.filter((/** @type {unknown} */ id) => typeof id === 'string'))
      : [],
    drafts: stringRecord(value.drafts),
    tabChildren: stringRecord(value.tabChildren),
    labels: stringRecord(value.labels),
  }
}

/** @param {string[]} values */
function unique(values) {
  return [...new Set(values)]
}

/**
 * Per-parent UI state. Session events remain Host-owned; only selection, history
 * order, and unsent drafts are persisted here.
 * @param {{ storage?: StorageLike, storageKey?: string }} [options]
 */
export function createSidechatThreadState({
  storage,
  storageKey = SIDECHAT_UI_STATE_KEY,
} = {}) {
  storage ??= browserStorage()
  let document = loadDocument(storage, storageKey)
  const listeners = new Set()
  const operationTokens = /** @type {Map<string, number>} */ (new Map())
  const acceptedOperationTokens = /** @type {Map<string, number>} */ (new Map())
  const activeExclusiveOperations = /** @type {Map<string, number>} */ (new Map())
  let operationRevision = 0
  let revision = 0
  let snapshot = { revision, parents: document.parents }

  function persist() {
    try {
      storage?.setItem(storageKey, JSON.stringify(document))
    } catch {
      // UI state persistence is best-effort; a blocked quota must not break chat.
    }
  }

  function publish() {
    revision += 1
    snapshot = { revision, parents: document.parents }
    persist()
    for (const listener of listeners) listener()
  }

  /** @param {string} parentSessionId @returns {ParentState} */
  function readParent(parentSessionId) {
    return validParent(document.parents[parentSessionId]) ?? {
      selectedChildId: undefined,
      historyIds: [],
      drafts: {},
      tabChildren: {},
      labels: {},
    }
  }

  /** @param {string} parentSessionId @param {ParentState} parent */
  function writeParent(parentSessionId, parent) {
    document = {
      version: STATE_VERSION,
      parents: {
        ...document.parents,
        [parentSessionId]: parent,
      },
    }
    publish()
  }

  const pendingTabs = /** @type {Map<string, Promise<string>>} */ (new Map())

  /** Bind UI identity only; closing a native tab never calls remove or a Host operation. */
  /** @param {string} parentSessionId @param {string} contentId @param {string} childSessionId */
  function bindTab(parentSessionId, contentId, childSessionId) {
    const previous = readParent(parentSessionId)
    const pendingDraft = previous.drafts[`new:${contentId}`]
    const drafts = { ...previous.drafts }
    if (pendingDraft !== undefined && !Object.hasOwn(drafts, childSessionId)) drafts[childSessionId] = pendingDraft
    writeParent(parentSessionId, {
      ...previous,
      selectedChildId: childSessionId,
      historyIds: unique([
        ...(previous.selectedChildId === undefined ? [] : [previous.selectedChildId]),
        ...previous.historyIds,
      ]).filter((id) => id !== childSessionId),
      drafts,
      tabChildren: { ...previous.tabChildren, [contentId]: childSessionId },
    })
  }

  return {
    bindTab,

    /** @param {string} parentSessionId @param {string} contentId */
    tabChild(parentSessionId, contentId) {
      return readParent(parentSessionId).tabChildren[contentId]
    },

    /** @param {string} parentSessionId @param {string} contentId @param {() => Promise<string>} create @returns {Promise<string>} */
    ensureTabChild(parentSessionId, contentId, create) {
      const existing = readParent(parentSessionId).tabChildren[contentId]
      if (existing !== undefined) return Promise.resolve(existing)
      const key = JSON.stringify([parentSessionId, contentId])
      const pending = pendingTabs.get(key)
      if (pending !== undefined) return pending
      const operation = Promise.resolve().then(create).then((childSessionId) => {
        if (typeof childSessionId !== 'string' || childSessionId === '') throw new Error('侧聊创建结果缺少会话身份。')
        // Lists requested before this successful fork cannot erase its new UI identity.
        const listKey = `${parentSessionId}\u0000list`
        const token = ++operationRevision
        operationTokens.set(listKey, token)
        acceptedOperationTokens.set(listKey, token)
        bindTab(parentSessionId, contentId, childSessionId)
        return childSessionId
      }).finally(() => { pendingTabs.delete(key) })
      pendingTabs.set(key, operation)
      return operation
    },

    /** @param {string} parentSessionId @param {string} childSessionId */
    label(parentSessionId, childSessionId) {
      return readParent(parentSessionId).labels[childSessionId] ?? '侧聊'
    },

    /** @param {string} parentSessionId @param {string} childSessionId @param {string} text */
    setLabel(parentSessionId, childSessionId, text) {
      const normalized = text.replace(/\s+/g, ' ').trim()
      if (normalized === '') return
      const characters = Array.from(normalized)
      const label = characters.slice(0, 28).join('') + (characters.length > 28 ? '…' : '')
      const previous = readParent(parentSessionId)
      writeParent(parentSessionId, { ...previous, labels: { ...previous.labels, [childSessionId]: label } })
    },

    /** @param {string} parentSessionId @param {string} kind */
    beginOperation(parentSessionId, kind) {
      const token = ++operationRevision
      operationTokens.set(`${parentSessionId}\u0000${kind}`, token)
      return token
    },

    /** @param {string} parentSessionId @param {string} kind @param {number} token */
    isOperationCurrent(parentSessionId, kind, token) {
      return operationTokens.get(`${parentSessionId}\u0000${kind}`) === token
    },

    /** Accept the newest successful response, not merely the newest request. */
    /** @param {string} parentSessionId @param {string} kind @param {number} token */
    acceptOperationSuccess(parentSessionId, kind, token) {
      const key = `${parentSessionId}\u0000${kind}`
      const accepted = acceptedOperationTokens.get(key) ?? 0
      if (token <= accepted) return false
      acceptedOperationTokens.set(key, token)
      return true
    },

    /** @param {string} parentSessionId @param {string} kind */
    acquireExclusiveOperation(parentSessionId, kind) {
      const key = `${parentSessionId}\u0000${kind}`
      if (activeExclusiveOperations.has(key)) return undefined
      const token = ++operationRevision
      activeExclusiveOperations.set(key, token)
      publish()
      return token
    },

    /** @param {string} parentSessionId @param {string} kind @param {number} token */
    releaseExclusiveOperation(parentSessionId, kind, token) {
      const key = `${parentSessionId}\u0000${kind}`
      if (activeExclusiveOperations.get(key) !== token) return false
      activeExclusiveOperations.delete(key)
      publish()
      return true
    },

    /** @param {string} parentSessionId @param {string} kind */
    isOperationActive(parentSessionId, kind) {
      return activeExclusiveOperations.has(`${parentSessionId}\u0000${kind}`)
    },

    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot() {
      return snapshot
    },

    /** @param {string} parentSessionId */
    parent(parentSessionId) {
      return validParent(document.parents[parentSessionId]) ?? EMPTY_PARENT
    },

    /** @param {string} parentSessionId */
    selected(parentSessionId) {
      return validParent(document.parents[parentSessionId])?.selectedChildId
    },

    /** @param {string} parentSessionId @param {ThreadSummary[]} threads */
    reconcile(parentSessionId, threads) {
      const knownIds = unique(
        threads
          .filter((thread) => thread?.parentSessionId === parentSessionId)
          .map((thread) => thread.childSessionId)
          .filter((id) => typeof id === 'string'),
      )
      const known = new Set(knownIds)
      const previous = readParent(parentSessionId)
      const selectedChildId = previous.selectedChildId !== undefined && known.has(previous.selectedChildId)
        ? previous.selectedChildId
        : previous.historyIds.find((id) => known.has(id)) ?? knownIds[0]
      const historyIds = unique([
        ...previous.historyIds,
        ...knownIds,
      ]).filter((id) => known.has(id) && id !== selectedChildId)
      const boundIds = new Set(Object.values(previous.tabChildren))
      const drafts = Object.fromEntries(
        Object.entries(previous.drafts).filter(([id]) => known.has(id) || boundIds.has(id) || id.startsWith('new:')),
      )
      const labels = { ...previous.labels }
      knownIds.forEach((id, index) => {
        const title = threads.find((thread) => thread.parentSessionId === parentSessionId && thread.childSessionId === id)?.title?.trim()
        labels[id] = title || labels[id] || `侧聊 ${index + 1}`
      })
      writeParent(parentSessionId, { ...previous, selectedChildId, historyIds, drafts, labels })
      return selectedChildId
    },

    /** @param {string} parentSessionId @param {string} childSessionId */
    add(parentSessionId, childSessionId) {
      const previous = readParent(parentSessionId)
      const historyIds = unique([
        ...(previous.selectedChildId === undefined ? [] : [previous.selectedChildId]),
        ...previous.historyIds,
      ]).filter((id) => id !== childSessionId)
      writeParent(parentSessionId, {
        ...previous,
        selectedChildId: childSessionId,
        historyIds,
        drafts: previous.drafts,
      })
    },

    /** @param {string} parentSessionId @param {string} childSessionId @param {ThreadSummary[]} threads */
    select(parentSessionId, childSessionId, threads) {
      const known = new Set(
        threads
          .filter((thread) => thread?.parentSessionId === parentSessionId)
          .map((thread) => thread.childSessionId),
      )
      if (!known.has(childSessionId)) return false
      const previous = readParent(parentSessionId)
      const historyIds = unique([
        ...(previous.selectedChildId === undefined ? [] : [previous.selectedChildId]),
        ...previous.historyIds,
      ]).filter((id) => id !== childSessionId && known.has(id))
      writeParent(parentSessionId, {
        ...previous,
        selectedChildId: childSessionId,
        historyIds,
        drafts: previous.drafts,
      })
      return true
    },

    /** @param {string} parentSessionId @param {string} childSessionId */
    remove(parentSessionId, childSessionId) {
      const previous = readParent(parentSessionId)
      const remainingHistory = previous.historyIds.filter((id) => id !== childSessionId)
      const selectedChildId = previous.selectedChildId === childSessionId
        ? remainingHistory.shift()
        : previous.selectedChildId
      const drafts = { ...previous.drafts }
      delete drafts[childSessionId]
      writeParent(parentSessionId, { ...previous, selectedChildId, historyIds: remainingHistory, drafts })
    },

    /** @param {string} parentSessionId @param {string} childSessionId */
    draft(parentSessionId, childSessionId) {
      return readParent(parentSessionId).drafts[childSessionId] ?? ''
    },

    /** @param {string} parentSessionId @param {string} childSessionId @param {string} draft */
    setDraft(parentSessionId, childSessionId, draft) {
      const previous = readParent(parentSessionId)
      writeParent(parentSessionId, {
        ...previous,
        drafts: { ...previous.drafts, [childSessionId]: String(draft) },
      })
    },
  }
}
