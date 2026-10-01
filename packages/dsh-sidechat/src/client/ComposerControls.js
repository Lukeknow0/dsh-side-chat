import React, { createElement as h, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Child-session adapter to the public Host catalogs/verbs. DSH's ModelSelect
// is not exported publicly, so do not import its private implementation.
const colors = {
  text: 'var(--dsw-alias-label-primary, #202124)',
  muted: 'var(--dsw-alias-label-tertiary, #73777e)',
  surface: 'var(--dsw-alias-background-primary, #fff)',
  hover: 'var(--dsw-alias-interactive-bg-hover, #f1f2f3)',
}
const styles = {
  root: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, fontSize: 13, color: colors.text },
  trigger: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: 0, borderRadius: 8, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', minWidth: 0 },
  menu: { width: 280, maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(380px, 65vh)', overflowY: 'auto', padding: 6, borderRadius: 14, border: '1px solid var(--dsw-alias-hairline, #e7e8ea)', background: colors.surface, color: colors.text, fontSize: 13, boxShadow: '0 8px 30px #0002', zIndex: 1000, boxSizing: 'border-box' },
  row: { display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', padding: '9px 10px', width: '100%', border: 0, borderRadius: 9, background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left', minHeight: 36 },
  value: { color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
}
/** @param {string} kind */
function icon(kind) {
  return h('svg', { width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, style: { flexShrink: 0 } },
    kind === 'chevron' ? h('path', { d: 'm9 5 7 7-7 7' })
      : kind === 'check' ? h('path', { d: 'm5 12 4 4L19 6' })
        : h(React.Fragment, null, h('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z' }),
          kind === 'read-only' ? h('path', { d: 'm8 12 3 3 5-6' }) : kind === 'workspace-write' ? h('path', { d: 'm9 15 5-5 2 2-5 5H9v-2Z' }) : h('path', { d: 'M12 8v5m0 4h.01' })))
}
/** @param {any} option */
function modelKey(option) { return option.selection ? `${option.selection.provider}/${option.selection.model}` : option.value.split('#')[0] }
/** @param {any} option */
function effortLabel(option) { return option?.effortLabel ?? option?.label.split(' · ')[1] ?? 'Default' }
/** @param {{model?:string, modelOptions?:readonly any[], permission?:string, permissionOptions?:readonly any[], busy?:boolean, onModelChange?:(value:string)=>void|Promise<void>, onPermissionChange?:(value:string)=>void|Promise<void>}} props */
export function ComposerControls({ model, modelOptions = [], permission, permissionOptions = [], busy = false, onModelChange, onPermissionChange }) {
  const [menu, setMenu] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [hover, setHover] = useState('')
  const [position, setPosition] = useState({ left: 12, bottom: 12 })
  const root = useRef(/** @type {HTMLDivElement|null} */ (null))
  const popup = useRef(/** @type {HTMLDivElement|null} */ (null))
  const anchor = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const permissionButton = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const modelButton = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const inFlight = useRef(false)
  const generation = useRef(0)
  const groups = new Map()
  for (const option of modelOptions) {
    const key = modelKey(option)
    if (!groups.has(key)) groups.set(key, { key, label: option.modelLabel ?? option.label.split(' · ')[0].split(' / ').at(-1), options: [] })
    groups.get(key).options.push(option)
  }
  const current = modelOptions.find(o => o.value === model)
  const key = current ? modelKey(current) : model?.split('#')[0]
  const group = groups.get(key)
  const effort = effortLabel(current)
  const permissions = permissionOptions.filter(o => o.value !== 'custom' && !o.disabled)
  const permissionLabel = permissionOptions.find(o => o.value === permission)?.label ?? '继承主会话权限'
  const hasEffort = group?.options.some((/** @type {any} */ o) => o.selection?.reasoningEffort !== undefined || o.value.includes('#'))
  const locked = busy || pending
  const canPortal = typeof document !== 'undefined' && !!document.body
  function close() { setMenu(''); anchor.current?.focus() }
  /** @param {string} next */
  function open(next) {
    anchor.current = next === 'permission' ? permissionButton.current : modelButton.current
    setMenu(menu === next ? '' : next); setError('')
  }
  useEffect(() => {
    generation.current += 1
    return () => { generation.current += 1 }
  }, [])
  useEffect(() => {
    if (!menu || !canPortal) return undefined
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(menu === 'permission' ? 200 : 280, window.innerWidth - 24)
      setPosition({ left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), bottom: Math.max(12, window.innerHeight - rect.top + 8) })
    }
    const outside = (/** @type {PointerEvent} */ e) => {
      if (e.target instanceof Node && !root.current?.contains(e.target) && !popup.current?.contains(e.target)) setMenu('')
    }
    update()
    popup.current?.querySelector('button')?.focus()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [menu, canPortal])
  /** @param {string} value @param {((value:string)=>void|Promise<void>)|undefined} callback */
  async function apply(value, callback) {
    if (locked || inFlight.current || !callback) return
    const epoch = generation.current
    inFlight.current = true; setPending(true); setError('')
    try { await callback(value); if (epoch === generation.current) close() }
    catch (cause) { if (epoch === generation.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { inFlight.current = false; setPending(false) }
  }
  /** @param {React.KeyboardEvent} e */
  function keyboard(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const buttons = Array.from(popup.current?.querySelectorAll(/** @type {'button'} */ ('button:not(:disabled)')) ?? [])
    if (!buttons.length) return
    e.preventDefault()
    const index = buttons.findIndex(b => b === document.activeElement)
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }
  /** @param {string} label @param {()=>void|Promise<void>} click @param {boolean|undefined} checked @param {any} extra @param {string|undefined} value */
  function item(label, click, checked = undefined, extra = {}, value = undefined) {
    return h('button', { type: 'button', 'aria-label': label, role: checked === undefined ? 'menuitem' : 'menuitemradio', 'aria-checked': checked, disabled: locked,
      onClick: click, onMouseEnter: () => setHover(label), onMouseLeave: () => setHover(''),
      style: { ...styles.row, background: checked || hover === label ? colors.hover : 'transparent' }, ...extra },
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 } }, extra['data-permission'] ? icon(extra['data-permission']) : null, label),
      value !== undefined ? h('span', { style: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 } }, h('span', { style: styles.value }, value), icon('chevron')) : checked ? icon('check') : checked === undefined ? icon('chevron') : null)
  }
  const menuBody = menu ? h('div', { ref: popup, role: 'menu', 'aria-label': menu === 'permission' ? '权限选项' : '模型设置', onKeyDown: keyboard,
    style: { ...styles.menu, width: menu === 'permission' ? 200 : 280, position: canPortal ? 'fixed' : 'absolute', ...(canPortal ? position : { bottom: '100%', right: 0 }) } },
    menu === 'permission' ? permissions.map(o => h(React.Fragment, { key: o.value }, item(o.label, () => apply(o.value, onPermissionChange), o.value === permission, { title: o.explanation, 'data-permission': o.value }))) : null,
    menu === 'model' ? h(React.Fragment, null,
      item('模型', () => setMenu('models'), undefined, { 'data-current-model': group?.label }, group?.label ?? '继承主会话'),
      hasEffort ? item('推理等级', () => setMenu('efforts'), undefined, { 'data-current-effort': effort }, effort) : null) : null,
    menu === 'models' ? h(React.Fragment, null, item('返回', () => setMenu('model')), Array.from(groups.values()).map(g => h(React.Fragment, { key: g.key },
      item(g.label, () => apply((g.options.find((/** @type {any} */ o) => o.selection?.reasoningEffort === current?.selection?.reasoningEffort) ?? g.options[0]).value, onModelChange), g.key === key, { 'data-model-choice': g.key, title: g.key })))) : null,
    menu === 'efforts' ? h(React.Fragment, null, item('返回', () => setMenu('model')), group?.options.map((/** @type {any} */ o) => h(React.Fragment, { key: o.value }, item(effortLabel(o), () => apply(o.value, onModelChange), o.value === model)))) : null,
    error ? h('div', { role: 'alert', style: { padding: 10 } }, error) : null,
    pending ? h('div', { role: 'status', style: { padding: 8 } }, '正在更新…') : null) : null
  return h('div', { ref: root, style: styles.root, onKeyDown: keyboard },
    h('button', { ref: permissionButton, type: 'button', 'aria-label': '更改权限', 'aria-haspopup': 'menu', 'aria-expanded': menu === 'permission', disabled: locked || !permissions.length || !onPermissionChange,
      title: permissions.length ? permissionLabel : '权限目录尚未加载', onClick: () => open('permission'), style: { ...styles.trigger, flexShrink: 0 } }, icon(permission ?? 'read-only'), permissionLabel, '⌃'),
    h('button', { ref: modelButton, type: 'button', 'aria-label': '切换模型', 'aria-haspopup': 'menu', 'aria-expanded': !!menu && menu !== 'permission', disabled: locked || !modelOptions.length || !onModelChange,
      title: modelOptions.length ? group?.label ?? '继承主会话模型' : '模型目录尚未加载', onClick: () => open('model'), style: { ...styles.trigger, marginLeft: 'auto' } },
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, group ? `${group.label}${hasEffort ? ` ${effort}` : ''}` : '继承主会话模型'), '⌃'),
    canPortal && menuBody ? createPortal(menuBody, document.body) : menuBody)
}
