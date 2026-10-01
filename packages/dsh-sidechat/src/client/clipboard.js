/** @param {string} value */
export function legacyCopy(value) {
  const document = globalThis.document
  if (document?.body === undefined || typeof document.execCommand !== 'function') return false
  const previousFocus = /** @type {{ focus?: () => void } | null} */ (document.activeElement)
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  try {
    return document.execCommand('copy')
  } finally {
    input.remove()
    previousFocus?.focus?.()
  }
}

/**
 * @param {'parent' | 'child'} kind
 * @param {string} value
 * @param {{ clipboard?: { writeText(value: string): Promise<void> }, fallback?: (value: string) => boolean }} [options]
 */
export async function copySidechatId(kind, value, {
  clipboard = globalThis.navigator?.clipboard,
  fallback = legacyCopy,
} = {}) {
  try {
    if (typeof clipboard?.writeText === 'function') {
      await clipboard.writeText(value)
      return { ok: true, kind, value }
    }
    if (fallback(value)) return { ok: true, kind, value }
  } catch {
    try {
      if (fallback(value)) return { ok: true, kind, value }
    } catch {
      // Fall through to an explicit result consumed by the UI status region.
    }
  }
  return { ok: false, kind, value, message: '复制失败，请手动选择会话 ID。' }
}
