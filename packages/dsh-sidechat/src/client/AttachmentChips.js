import React, { createElement as h } from 'react'
import { formatAttachmentSize } from './attachments.js'

/**
 * @typedef {{
 *   id: string,
 *   type: 'image' | 'file',
 *   name: string,
 *   size: number,
 *   mimeType: string,
 *   dataUrl?: string,
 *   fileRef?: Blob,
 * }} AttachmentDraft
 */

const styles = {
  list: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  chip: {
    display: 'grid',
    gridTemplateColumns: '32px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
    maxWidth: '100%',
    padding: '5px 6px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle))',
    borderRadius: 7,
    color: 'var(--dsw-alias-content-primary, var(--ds-text-primary))',
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary))',
  },
  preview: {
    display: 'grid',
    placeItems: 'center',
    width: 32,
    height: 32,
    overflow: 'hidden',
    borderRadius: 5,
    background: 'var(--dsw-alias-background-primary, var(--ds-background-primary))',
    fontSize: 16,
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  details: {
    display: 'grid',
    gap: 1,
    minWidth: 0,
  },
  name: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
  },
  size: {
    fontSize: 11,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary))',
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
 * @param {{
 *   attachments?: readonly AttachmentDraft[] | null,
 *   onRemove?: (id: string) => void,
 *   disabled?: boolean,
 *   ariaLabel?: string,
 * }} props
 */
export function AttachmentChips({
  attachments = [],
  onRemove,
  disabled = false,
  ariaLabel = '已选附件',
}) {
  if (attachments === null || attachments.length === 0) return null

  return h('ul', { style: styles.list, 'aria-label': ariaLabel },
    ...attachments.map((attachment) => h('li', {
      key: attachment.id,
      style: styles.chip,
      'data-attachment-id': attachment.id,
    },
    h('span', { style: styles.preview, 'aria-hidden': 'true' },
      attachment.type === 'image' && typeof attachment.dataUrl === 'string'
        ? h('img', {
          src: attachment.dataUrl,
          alt: '',
          style: styles.image,
          'aria-hidden': 'true',
        })
        : attachment.type === 'image' ? '▧' : '📎'),
    h('span', { style: styles.details },
      h('span', { style: styles.name, title: attachment.name }, attachment.name),
      h('span', { style: styles.size }, formatAttachmentSize(attachment.size))),
    h('button', {
      type: 'button',
      style: styles.remove,
      disabled: disabled || typeof onRemove !== 'function',
      'aria-label': `删除附件 ${attachment.name}`,
      onClick: () => onRemove?.(attachment.id),
    }, '×'))),
  )
}
