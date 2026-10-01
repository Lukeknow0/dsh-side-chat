import { SidechatOperationError } from './operations.js'

const IMAGE_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u

function invalid(partIndex) {
  return new SidechatOperationError(
    'sidechat/attachment-invalid',
    'Side chat prompt content is invalid.',
    partIndex === undefined ? {} : { partIndex },
  )
}

function validBase64(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || !CANONICAL_BASE64.test(value)
  ) return false

  try {
    return Buffer.from(value, 'base64').toString('base64') === value
  } catch {
    return false
  }
}

function validPart(part) {
  if (part === null || typeof part !== 'object' || Array.isArray(part)) return false

  switch (part.type) {
    case 'text':
      return typeof part.text === 'string' && part.text.length > 0
    case 'image':
      return IMAGE_MEDIA_TYPES.has(part.mediaType)
        && validBase64(part.data)
        && (part.name === undefined || typeof part.name === 'string')
    case 'file':
      return typeof part.receiptId === 'string' && part.receiptId.trim().length > 0
    default:
      return false
  }
}

/**
 * Validate the Client wire content accepted by a sidechat prompt.
 * The input object is returned unchanged after validation.
 * @param {unknown} content
 * @returns {unknown}
 */
export function validateSidechatPromptContent(content) {
  if (!Array.isArray(content) || content.length === 0) throw invalid()

  for (let index = 0; index < content.length; index += 1) {
    if (!validPart(content[index])) throw invalid(index)
  }
  return content
}
