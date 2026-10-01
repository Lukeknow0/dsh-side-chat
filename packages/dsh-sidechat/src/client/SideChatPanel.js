import React, { createElement as h, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createSidechatEventFeed } from './event-feed.js'
import { childFromSidechatAddress, LEGACY_SIDECHAT_ADDRESS, sidechatAddress } from './native-tab.js'
import { SidechatComposer } from './SidechatComposer.js'
import { projectTranscript } from './transcript.js'
import { TranscriptView } from './TranscriptView.js'
import { createUploadDrafts } from './upload-drafts.js'

/** @typedef {{ childSessionId: string, parentSessionId: string, title: string, status: string, createdAt: number, updatedAt: number }} ThreadSummary */
const styles = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%',
    color: 'var(--dsw-alias-content-primary, var(--ds-text-primary, #0f172a))',
    background: 'var(--dsw-alias-background-primary, var(--ds-background-primary, #ffffff))',
    fontFamily: 'var(--dsw-font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    position: 'relative', boxSizing: 'border-box',
  },
  panel: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '10px 12px', gap: 8, overflow: 'hidden' },
  button: { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-subtle, #cbd5e1)', background: 'var(--dsw-alias-background-primary, #ffffff)', color: 'inherit', cursor: 'pointer', fontSize: 12 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0, padding: '24px 16px', gap: 12, overflow: 'auto' },
  emptyTitle: { fontSize: 16, fontWeight: 600 },
  emptySubtitle: { fontSize: 13, color: 'var(--dsw-alias-content-secondary, #64748b)', textAlign: 'center', lineHeight: 1.5, maxWidth: 280 },
  recent: { display: 'flex', flexDirection: 'column', gap: 4, width: '100%', maxWidth: 320, marginTop: 12 },
  recentHeading: { fontSize: 11, color: 'var(--dsw-alias-content-secondary, #64748b)', marginBottom: 4 },
  recentButton: { padding: '8px 10px', border: 'none', borderRadius: 6, background: 'var(--dsw-alias-background-secondary, #f8fafc)', color: 'inherit', cursor: 'pointer', textAlign: 'left', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  errorBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', gap: 8, background: 'rgba(239, 68, 68, 0.08)', color: 'var(--dsw-alias-content-danger, #dc2626)', fontSize: 12 },
  status: { padding: 16, textAlign: 'center', color: 'var(--dsw-alias-content-secondary, #64748b)', fontSize: 13 },
}

/** @param {ReturnType<import('./api.js').createSidechatApi>} api */
function defaultEventFeedFactory(api) { return createSidechatEventFeed({ api }) }
/** @param {{provider: string, model: string, reasoningEffort?: string}} selection */
function modelSelectionKey(selection) { return `${selection.provider}/${selection.model}${selection.reasoningEffort === undefined ? '' : `#${selection.reasoningEffort}`}` }
/** @param {any} catalogs @returns {Array<{value: string, label: string, modelLabel: string, effortLabel?: string, selection: {provider: string, model: string, reasoningEffort?: string}}>} */
function selectableModels(catalogs) {
  const result = []
  for (const group of catalogs?.models?.groups ?? []) {
    for (const model of group.models ?? []) {
      const efforts = model.reasoning?.efforts ?? []
      for (const effort of [undefined, ...efforts]) {
        const selection = { provider: group.id, model: model.id, ...(effort === undefined ? {} : { reasoningEffort: effort.id }) }
        result.push({
          value: modelSelectionKey(selection), selection, modelLabel: model.name ?? model.id,
          ...(effort === undefined ? {} : { effortLabel: effort.name ?? effort.id }),
          label: `${group.name ?? group.id} / ${model.name ?? model.id}${effort === undefined ? '' : ` · ${effort.name ?? effort.id}`}`,
        })
      }
    }
  }
  return result
}
/** @param {string} preset */
function permissionNeedsRiskAcknowledgement(preset) { return preset === 'danger-full-access' || preset === 'auto' }
/** @param {string} message @returns {boolean | Promise<boolean>} */
function defaultConfirmRisk(message) { return typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false }
/** @param {readonly any[]} events @param {any} live @param {readonly any[]} questions @param {readonly any[]} approvals */
function childStatusFromEvents(events, live, questions, approvals) {
  if (questions.some((request) => request.questions?.length > 0) || approvals.some((approval) => approval.state === 'pending')) return 'needs-input'
  let activeTurnId
  for (const event of events) {
    if (event?.kind === 'turn-start') activeTurnId = event.turnId
    else if (event?.kind === 'turn-end' && event.turnId === activeTurnId) activeTurnId = undefined
  }
  return live !== null || activeTurnId !== undefined ? 'running' : 'idle'
}

/**
 * One native page; the host owns its navigation and tab chrome.
 * @param {{
 *   api: ReturnType<import('./api.js').createSidechatApi>,
 *   state: ReturnType<import('./state.js').createSidechatThreadState>,
 *   parentSessionId: string,
 *   uploads?: ReturnType<typeof createUploadDrafts>,
 *   useTabInfo?: () => any,
 *   eventFeedFactory?: (api: ReturnType<import('./api.js').createSidechatApi>) => ReturnType<typeof createSidechatEventFeed>,
 *   confirmRisk?: (message: string) => boolean | Promise<boolean>,
 * }} props
 */
export function SideChatPanel({ api, state, parentSessionId, uploads: sharedUploads, useTabInfo, eventFeedFactory = defaultEventFeedFactory, confirmRisk = defaultConfirmRisk }) {
  const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : undefined
  const contentId = tabInfo?.tab?.contentId ?? LEGACY_SIDECHAT_ADDRESS
  const visible = tabInfo?.tab?.visible ?? true
  const addressedChild = childFromSidechatAddress(contentId)
  const legacy = contentId === LEGACY_SIDECHAT_ADDRESS
  useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot)
  const requestedChild = addressedChild ?? state.tabChild(parentSessionId, contentId) ?? (legacy ? state.selected(parentSessionId) : undefined)
  const blankDraftKey = `new:${contentId}`
  const requestScope = JSON.stringify([parentSessionId, legacy ? requestedChild ?? contentId : contentId])
  const parentRef = useRef(parentSessionId)
  const [localUploads] = useState(() => createUploadDrafts(undefined))
  const uploads = sharedUploads ?? localUploads
  useSyncExternalStore(uploads.subscribe, uploads.getSnapshot, uploads.getSnapshot)
  useEffect(() => () => localUploads.dispose(), [localUploads])
  const attachmentScope = uploads.scope(parentSessionId, contentId, requestedChild)
  const attachmentItems = uploads.list(attachmentScope)
  const pageKey = JSON.stringify([parentSessionId, contentId])
  const pageRef = useRef(pageKey)
  pageRef.current = pageKey
  const mountedRef = useRef(true)
  const requestEpochRef = useRef(0)
  parentRef.current = parentSessionId
  const [threads, setThreads] = useState(/** @type {ThreadSummary[]} */ ([]))
  const [optimistic, setOptimistic] = useState(/** @type {ThreadSummary | undefined} */ (undefined))
  const [loadedParentId, setLoadedParentId] = useState(/** @type {string | undefined} */ (undefined))
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [configurationCatalogs, setConfigurationCatalogs] = useState(/** @type {any} */ (undefined))
  const [configuration, setConfiguration] = useState(/** @type {any} */ (undefined))
  const [pendingConfiguration, setPendingConfiguration] = useState(/** @type {any} */ (undefined))
  const [configurationBusy, setConfigurationBusy] = useState(false)
  const [configurationError, setConfigurationError] = useState('')
  const [sendingScope, setSendingScope] = useState('')
  const sending = sendingScope === requestScope
  const [eventFeed] = useState(() => eventFeedFactory(api))
  const feedSnapshot = useSyncExternalStore(eventFeed.subscribe, eventFeed.getSnapshot, eventFeed.getSnapshot)
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const refresh = useCallback(async () => {
    const token = state.beginOperation(parentSessionId, 'list')
    const epoch = ++requestEpochRef.current
    setLoadedParentId(parentSessionId)
    setStatus('loading')
    setError('')
    try {
      const result = await api.list(parentSessionId)
      const rows = /** @type {ThreadSummary[]} */ (Array.isArray(result.threads) ? result.threads : [])
      if (!mountedRef.current || epoch !== requestEpochRef.current || parentRef.current !== parentSessionId) return
      if (state.acceptOperationSuccess(parentSessionId, 'list', token)) state.reconcile(parentSessionId, rows)
      setThreads(rows)
      setStatus('ready')
    } catch (cause) {
      if (!mountedRef.current || epoch !== requestEpochRef.current || parentRef.current !== parentSessionId) return
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    }
  }, [api, parentSessionId, state])
  useEffect(() => {
    if (!visible) return undefined
    let active = true
    const token = state.beginOperation(parentSessionId, 'list')
    const epoch = ++requestEpochRef.current
    if (loadedParentId !== parentSessionId) {
      setThreads([])
      setOptimistic(undefined)
      setLoadedParentId(parentSessionId)
      setStatus('loading')
      setError('')
    }
    void api.list(parentSessionId).then((result) => {
      if (!active || epoch !== requestEpochRef.current) return
      const rows = /** @type {ThreadSummary[]} */ (Array.isArray(result.threads) ? result.threads : [])
      if (state.acceptOperationSuccess(parentSessionId, 'list', token)) state.reconcile(parentSessionId, rows)
      setThreads(rows)
      setStatus('ready')
    }, (cause) => {
      if (!active || epoch !== requestEpochRef.current) return
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('error')
    })
    return () => { active = false }
  }, [api, parentSessionId, state, visible])

  const currentStatus = loadedParentId === parentSessionId ? status : 'loading'
  const currentThreads = loadedParentId === parentSessionId ? threads.filter((thread) => thread.parentSessionId === parentSessionId) : []
  // Resource identity is not ownership evidence: validate it against this parent.
  const selected = currentThreads.find((thread) => thread.childSessionId === requestedChild)
    ?? (loadedParentId === parentSessionId && optimistic?.parentSessionId === parentSessionId && optimistic.childSessionId === requestedChild ? optimistic : undefined)
  const selectedId = selected?.childSessionId
  const selectionKey = JSON.stringify([parentSessionId, contentId, selectedId])
  const selectionRef = useRef(selectionKey)
  selectionRef.current = selectionKey
  const canPollEvents = eventFeedFactory !== defaultEventFeedFactory || typeof api.events === 'function'
  useEffect(() => { eventFeed.setTarget(canPollEvents ? selectedId : undefined, visible && canPollEvents && selectedId !== undefined) }, [canPollEvents, eventFeed, selectedId, visible])
  useEffect(() => () => eventFeed.dispose(), [eventFeed])

  const canConfigure = typeof api.configurationCatalogs === 'function' && typeof api.configuration === 'function'
    && typeof api.selectModel === 'function' && typeof api.selectPermission === 'function'
  useEffect(() => {
    if (!visible || !canConfigure) return undefined
    let active = true
    void api.configurationCatalogs().then((catalogs) => { if (active) setConfigurationCatalogs(catalogs) }).catch((cause) => {
      if (active) setConfigurationError(`加载模型与权限失败：${cause instanceof Error ? cause.message : String(cause)}`)
    })
    return () => { active = false }
  }, [api, canConfigure, visible])
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setConfiguration(undefined)
    setConfigurationError('')
    setConfigurationBusy(false)
    if (!visible || selectedId === undefined || !canConfigure) return () => controller.abort()
    setConfigurationBusy(true)
    void api.configuration(selectedId, controller.signal).then((current) => {
      if (!active || controller.signal.aborted) return
      setConfiguration(current)
      setConfigurationBusy(false)
    }, (cause) => {
      if (!active || controller.signal.aborted) return
      setConfigurationError(cause instanceof Error ? cause.message : String(cause))
      setConfigurationBusy(false)
    })
    return () => { active = false; controller.abort() }
  }, [api, canConfigure, selectedId, visible])

  useEffect(() => { setPendingConfiguration(undefined) }, [pageKey])

  /** @param {string} value */
  async function changeModel(value) {
    if (!canConfigure) return
    const option = selectableModels(configurationCatalogs).find((candidate) => candidate.value === value)
    if (option === undefined) return
    if (selectedId === undefined) {
      setPendingConfiguration((/** @type {any} */ previous) => ({ ...previous, model: option.selection }))
      return
    }
    setPendingConfiguration((/** @type {any} */ prev) => (prev?.permissionPreset ? { permissionPreset: prev.permissionPreset, riskAcknowledged: prev.riskAcknowledged } : undefined))
    const target = selectedId
    const operationSelection = selectionKey
    setConfigurationBusy(true)
    setConfigurationError('')
    try {
      await api.selectModel(target, option.selection)
      const current = await api.configuration(target, undefined)
      if (selectionRef.current === operationSelection) setConfiguration(current)
    } catch (cause) {
      if (selectionRef.current === operationSelection) setConfigurationError(cause instanceof Error ? cause.message : String(cause))
      throw cause
    } finally {
      if (selectionRef.current === operationSelection) setConfigurationBusy(false)
    }
  }
  /** @param {string} permissionPreset */
  async function changePermission(permissionPreset) {
    if (!canConfigure) return
    const requiresRisk = permissionNeedsRiskAcknowledgement(permissionPreset)
    if (selectedId === undefined) {
      if (requiresRisk && !await confirmRisk(`确认仅对新侧聊启用“${permissionPreset}”权限？`)) return
      setPendingConfiguration((/** @type {any} */ previous) => ({ ...previous, permissionPreset, riskAcknowledged: requiresRisk }))
      return
    }
    setPendingConfiguration((/** @type {any} */ prev) => (prev?.model ? { model: prev.model } : undefined))
    const target = selectedId
    const operationSelection = selectionKey
    if (requiresRisk && !await confirmRisk(`权限预设“${permissionPreset}”可能允许高风险操作，确认仅对当前侧聊启用吗？`)) return
    if (selectionRef.current !== operationSelection) return
    setConfigurationBusy(true)
    setConfigurationError('')
    try {
      await api.selectPermission(target, permissionPreset, requiresRisk)
      const current = await api.configuration(target, undefined)
      if (selectionRef.current === operationSelection) setConfiguration(current)
    } catch (cause) {
      if (selectionRef.current === operationSelection) setConfigurationError(cause instanceof Error ? cause.message : String(cause))
      throw cause
    } finally {
      if (selectionRef.current === operationSelection) setConfigurationBusy(false)
    }
  }

  /** @param {File[]} files */
  async function addFiles(files) {
    const operationParent = parentSessionId
    const operationContent = contentId
    const operationPage = pageKey
    if (requestedChild !== undefined && selectedId === undefined) throw Error('此侧聊暂时不可用，不能上传文件。')
    await uploads.add(attachmentScope, files, async () => {
      if (selectedId !== undefined) return selectedId
      const child = await state.ensureTabChild(operationParent, operationContent, async () => (await api.start(operationParent)).childSessionId)
      if (mountedRef.current && pageRef.current === operationPage) {
        ++requestEpochRef.current
        const now = Date.now()
        setOptimistic({parentSessionId:operationParent,childSessionId:child,title:'',status:'idle',createdAt:now,updatedAt:now})
        setLoadedParentId(operationParent); setStatus('ready')
      }
      return child
    })
  }

  /** @param {string} text @param {string} requestId */
  async function submitChildPrompt(text, requestId) {
    const operationParent = parentSessionId
    const operationContent = contentId
    const operationScope = requestScope
    const nativeTab = tabInfo?.tab
    const uploadScope = attachmentScope
    const attachmentIds = uploads.list(uploadScope).map((/** @type {any} */ item) => item.id)
    const configToApply = pendingConfiguration
    if (requestedChild !== undefined && selectedId === undefined) throw new Error('此侧聊不属于当前主会话或暂时不可用，请重试加载。')
    let target = selectedId
    setSendingScope(operationScope)
    setError('')
    try {
      if (target === undefined) {
        target = await state.ensureTabChild(operationParent, operationContent, async () => (await api.start(operationParent)).childSessionId)
        state.setLabel(operationParent, target, text)
        if (mountedRef.current && parentRef.current === operationParent) {
          ++requestEpochRef.current
          const now = Date.now()
          setOptimistic({ parentSessionId: operationParent, childSessionId: target, title: '', status: 'idle', createdAt: now, updatedAt: now })
          setLoadedParentId(operationParent)
          setStatus('ready')
        }
      }
      const child = target
      if (configToApply?.model) {
        await api.selectModel(child, configToApply.model)
        setPendingConfiguration((/** @type {any} */ prev) => (prev?.permissionPreset ? { permissionPreset: prev.permissionPreset, riskAcknowledged: prev.riskAcknowledged } : undefined))
      }
      if (configToApply?.permissionPreset) {
        await api.selectPermission(child, configToApply.permissionPreset, configToApply.riskAcknowledged === true)
        setPendingConfiguration((/** @type {any} */ prev) => (prev?.model ? { model: prev.model } : undefined))
      }
      if (configToApply && canConfigure) {
        const current = await api.configuration(child, undefined)
        if (mountedRef.current && parentRef.current === operationParent && contentId === operationContent) {
          setConfiguration(current)
        }
      }
      const content = [...(text ? [{ type:'text', text }] : []), ...uploads.content(uploadScope, child)]
      if (content.length === 0) throw Error('请输入消息或添加附件。')
      await api.prompt(child, requestId, content, undefined)
      uploads.clear(uploadScope, attachmentIds)
      if (state.draft(operationParent, child).trim() === text) state.setDraft(operationParent, child, '')
      if (state.draft(operationParent, `new:${operationContent}`).trim() === text) state.setDraft(operationParent, `new:${operationContent}`, '')
      if (addressedChild === undefined && !nativeTab?.signal?.aborted) nativeTab?.actions?.openResource(sidechatAddress(child), { replaceTab: true })
    } catch (cause) {
      if (mountedRef.current && parentRef.current === operationParent) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
      throw cause
    } finally {
      if (mountedRef.current) setSendingScope((current) => current === operationScope ? '' : current)
    }
  }
  async function cancelChildPrompt() { if (selectedId !== undefined && typeof api.cancel === 'function') await api.cancel(selectedId) }
  /** @param {string} requestId @param {Array<{id: string, selected: string[], custom?: string}>} answers */
  async function answerChildQuestion(requestId, answers) { if (selectedId !== undefined && typeof api.answerQuestion === 'function') await api.answerQuestion(selectedId, requestId, answers) }
  /** @param {string} interactionId @param {'allowed-once' | 'rejected'} decision */
  async function resolveChildApproval(interactionId, decision) { if (selectedId !== undefined && typeof api.resolveApproval === 'function') await api.resolveApproval(selectedId, interactionId, decision) }

  const modelOptions = selectableModels(configurationCatalogs)
  const displayedConfiguration = selectedId === undefined ? pendingConfiguration : configuration
  const currentModel = displayedConfiguration?.model
  const permissionOptions = (configurationCatalogs?.permissions?.options ?? []).map((/** @type {any} */ option) => ({ value: option.value, label: option.name ?? option.value, explanation: option.description }))
  const isFeedCurrent = selectedId !== undefined && feedSnapshot.childSessionId === selectedId
  const childEvents = isFeedCurrent ? feedSnapshot.events : []
  const transient = isFeedCurrent ? feedSnapshot.transient : undefined
  const pendingQuestions = transient?.questions ?? []
  const approvals = projectTranscript(childEvents).reduce((rows, event) => {
    if (event.type === 'interaction' && event.interactionKind === 'approval') rows.push({ interactionId: event.interactionId, prompt: event.prompt, state: event.state })
    return rows
  }, /** @type {Array<{interactionId: string, prompt: string, state: 'pending' | 'resolved' | 'expired'}>} */ ([]))
  const childStatus = selected?.status === 'archived' ? 'archived' : childStatusFromEvents(childEvents, isFeedCurrent ? feedSnapshot.live : null, pendingQuestions, approvals)
  const composer = h(SidechatComposer, {
    draft: state.draft(parentSessionId, selectedId ?? blankDraftKey),
    onDraftChange: (value) => state.setDraft(parentSessionId, selectedId ?? blankDraftKey, value),
    onSubmit: submitChildPrompt, onCancel: cancelChildPrompt, childStatus, sending, error: error || configurationError || undefined,
    pendingQuestions, onAnswerQuestion: answerChildQuestion, approvals, onResolveApproval: resolveChildApproval,
    requestScope, model: currentModel ? modelSelectionKey(currentModel) : undefined, modelOptions, onModelChange: changeModel,
    permission: displayedConfiguration?.permissionPreset ?? displayedConfiguration?.permission, permissionOptions, onPermissionChange: changePermission,
    configurationBusy,
    attachments:attachmentItems,
    onFiles:addFiles,
    onRemoveAttachment:(id)=>uploads.remove(attachmentScope,id),
    onRetryAttachment:(id)=>{ void uploads.retry(attachmentScope,id) },
  })

  let content
  if (currentStatus === 'loading' && currentThreads.length === 0 && selected === undefined) {
    content = h('div', { style: styles.status, role: 'status', 'aria-live': 'polite' }, '正在加载侧聊…')
  } else if (currentStatus === 'error' && selected === undefined) {
    content = h('div', { style: styles.status, role: 'alert' }, h('div', null, error || '加载侧聊失败。'), h('button', { type: 'button', style: styles.button, onClick: refresh }, '重试'))
  } else if (addressedChild !== undefined && currentStatus === 'ready' && selected === undefined) {
    content = h('div', { style: styles.status, role: 'alert' }, h('div', null, '此侧聊不属于当前主会话或已不可用。'), h('button', { type: 'button', style: styles.button, onClick: refresh }, '重试'))
  } else {
    content = h('section', {
      key: 'sidechat-active-section',
      style: styles.panel,
      'data-selected-child': selected !== undefined ? true : undefined,
      'aria-label': selected !== undefined ? `侧聊：${state.label(parentSessionId, selected.childSessionId)}` : '新侧聊',
    },
      selected === undefined
        ? h('div', { key: 'empty-view', style: styles.empty },
            h('div', { style: styles.emptyTitle }, '侧边聊天'),
            h('div', { style: styles.emptySubtitle }, '在这里展开独立对话，侧聊记录会保留。'),
            currentThreads.length === 0 ? null : h('section', { style: styles.recent, 'aria-label': '最近侧聊' },
              h('div', { style: styles.recentHeading }, '继续之前的侧聊'),
              [...currentThreads].sort((a, b) => b.createdAt - a.createdAt).map((thread) => h('button', {
                key: thread.childSessionId, type: 'button', style: styles.recentButton,
                onClick: () => {
                  if (tabInfo?.tab?.actions?.openResource) tabInfo.tab.actions.openResource(sidechatAddress(thread.childSessionId), { replaceTab: true })
                  else state.select(parentSessionId, thread.childSessionId, currentThreads)
                },
              }, state.label(parentSessionId, thread.childSessionId))),
            ),
          )
        : h(TranscriptView, { key: 'transcript-view', events: childEvents, live: isFeedCurrent ? feedSnapshot.live : null, transient }),
      h(React.Fragment, { key: 'composer-view' }, composer),
    )
  }
  return h('div', { style: styles.root, 'data-sidechat-panel': true, 'data-dsh-sidechat': true, 'data-selected-child-session-id': selectedId ?? '' },
    loadedParentId === parentSessionId && error !== '' && selected !== undefined
      ? h('div', { style: styles.errorBar, role: 'alert' }, h('span', null, error), h('button', { type: 'button', style: styles.button, onClick: refresh }, '重试')) : null,
    content)
}
