import React, {
  createElement as h,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

/**
 * @typedef {string | {
 *   value: string,
 *   label?: string,
 *   supported?: boolean,
 *   disabled?: boolean,
 *   explanation?: string,
 * }} ControlOptionInput
 */

/**
 * @typedef {{
 *   value: string,
 *   label: string,
 *   supported: boolean,
 *   explanation?: string,
 * }} ControlOption
 */

const styles = {
  root: {
    display: 'grid',
    gap: 8,
    minWidth: 0,
    margin: 0,
    padding: '10px 14px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle, #e2e8f0))',
    borderRadius: 14,
    color: 'var(--dsw-alias-content-primary, var(--ds-text-primary, #1e293b))',
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary, #f8fafc))',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)',
  },
  legend: {
    padding: '0 4px',
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
  },
  identity: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'baseline',
    fontSize: 12,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
  },
  identityValue: {
    color: 'var(--dsw-alias-content-primary, var(--ds-text-primary, #0f172a))',
    overflowWrap: 'anywhere',
    background: 'rgba(0, 0, 0, 0.04)',
    padding: '1px 6px',
    borderRadius: 4,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  controls: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  field: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
  },
  select: {
    minWidth: 0,
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle, #cbd5e1))',
    borderRadius: 8,
    color: 'inherit',
    background: 'var(--dsw-alias-background-primary, var(--ds-background-primary, #ffffff))',
    font: 'inherit',
    fontSize: 12,
    outline: 'none',
    cursor: 'pointer',
  },
  note: {
    fontSize: 11,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
  },
  explanationList: {
    display: 'grid',
    gap: 3,
    margin: 0,
    paddingInlineStart: 18,
    fontSize: 11,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
  },
  error: {
    padding: '6px 10px',
    border: '1px solid var(--dsw-alias-border-danger, var(--ds-border-danger, #ef4444))',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--dsw-alias-content-danger, var(--ds-text-danger, #dc2626))',
    background: 'rgba(239, 68, 68, 0.05)',
  },
}

/**
 * @param {readonly ControlOptionInput[] | null | undefined} inputs
 * @param {string} currentValue
 * @returns {ControlOption[]}
 */
function normalizeOptions(inputs, currentValue) {
  /** @type {ControlOption[]} */
  const options = []
  const seen = new Set()

  for (const input of Array.isArray(inputs) ? inputs : []) {
    const value = typeof input === 'string' ? input : input?.value
    if (typeof value !== 'string' || value === '' || seen.has(value)) continue
    seen.add(value)
    const label = typeof input === 'string' || typeof input.label !== 'string' || input.label.trim() === ''
      ? value
      : input.label
    const supported = typeof input === 'string'
      ? true
      : input.supported !== false && input.disabled !== true
    const explanation = typeof input === 'string' || typeof input.explanation !== 'string' || input.explanation.trim() === ''
      ? undefined
      : input.explanation
    options.push({
      value,
      label,
      supported,
      ...(explanation === undefined ? {} : { explanation }),
    })
  }

  if (currentValue !== '' && !seen.has(currentValue)) {
    options.unshift({ value: currentValue, label: currentValue, supported: true })
  }
  return options
}

/** @param {unknown} cause */
function errorMessage(cause) {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Controlled model and permission selectors. This component owns only pending
 * and error presentation; the parent remains the authority for selected values
 * and performs any supported child-session mutation.
 *
 * @param {{
 *   provider: string,
 *   model: string,
 *   permission: string,
 *   modelOptions?: readonly ControlOptionInput[] | null,
 *   permissionOptions?: readonly ControlOptionInput[] | null,
 *   busy?: boolean,
 *   busyExplanation?: string,
 *   error?: string,
 *   disabled?: boolean,
 *   disabledExplanation?: string,
 *   onModelChange?: (value: string) => void | Promise<void>,
 *   onPermissionChange?: (value: string) => void | Promise<void>,
 * }} props
 */
export function ModelPermissionControls({
  provider,
  model,
  permission,
  modelOptions,
  permissionOptions,
  busy = false,
  busyExplanation = '正在同步宿主设置。',
  disabled = false,
  disabledExplanation = '当前侧聊的模型与权限不可更改。',
  onModelChange,
  onPermissionChange,
}) {
  const descriptionId = useId()
  const mountedRef = useRef(true)
  /** @type {React.MutableRefObject<'model' | 'permission' | null>} */
  const pendingRef = useRef(null)
  const [pending, setPending] = useState(/** @type {'model' | 'permission' | null} */ (null))
  const [error, setError] = useState('')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      pendingRef.current = null
    }
  }, [])

  const normalizedModels = normalizeOptions(modelOptions, model)
  const normalizedPermissions = normalizeOptions(permissionOptions, permission)
  const unavailable = [
    ...normalizedModels
      .filter((option) => !option.supported)
      .map((option) => `模型 ${option.label}：${option.explanation ?? '当前宿主不支持此选项。'}`),
    ...normalizedPermissions
      .filter((option) => !option.supported)
      .map((option) => `权限 ${option.label}：${option.explanation ?? '当前宿主不支持此选项。'}`),
    ...(typeof onModelChange === 'function' ? [] : ['当前宿主不支持更改模型。']),
    ...(typeof onPermissionChange === 'function' ? [] : ['当前宿主不支持更改权限。']),
  ]
  const locked = disabled || busy || pending !== null
  const modelDisabled = locked || typeof onModelChange !== 'function'
  const permissionDisabled = locked || typeof onPermissionChange !== 'function'
  const hasUnavailable = unavailable.length > 0
  const unavailableId = `${descriptionId}-unavailable`
  const stateId = `${descriptionId}-state`
  const describedBy = [hasUnavailable ? unavailableId : '', disabled || busy || pending !== null ? stateId : '']
    .filter(Boolean)
    .join(' ') || undefined

  /** @param {'model' | 'permission'} kind @param {string} value */
  async function change(kind, value) {
    if (disabled || busy || pendingRef.current !== null) return
    const options = kind === 'model' ? normalizedModels : normalizedPermissions
    const option = options.find((candidate) => candidate.value === value)
    const currentValue = kind === 'model' ? model : permission
    const callback = kind === 'model' ? onModelChange : onPermissionChange
    if (value === currentValue || option?.supported !== true || typeof callback !== 'function') return

    pendingRef.current = kind
    setPending(kind)
    setError('')
    try {
      await callback(value)
    } catch (cause) {
      if (mountedRef.current) setError(errorMessage(cause))
    } finally {
      if (pendingRef.current === kind) pendingRef.current = null
      if (mountedRef.current) setPending(null)
    }
  }

  return h('fieldset', { style: styles.root, 'aria-busy': busy || pending !== null },
    h('legend', { style: styles.legend }, '模型与权限'),
    h('div', { style: styles.identity, 'aria-label': '当前模型身份' },
      h('span', null, '提供商'),
      h('code', { style: styles.identityValue }, provider || '未知'),
      h('span', { 'aria-hidden': 'true' }, '/'),
      h('span', null, '模型'),
      h('code', { style: styles.identityValue }, model || '未知')),
    h('div', { style: styles.controls },
      h('label', { style: styles.field },
        h('span', null, '模型'),
        h('select', {
          style: styles.select,
          'aria-label': '模型',
          'aria-describedby': describedBy,
          value: model,
          disabled: modelDisabled,
          onChange: (/** @type {React.ChangeEvent<HTMLSelectElement>} */ event) => change('model', event.target.value),
        }, ...normalizedModels.map((option) => h('option', {
          key: option.value,
          value: option.value,
          disabled: !option.supported,
        }, option.label))),
      ),
      h('label', { style: styles.field },
        h('span', null, '权限'),
        h('select', {
          style: styles.select,
          'aria-label': '权限',
          'aria-describedby': describedBy,
          value: permission,
          disabled: permissionDisabled,
          onChange: (/** @type {React.ChangeEvent<HTMLSelectElement>} */ event) => change('permission', event.target.value),
        }, ...normalizedPermissions.map((option) => h('option', {
          key: option.value,
          value: option.value,
          disabled: !option.supported,
        }, option.label))),
      ),
    ),
    disabled
      ? h('div', { id: stateId, role: 'note', style: styles.note }, disabledExplanation)
      : busy || pending !== null
        ? h('div', { id: stateId, role: 'status', 'aria-live': 'polite', style: styles.note },
          busy ? busyExplanation : pending === 'model' ? '正在更新模型…' : '正在更新权限…')
        : null,
    hasUnavailable
      ? h('ul', { id: unavailableId, 'aria-label': '不可用选项说明', style: styles.explanationList },
        ...unavailable.map((explanation, index) => h('li', { key: `${index}:${explanation}` }, explanation)))
      : null,
    error === ''
      ? null
      : h('div', { role: 'alert', 'aria-live': 'assertive', style: styles.error }, error),
  )
}
