/**
 * @typedef {{
 *   quote: string,
 *   prefix: string,
 *   suffix: string,
 *   start: number,
 *   end: number,
 * }} AnnotationAnchor
 */

/**
 * Create an exact-text annotation anchor with bounded adjacent context.
 * @param {string} text
 * @param {number} start
 * @param {number} end
 * @param {number} [contextLen]
 * @returns {AnnotationAnchor}
 */
export function createAnnotationAnchor(text, start, end, contextLen = 20) {
  if (typeof text !== 'string') throw new TypeError('Annotation source text must be a string.')
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || end <= start
    || end > text.length
  ) {
    throw new RangeError('Annotation selection must be a non-empty range inside the source text.')
  }
  if (!Number.isSafeInteger(contextLen) || contextLen < 0) {
    throw new RangeError('Annotation context length must be a non-negative integer.')
  }

  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - contextLen), start),
    suffix: text.slice(end, Math.min(text.length, end + contextLen)),
    start,
    end,
  }
}

/** @param {unknown} value @returns {value is AnnotationAnchor} */
function isAnchor(value) {
  if (value === null || typeof value !== 'object') return false
  const anchor = /** @type {Record<string, unknown>} */ (value)
  return typeof anchor.quote === 'string'
    && anchor.quote.length > 0
    && typeof anchor.prefix === 'string'
    && typeof anchor.suffix === 'string'
    && Number.isSafeInteger(anchor.start)
    && Number.isSafeInteger(anchor.end)
}

/**
 * Resolve an anchor using its exact quote, with exact adjacent context used
 * only when the quote appears more than once. Ambiguity is never guessed from
 * the stale original offsets.
 *
 * @param {string} text
 * @param {unknown} anchor
 * @returns {{ state: 'resolved', start: number, end: number } | { state: 'needs-review' }}
 */
export function resolveAnnotationAnchor(text, anchor) {
  if (typeof text !== 'string' || !isAnchor(anchor)) return { state: 'needs-review' }

  const candidates = []
  let from = 0
  while (from <= text.length - anchor.quote.length) {
    const start = text.indexOf(anchor.quote, from)
    if (start === -1) break
    candidates.push(start)
    from = start + 1
  }

  if (candidates.length === 0) return { state: 'needs-review' }
  if (candidates.length === 1) {
    const start = candidates[0]
    return { state: 'resolved', start, end: start + anchor.quote.length }
  }

  const contextual = candidates.filter((start) => {
    const prefixMatches = anchor.prefix === ''
      || text.slice(Math.max(0, start - anchor.prefix.length), start) === anchor.prefix
    const end = start + anchor.quote.length
    const suffixMatches = anchor.suffix === ''
      || text.slice(end, end + anchor.suffix.length) === anchor.suffix
    return prefixMatches && suffixMatches
  })

  if (contextual.length !== 1) return { state: 'needs-review' }
  const start = contextual[0]
  return { state: 'resolved', start, end: start + anchor.quote.length }
}
