import React, { createElement as h } from 'react'

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

const styles = {
  list: {
    display: 'grid',
    gap: 8,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  card: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 8,
    minWidth: 0,
    padding: 9,
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle))',
    borderRadius: 8,
    color: 'var(--dsw-alias-content-primary, var(--ds-text-primary))',
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary))',
  },
  content: {
    display: 'grid',
    gap: 5,
    minWidth: 0,
  },
  source: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary))',
  },
  summary: {
    display: '-webkit-box',
    margin: 0,
    overflow: 'hidden',
    overflowWrap: 'anywhere',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 3,
    whiteSpace: 'pre-wrap',
    fontSize: 12,
  },
  label: {
    marginRight: 4,
  },
  remove: {
    display: 'grid',
    placeItems: 'center',
    width: 26,
    height: 26,
    padding: 0,
    border: 0,
    borderRadius: 5,
    color: 'inherit',
    background: 'transparent',
    cursor: 'pointer',
  },
}

/**
 * Render the pending question/answer pairs that will be reflowed to a parent.
 *
 * @param {{
 *   items?: readonly ReflowItem[] | null,
 *   onRemove?: (id: string) => void,
 *   disabled?: boolean,
 * }} props
 */
export function ReflowCard({ items = [], onRemove, disabled = false }) {
  if (!Array.isArray(items) || items.length === 0) return null
  const canRemove = !disabled && typeof onRemove === 'function'

  return h('section', { 'aria-label': '待发送回流' },
    h('ul', { style: styles.list },
      ...items.map((item) => h('li', {
        key: item.id,
        style: styles.card,
        'data-reflow-id': item.id,
      },
      h('span', { style: styles.content },
        h('span', { style: styles.source }, '来自侧聊'),
        h('p', { style: styles.summary, title: item.question },
          h('strong', { style: styles.label }, '提问：'),
          item.question),
        h('p', { style: styles.summary, title: item.answer },
          h('strong', { style: styles.label }, '回答：'),
          item.answer)),
      h('button', {
        type: 'button',
        style: styles.remove,
        disabled: !canRemove,
        'aria-label': `删除待回流项 ${item.id}`,
        onClick: canRemove ? () => onRemove(item.id) : undefined,
      }, '×'))),
    ),
  )
}
