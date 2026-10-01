import { ComposerControls } from './ComposerControls.js'
import { UploadRail } from './UploadRail.js'
import React, {
  createElement as h,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

/** @typedef {import('../sidechat/types.js').SidechatQuestionRequestSnapshot} SidechatQuestionRequestSnapshot */
/** @typedef {import('../sidechat/types.js').SidechatQuestionSnapshot} SidechatQuestionSnapshot */

/**
 * @typedef {{
 *   interactionId: string,
 *   prompt: string,
 *   state: 'pending' | 'resolved' | 'expired',
 * }} ApprovalRow
 */

/** @typedef {{ id: string, selected: string[], custom?: string }} QuestionAnswer */
/** @typedef {{ selected: string[], custom: string }} DraftAnswer */
/** @typedef {{ value: string, label: string, selection?: {provider:string, model:string, reasoningEffort?:string}, modelLabel?:string, effortLabel?:string }} ModelOptionItem */

const styles = {
  root: {
    display: 'grid',
    gap: 8,
    minWidth: 0,
    width: '100%',
    color: 'var(--dsw-alias-content-primary, var(--ds-text-primary, #1e293b))',
    boxSizing: 'border-box',
    position: 'relative',
  },
  interactions: {
    display: 'grid',
    gap: 8,
  },
  card: {
    display: 'grid',
    gap: 8,
    margin: 0,
    padding: '10px 12px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle, #e2e8f0))',
    borderRadius: 12,
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary, #f8fafc))',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.02)',
  },
  legend: {
    padding: '0 4px',
    fontWeight: 600,
    fontSize: 13,
  },
  question: {
    display: 'grid',
    gap: 6,
    margin: 0,
    padding: 0,
    border: 0,
  },
  prompt: {
    margin: 0,
    fontSize: 13,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  metadata: {
    margin: 0,
    fontSize: 12,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
  },
  optionList: {
    display: 'grid',
    gap: 6,
  },
  option: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  input: {
    minWidth: 0,
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 10px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle, #cbd5e1))',
    borderRadius: 8,
    color: 'inherit',
    background: 'var(--dsw-alias-background-primary, var(--ds-background-primary, #ffffff))',
    font: 'inherit',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  btnSmall: {
    padding: '5px 12px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle, #cbd5e1))',
    borderRadius: 8,
    color: 'inherit',
    background: 'var(--dsw-alias-background-primary, var(--ds-background-primary, #ffffff))',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
  composerContainer: {
    display: 'grid',
    gap: 6,
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle, #e2e8f0))',
    borderRadius: 18,
    padding: '10px 14px 10px 14px',
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary, #f8fafc))',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    position: 'relative',
  },
  textarea: {
    minHeight: 46,
    maxHeight: 160,
    resize: 'none',
    border: 'none',
    outline: 'none',
    padding: 0,
    margin: 0,
    width: '100%',
    color: 'inherit',
    background: 'transparent',
    font: 'inherit',
    fontSize: 14,
    lineHeight: 1.5,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    minHeight: 32,
    gap: 8,
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minWidth: 0,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
    cursor: 'pointer',
    padding: 0,
    transition: 'background 0.12s ease, color 0.12s ease',
    position: 'relative',
  },
  sendButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 32,
    padding: '0 14px',
    borderRadius: 16,
    border: 'none',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  stopButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 32,
    padding: '0 12px',
    borderRadius: 16,
    border: 'none',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    background: 'var(--dsw-alias-content-danger, #ef4444)',
    color: '#ffffff',
    transition: 'all 0.15s ease',
  },
  status: {
    fontSize: 12,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
    paddingLeft: 4,
  },
  error: {
    padding: '8px 12px',
    border: '1px solid var(--dsw-alias-border-danger, var(--ds-border-danger, #ef4444))',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--dsw-alias-content-danger, var(--ds-text-danger, #dc2626))',
    background: 'rgba(239, 68, 68, 0.05)',
  },

}

/** @param {SidechatQuestionRequestSnapshot} request @param {SidechatQuestionSnapshot} question */
function answerKey(request, question) {
  return `${request.childSessionId}:${request.requestId}:${question.id}`
}

/**
 * @param {{
 *   draft: string,
 *   onDraftChange: (value: string) => void,
 *   onSubmit: (text: string, requestId: string) => Promise<void> | void,
 *   onCancel?: () => Promise<void> | void,
 *   childStatus?: 'idle' | 'running' | 'needs-input' | 'archived',
 *   sending?: boolean,
 *   error?: string | null,
 *   pendingQuestions?: readonly SidechatQuestionRequestSnapshot[],
 *   onAnswerQuestion?: (requestId: string, answers: QuestionAnswer[]) => Promise<void> | void,
 *   approvals?: readonly ApprovalRow[],
 *   onResolveApproval?: (interactionId: string, decision: 'allowed-once' | 'rejected') => Promise<void> | void,
 *   requestScope?: string,
 *   configurationBusy?: boolean,
 *   attachments?: readonly any[],
 *   onFiles?: (files:File[])=>Promise<void>|void,
 *   onRemoveAttachment?: (id:string)=>void,
 *   onRetryAttachment?: (id:string)=>void,
 *   model?: string,
 *   modelOptions?: readonly ModelOptionItem[],
 *   onModelChange?: (value: string) => void,
 *   permission?: string,
 *   permissionOptions?: ReadonlyArray<{ value: string, label: string }>,
 *   onPermissionChange?: (value: string) => void,
 * }} props
 */
export function SidechatComposer({
  draft,
  onDraftChange,
  onSubmit,
  onCancel,
  childStatus = 'idle',
  sending = false,
  error = null,
  pendingQuestions = [],
  onAnswerQuestion,
  approvals = [],
  onResolveApproval,
  requestScope = '',
  configurationBusy = false,
  attachments = [],
  onFiles,
  onRemoveAttachment = () => {},
  onRetryAttachment = () => {},
  model,
  modelOptions = [],
  onModelChange,
  permission,
  permissionOptions = [],
  onPermissionChange,
}) {
  const id = useId()
  const [draftAnswers, setDraftAnswers] = useState(/** @type {Record<string, DraftAnswer>} */ ({}))
  const [localError, setLocalError] = useState('')
  const [pendingActions, setPendingActions] = useState(/** @type {Set<string>} */ (new Set()))
  const composingRef = useRef(false)
  const fileInput = useRef(/** @type {HTMLInputElement|null} */ (null))
  const retrySubmissionsRef = useRef(/** @type {Map<string, { text: string, signature:string, requestId: string }>} */ (new Map()))
  const pendingActionsRef = useRef(new Set(pendingActions))
  pendingActionsRef.current = pendingActions

  function isPending(/** @type {string} */ actionKey) {
    return pendingActionsRef.current.has(actionKey)
  }

  /**
   * @param {string} actionKey
   * @param {() => Promise<void> | void} action
   */
  async function runAction(actionKey, action) {
    pendingActionsRef.current.add(actionKey)
    setPendingActions(new Set(pendingActionsRef.current))
    try {
      await action()
    } finally {
      pendingActionsRef.current.delete(actionKey)
      setPendingActions(new Set(pendingActionsRef.current))
    }
  }

  const submitPending = isPending('submit')
  const cancelPending = isPending('cancel')
  const composerLocked = sending || submitPending || childStatus === 'running' || childStatus === 'archived'
  const attachmentBlocked = attachments.some(item => item.status !== 'ready')
  const attachmentSignature = attachments.map(item => item.id).join(',')
  const sendDisabled = composerLocked || attachmentBlocked || (draft.trim() === '' && attachments.length === 0) || typeof onSubmit !== 'function'

  /** @param {File[]} files */
  async function pickFiles(files) {
    if (composerLocked || !onFiles || files.length === 0) return
    setLocalError('')
    try { await onFiles(files) } catch (cause) { setLocalError(cause instanceof Error ? cause.message : String(cause)) }
  }

  /** @param {React.ClipboardEvent<HTMLTextAreaElement>} event */
  async function pasteImages(event) {
    if (composerLocked || !onFiles) return
    const clipboard = event.clipboardData
    const images = Array.from(clipboard.items ?? [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file) => file !== null)
    const files = images.length ? images : Array.from(clipboard.files ?? []).filter(file => file.type.startsWith('image/'))
    if (!files.length) return
    // Let the browser insert mixed text normally; only file-only pastes are consumed.
    if (!clipboard.getData('text/plain')) event.preventDefault()
    const named = files.map((file,index) => file.name?.trim() ? file : new File([file], `pasted-image-${Date.now()}-${index + 1}.${file.type.split('/')[1] || 'png'}`, {type:file.type}))
    await pickFiles(named)
  }

  async function submitDraft() {
    const textValue = draft.trim()
    if (sendDisabled || pendingActionsRef.current.has('submit')) return

    const submissionScope = requestScope
    const existing = retrySubmissionsRef.current.get(submissionScope)
    const retained = existing?.text === textValue && existing.signature === attachmentSignature
      ? existing
      : { text: textValue, signature:attachmentSignature, requestId: crypto.randomUUID() }
    retrySubmissionsRef.current.set(submissionScope, retained)

    let succeeded = false
    setLocalError('')
    try {
      await runAction('submit', async () => {
        await onSubmit(textValue, retained.requestId)
      })
      succeeded = true
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause))
    }

    if (
      succeeded
      && retrySubmissionsRef.current.get(submissionScope)?.requestId === retained.requestId
    ) {
      retrySubmissionsRef.current.delete(submissionScope)
    }
  }

  /** @param {React.FormEvent<HTMLFormElement>} event */
  async function submit(event) {
    event.preventDefault()
    await submitDraft()
  }

  /** @param {React.KeyboardEvent<HTMLTextAreaElement>} event */
  async function handleDraftKeyDown(event) {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || composingRef.current
      || event.nativeEvent.isComposing
    ) return
    event.preventDefault()
    await submitDraft()
  }

  async function cancel() {
    if (pendingActionsRef.current.has('cancel') || typeof onCancel !== 'function') return
    await runAction('cancel', onCancel)
  }

  /** @param {SidechatQuestionRequestSnapshot} request @param {SidechatQuestionSnapshot} question @returns {DraftAnswer} */
  function currentAnswer(request, question) {
    return draftAnswers[answerKey(request, question)] ?? { selected: [], custom: '' }
  }

  /** @param {SidechatQuestionRequestSnapshot} request @param {SidechatQuestionSnapshot} question @param {DraftAnswer} answer */
  function updateAnswer(request, question, answer) {
    const key = answerKey(request, question)
    setDraftAnswers((current) => ({ ...current, [key]: answer }))
    setLocalError('')
  }

  /** @param {SidechatQuestionRequestSnapshot} request */
  async function submitAnswers(request) {
    const actionKey = `question:${request.requestId}`
    if (pendingActionsRef.current.has(actionKey) || typeof onAnswerQuestion !== 'function') return
    /** @type {QuestionAnswer[]} */
    const answers = []
    for (const question of request.questions) {
      const answer = currentAnswer(request, question)
      const hasOptions = Array.isArray(question.options) && question.options.length > 0
      if (hasOptions) {
        if (answer.selected.length === 0) {
          setLocalError('请完成所有问题后再提交。')
          return
        }
        answers.push({ id: question.id, selected: [...answer.selected] })
        continue
      }
      const custom = answer.custom.trim()
      if (custom === '') {
        setLocalError('请完成所有问题后再提交。')
        return
      }
      answers.push({ id: question.id, selected: [], custom })
    }
    await runAction(actionKey, () => onAnswerQuestion(request.requestId, answers))
  }

  /** @param {ApprovalRow} approval @param {'allowed-once' | 'rejected'} decision */
  async function resolveApproval(approval, decision) {
    const actionKey = `approval:${approval.interactionId}`
    if (pendingActionsRef.current.has(actionKey) || typeof onResolveApproval !== 'function') return
    await runAction(actionKey, () => onResolveApproval(approval.interactionId, decision))
  }

  const questionCards = (pendingQuestions ?? []).map((request) => {
    const actionKey = `question:${request.requestId}`
    const requestPending = isPending(actionKey)
    return h('fieldset', {
      key: `${request.childSessionId}:${request.requestId}`,
      style: styles.card,
      disabled: requestPending,
      'aria-busy': requestPending,
    },
    h('legend', { style: styles.legend }, '需要你的回答'),
    ...request.questions.map((question) => {
      const answer = currentAnswer(request, question)
      const options = Array.isArray(question.options) ? question.options : []
      const multiple = question.multiSelect === true
      const groupName = `${id}-${request.requestId}-${question.id}`
      return h('fieldset', {
        key: question.id,
        style: styles.question,
        'aria-label': question.header || question.question,
      },
      h('legend', { style: styles.legend }, question.header || question.question),
      question.header === undefined ? null : h('p', { style: styles.prompt }, question.question),
      question.detail === undefined ? null : h('p', { style: styles.metadata }, question.detail),
      options.length === 0
        ? h('input', {
          style: styles.input,
          type: 'text',
          'aria-label': question.question,
          value: answer.custom,
          disabled: requestPending,
          onChange: (/** @type {React.ChangeEvent<HTMLInputElement>} */ event) => updateAnswer(request, question, {
            selected: [],
            custom: event.target.value,
          }),
        })
        : h('div', { style: styles.optionList, role: multiple ? 'group' : 'radiogroup' },
          ...options.map((option, optionIndex) => {
            const checked = answer.selected.includes(option.label)
            return h('label', { key: `${option.label}:${optionIndex}`, style: styles.option },
              h('input', {
                type: multiple ? 'checkbox' : 'radio',
                name: groupName,
                value: option.label,
                checked,
                disabled: requestPending,
                onChange: () => {
                  const selected = multiple
                    ? (checked
                      ? answer.selected.filter((entry) => entry !== option.label)
                      : [...answer.selected, option.label])
                    : [option.label]
                  updateAnswer(request, question, { selected, custom: answer.custom })
                },
              }),
              h('span', null, option.label),
              option.description ? h('span', { style: styles.metadata }, `(${option.description})`) : null,
            )
          })),
      )
    }),
    request.truncated ? h('div', { style: styles.metadata }, '部分问题内容已截断。') : null,
    h('div', { style: styles.actions },
      h('button', {
        type: 'button',
        style: styles.btnSmall,
        disabled: requestPending,
        onClick: () => submitAnswers(request),
      }, requestPending ? '正在提交…' : '提交回答')),
    )
  })

  const approvalCards = (approvals ?? []).map((approval) => {
    const actionKey = `approval:${approval.interactionId}`
    const approvalPending = isPending(actionKey)
    const stateLabel = approval.state === 'resolved'
      ? '已处理'
      : approval.state === 'expired' ? '已过期' : '待处理'
    return h('article', {
      key: approval.interactionId,
      style: styles.card,
      'aria-label': '审批请求',
      'aria-busy': approvalPending,
    },
    h('strong', null, `审批请求：${stateLabel}`),
    h('p', { style: styles.prompt }, approval.prompt),
    approval.state !== 'pending'
      ? null
      : typeof onResolveApproval !== 'function'
        ? h('div', { style: styles.metadata }, '当前宿主不支持处理审批。')
        : h('div', { style: styles.actions },
          h('button', {
            type: 'button',
            style: styles.btnSmall,
            disabled: approvalPending,
            onClick: () => resolveApproval(approval, 'allowed-once'),
          }, '批准'),
          h('button', {
            type: 'button',
            style: styles.btnSmall,
            disabled: approvalPending,
            onClick: () => resolveApproval(approval, 'rejected'),
          }, '拒绝')),
    )
  })

  let statusMessage = ''
  if (cancelPending) statusMessage = '正在停止侧聊…'
  else if (sending || submitPending) statusMessage = '正在发送…'
  else if (childStatus === 'running') statusMessage = '侧聊正在运行。'
  else if (childStatus === 'archived') statusMessage = '侧聊已归档，无法发送新消息。'

  return h('section', { style: styles.root, 'aria-label': '侧聊输入与待处理交互' },
    questionCards.length === 0 && approvalCards.length === 0
      ? null
      : h('div', { style: styles.interactions, 'aria-label': '待处理交互' },
        ...questionCards,
        ...approvalCards),
    error === null || error === ''
      ? null
      : h('div', { role: 'alert', 'aria-live': 'assertive', style: styles.error }, error),
    localError === ''
      ? null
      : h('div', { role: 'alert', 'aria-live': 'assertive', style: styles.error }, localError),
    statusMessage === ''
      ? null
      : h('div', { role: 'status', 'aria-live': 'polite', style: styles.status }, statusMessage),

    h('form', { onSubmit: submit,
      onDragOver: (/** @type {React.DragEvent} */ e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault() },
      onDrop: (/** @type {React.DragEvent} */ e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void pickFiles(Array.from(e.dataTransfer.files)) } },
    },
      h('div', { style: styles.composerContainer },
        h(UploadRail, { items:attachments, onRemove:onRemoveAttachment, onRetry:onRetryAttachment, disabled:composerLocked }),
        h('input', { ref:fileInput, type:'file', multiple:true, style:{display:'none'}, 'aria-label':'选择侧聊文件',
          onChange: (/** @type {React.ChangeEvent<HTMLInputElement>} */ e) => { const files=Array.from(e.target.files ?? []); e.target.value=''; void pickFiles(files) },
        }),
        h('textarea', {
          style: styles.textarea,
          'aria-label': '侧聊消息',
          placeholder: '随心输入',
          value: draft,
          disabled: composerLocked,
          onCompositionStart: () => { composingRef.current = true },
          onCompositionEnd: () => { composingRef.current = false },
          onKeyDown: handleDraftKeyDown,
          onPaste: pasteImages,
          onChange: (/** @type {React.ChangeEvent<HTMLTextAreaElement>} */ event) => {
            if (retrySubmissionsRef.current.get(requestScope)?.text !== event.target.value.trim()) {
              retrySubmissionsRef.current.delete(requestScope)
            }
            onDraftChange(event.target.value)
          },
        }),
        h('div', { style: styles.toolbar },
          h('button', {type:'button', 'aria-label':'上传文件', title:'上传文件（支持拖放）', disabled:composerLocked || !onFiles,
            onClick:()=>fileInput.current?.click(), style:styles.iconButton}, '+'),
          h(ComposerControls, {
            key: requestScope,
            model, modelOptions, onModelChange,
            permission, permissionOptions, onPermissionChange,
            busy: configurationBusy || composerLocked,
          }),
          h('div', { style: styles.toolbarRight },
            // 发送按钮（总是存在）
            h('button', {
              type: 'submit',
              style: {
                ...styles.sendButton,
                background: sendDisabled
                  ? 'var(--dsw-alias-background-tertiary, #e2e8f0)'
                  : 'var(--dsw-alias-content-primary, #0f172a)',
                color: sendDisabled
                  ? 'var(--dsw-alias-content-tertiary, #94a3b8)'
                  : '#ffffff',
              },
              disabled: sendDisabled,
            }, '发送'),

            // 停止按钮（仅在运行中出现）
            childStatus === 'running'
              ? h('button', {
                type: 'button',
                style: styles.stopButton,
                disabled: cancelPending || typeof onCancel !== 'function',
                onClick: cancel,
              }, '停止')
              : null,
          ),
        ),
      ),
    ),
  )
}
