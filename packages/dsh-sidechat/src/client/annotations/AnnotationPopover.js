import React, { createElement as h, useState } from 'react'

const styles = {
  root: {
    display: 'grid',
    gap: 9,
    width: 300,
    maxWidth: 'min(300px, calc(100vw - 24px))',
    padding: 10,
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle))',
    borderRadius: 9,
    color: 'var(--dsw-alias-content-primary, var(--ds-text-primary))',
    background: 'var(--dsw-alias-background-primary, var(--ds-background-primary))',
    boxShadow: 'var(--dsw-shadow-popover, 0 8px 24px color-mix(in srgb, currentColor 14%, transparent))',
  },
  heading: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
  },
  quote: {
    margin: 0,
    padding: '7px 8px',
    borderInlineStart: '3px solid var(--dsw-alias-border-primary, currentColor)',
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary))',
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary))',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: 12,
  },
  label: {
    display: 'grid',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
  },
  textarea: {
    minHeight: 72,
    resize: 'vertical',
    padding: 8,
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle))',
    borderRadius: 6,
    color: 'inherit',
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary))',
    font: 'inherit',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
  },
  button: {
    padding: '6px 10px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle))',
    borderRadius: 6,
    color: 'inherit',
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary))',
    cursor: 'pointer',
  },
}

/**
 * @param {{
 *   quote: string,
 *   onSave: (commentText: string) => void,
 *   onClose: () => void,
 *   visible?: boolean,
 * }} props
 */
export function AnnotationPopover({ quote, onSave, onClose, visible = true }) {
  const [comment, setComment] = useState('')
  const trimmedComment = comment.trim()

  if (!visible) return null

  /** @param {React.KeyboardEvent<HTMLElement>} event */
  function handleKeyDown(event) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onClose()
  }

  function save() {
    if (trimmedComment === '') return
    onSave(trimmedComment)
  }

  return h('section', {
    role: 'dialog',
    'aria-label': '添加划选注释',
    'aria-modal': 'false',
    tabIndex: -1,
    style: styles.root,
    onKeyDown: handleKeyDown,
  },
  h('h3', { style: styles.heading }, '添加注释'),
  h('blockquote', { style: styles.quote, 'aria-label': '划选引文' }, quote),
  h('label', { style: styles.label },
    h('span', null, '注释内容'),
    h('textarea', {
      style: styles.textarea,
      'aria-label': '注释内容',
      value: comment,
      onChange: (/** @type {React.ChangeEvent<HTMLTextAreaElement>} */ event) => setComment(event.target.value),
    })),
  h('div', { style: styles.actions },
    h('button', { type: 'button', style: styles.button, onClick: onClose }, '取消'),
    h('button', {
      type: 'button',
      style: styles.button,
      disabled: trimmedComment === '',
      onClick: save,
    }, '保存')),
  )
}
