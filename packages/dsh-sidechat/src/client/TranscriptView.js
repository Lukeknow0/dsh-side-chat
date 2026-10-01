import React, { createElement as h } from 'react'
import {
  liveOutputIsSettled,
  normalizeLiveOutput,
  projectTranscript,
} from './transcript.js'

/** @typedef {import('../sidechat/types.js').SidechatEvent} SidechatEvent */
/** @typedef {import('../sidechat/types.js').SidechatEventContentPart} SidechatEventContentPart */
/** @typedef {import('../sidechat/types.js').SidechatTransientSnapshot} SidechatTransientSnapshot */
/** @typedef {ReturnType<typeof projectTranscript>[number]} TranscriptRow */

const EMPTY_TRANSIENT = /** @type {SidechatTransientSnapshot} */ ({ questions: [], error: null })

const styles = {
  root: {
    minHeight: 0,
    flex: 1,
    overflow: 'auto',
    padding: '4px 2px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    minWidth: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  card: {
    display: 'grid',
    gap: 6,
    padding: '10px 14px',
    border: '1px solid var(--dsw-alias-border-subtle, var(--ds-border-subtle, #e2e8f0))',
    borderRadius: 14,
    background: 'var(--dsw-alias-background-secondary, var(--ds-background-secondary, #f8fafc))',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.02)',
    boxSizing: 'border-box',
    maxWidth: '92%',
  },
  userCard: {
    marginLeft: 'auto',
    maxWidth: '85%',
    background: 'var(--dsw-alias-content-primary, var(--ds-text-primary, #1e293b))',
    color: '#ffffff',
    border: 'none',
    borderRadius: '16px 16px 4px 16px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
  },
  heading: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
    letterSpacing: '0.02em',
  },
  userHeading: {
    fontSize: 11,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  text: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    fontSize: 13,
    lineHeight: 1.5,
  },
  metadata: {
    fontSize: 12,
    color: 'var(--dsw-alias-content-secondary, var(--ds-text-secondary, #64748b))',
  },
  turn: {
    fontSize: 11,
    color: 'var(--dsw-alias-content-tertiary, var(--ds-text-tertiary, #94a3b8))',
    textAlign: 'center',
    margin: '4px 0',
  },
  error: {
    padding: '8px 12px',
    border: '1px solid var(--dsw-alias-border-danger, var(--ds-border-danger, #ef4444))',
    borderRadius: 10,
    fontSize: 12,
    color: 'var(--dsw-alias-content-danger, var(--ds-text-danger, #dc2626))',
    background: 'rgba(239, 68, 68, 0.05)',
  },
  live: {
    display: 'grid',
    gap: 6,
    padding: '10px 14px',
    borderRadius: 12,
    borderLeft: '3px solid var(--dsw-alias-border-primary, #3b82f6)',
    background: 'rgba(59, 130, 246, 0.03)',
    boxSizing: 'border-box',
    maxWidth: '92%',
  },
}

const toolStateLabel = {
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
}

const interactionStateLabel = {
  pending: '待处理',
  resolved: '已处理',
  expired: '已过期',
}

/** @param {number} bytes */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  return `${Math.round(bytes / 1024)} KB`
}

/** @param {SidechatEventContentPart} part @param {number} index */
function renderContentPart(part, index) {
  switch (part.type) {
    case 'text':
      return h('p', { key: `text:${index}`, style: styles.text }, part.text)
    case 'image': {
      const name = part.name?.trim() || '图片'
      return h('div', {
        key: `image:${part.attachmentId}`,
        style: styles.metadata,
        'aria-label': `图片附件：${name}`,
      }, `图片：${name}（${part.width}×${part.height}，${formatBytes(part.bytes)}）`)
    }
    case 'file':
      return h('div', {
        key: `file:${part.attachmentId}`,
        style: styles.metadata,
        'aria-label': `文件附件：${part.name}`,
      }, `文件：${part.name}（${formatBytes(part.bytes)}）`)
  }
}

/** @param {TranscriptRow} row */
function renderRow(row) {
  switch (row.type) {
    case 'message': {
      const label = row.role === 'user' ? '用户消息' : '助手消息'
      const isUser = row.role === 'user'
      return h('li', {
        key: row.key,
        style: styles.row,
        'data-transcript-key': row.key,
        'data-transcript-row': 'message',
      }, h('article', {
        'aria-label': label,
        style: {
          ...styles.card,
          ...(isUser ? styles.userCard : {}),
        },
      },
      h('div', { style: isUser ? styles.userHeading : styles.heading }, isUser ? '你' : '助手'),
      ...row.content.map(renderContentPart)))
    }
    case 'turn': {
      const label = row.state === 'started'
        ? '回合已开始'
        : `回合已结束${row.reason ? `：${row.reason}` : ''}`
      return h('li', {
        key: row.key,
        style: styles.row,
        'data-transcript-key': row.key,
        'data-transcript-row': 'turn',
      }, h('div', { role: 'status', 'aria-label': label, style: styles.turn }, label))
    }
    case 'tool': {
      const status = toolStateLabel[row.state]
      const label = `工具 ${row.name}：${status}`
      return h('li', {
        key: row.key,
        style: styles.row,
        'data-transcript-key': row.key,
        'data-transcript-row': 'tool',
      }, h('article', { role: 'status', 'aria-label': label, style: styles.card },
      h('div', { style: styles.heading }, label),
      row.summary === undefined ? null : h('p', { style: styles.text }, row.summary)))
    }
    case 'interaction': {
      const kind = row.interactionKind === 'approval' ? '审批请求' : '用户问题'
      const status = interactionStateLabel[row.state]
      const label = `${kind}：${status}`
      return h('li', {
        key: row.key,
        style: styles.row,
        'data-transcript-key': row.key,
        'data-transcript-row': 'interaction',
      }, h('article', { role: 'status', 'aria-label': label, style: styles.card },
      h('div', { style: styles.heading }, label),
      h('p', { style: styles.text }, row.prompt)))
    }
    case 'error':
      return h('li', {
        key: row.key,
        style: styles.row,
        'data-transcript-key': row.key,
        'data-transcript-row': 'error',
      }, h('div', { role: 'alert', 'aria-label': '会话错误', style: styles.error }, row.message))
  }
}

/** @param {SidechatTransientSnapshot} transient */
function renderTransientRows(transient) {
  const rows = []
  for (const request of transient.questions) {
    for (const question of request.questions) {
      const label = '用户问题：待处理'
      rows.push(h('li', {
        key: `pending-question:${request.requestId}:${question.id}`,
        style: styles.row,
        'data-transcript-row': 'pending-question',
      }, h('article', { role: 'status', 'aria-label': label, style: styles.card },
      h('div', { style: styles.heading }, question.header || label),
      h('p', { style: styles.text }, question.question),
      question.detail === undefined ? null : h('p', { style: styles.metadata }, question.detail),
      question.options === undefined || question.options.length === 0
        ? null
        : h('ul', { 'aria-label': '可选项' }, ...question.options.map((option, index) => h(
          'li',
          { key: `${option.label}:${index}` },
          option.description === undefined ? option.label : `${option.label}：${option.description}`,
        ))),
      request.truncated ? h('div', { style: styles.metadata }, '部分问题内容已截断。') : null)))
    }
  }
  if (transient.error !== null) {
    const error = transient.error
    rows.push(h('li', {
      key: `live-error:${error.turnId}:${error.step}`,
      style: styles.row,
      'data-transcript-row': 'live-error',
    }, h('div', { role: 'alert', 'aria-label': '实时会话错误', style: styles.error },
    error.code === undefined ? error.message : `${error.message}（${error.code}）`,
    error.truncated ? h('div', { style: styles.metadata }, '错误内容已截断。') : null)))
  }
  return rows
}

/**
 * Present a durable SidechatEvent transcript and the current bounded live
 * assistant attempt. The live value remains separate so settlement never
 * mutates or fabricates a durable event.
 *
 * @param {{
 *   events?: readonly SidechatEvent[] | null,
 *   live?: unknown,
 *   transient?: SidechatTransientSnapshot,
 *   ariaLabel?: string,
 * }} props
 */
export function TranscriptView({
  events = [],
  live = null,
  transient = EMPTY_TRANSIENT,
  ariaLabel = '侧聊对话记录',
}) {
  const rows = projectTranscript(events)
  const transientRows = renderTransientRows(transient)
  const normalizedLive = normalizeLiveOutput(live)
  const visibleLive = liveOutputIsSettled(rows, normalizedLive) ? null : normalizedLive

  return h('section', { style: styles.root, 'aria-label': ariaLabel },
    rows.length === 0 && transientRows.length === 0 && visibleLive === null
      ? h('div', { role: 'status', style: styles.metadata }, '还没有消息。')
      : h('ol', { style: styles.list, 'aria-label': ariaLabel },
        ...rows.map(renderRow),
        ...transientRows,
        visibleLive === null
          ? null
          : h('li', {
            key: visibleLive.key,
            role: 'status',
            'aria-live': 'polite',
            'aria-atomic': 'false',
            'aria-label': '助手正在回复',
            'data-transcript-live': true,
            'data-transcript-key': visibleLive.key,
            style: styles.live,
          },
          h('div', { style: styles.heading }, '助手正在回复'),
          visibleLive.truncated
            ? h('div', { style: styles.metadata }, '较早的实时输出已截断。')
            : null,
          ...visibleLive.text.split('\n\n').filter(Boolean).map((paragraph, index) =>
            h('p', { key: `live:${index}`, style: styles.text }, paragraph)),
          ),
      ),
  )
}
