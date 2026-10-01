export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export const SUPPORTED_IMAGE_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const SUPPORTED_IMAGE_TYPES = new Set(SUPPORTED_IMAGE_MIME_TYPES)
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

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

export class AttachmentValidationError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message)
    this.name = 'AttachmentValidationError'
    this.code = code
  }
}

function secureId() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new AttachmentValidationError(
      'attachment/secure-id-unavailable',
      'Secure attachment IDs are unavailable in this runtime.',
    )
  }
  return globalThis.crypto.randomUUID()
}

/** @param {string} mimeType */
function attachmentType(mimeType) {
  return mimeType.startsWith('image/') ? 'image' : 'file'
}

/**
 * @param {{ type: unknown, name: unknown, size: unknown, mimeType: unknown }} input
 * @param {{ maxBytes?: number }} [options]
 * @returns {{ type: 'image' | 'file', name: string, size: number, mimeType: string }}
 */
export function validateAttachmentMetadata(input, { maxBytes = MAX_ATTACHMENT_BYTES } = {}) {
  if (input.type !== 'image' && input.type !== 'file') {
    throw new AttachmentValidationError('attachment/type-invalid', 'Attachment type must be image or file.')
  }
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    throw new AttachmentValidationError('attachment/name-required', 'Attachment name is required.')
  }
  if (typeof input.size !== 'number' || !Number.isSafeInteger(input.size) || input.size < 0) {
    throw new AttachmentValidationError('attachment/size-invalid', 'Attachment size must be a non-negative integer.')
  }
  if (input.size === 0) {
    throw new AttachmentValidationError('attachment/empty', 'Empty attachments are not supported.')
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new AttachmentValidationError('attachment/limit-invalid', 'Attachment size limit is invalid.')
  }
  if (input.size > maxBytes) {
    throw new AttachmentValidationError(
      'attachment/too-large',
      `Attachment exceeds the ${formatAttachmentSize(maxBytes)} size limit.`,
    )
  }

  const mimeType = typeof input.mimeType === 'string' && input.mimeType.trim() !== ''
    ? input.mimeType.trim().toLowerCase()
    : 'application/octet-stream'
  if (input.type === 'image' && !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new AttachmentValidationError(
      'attachment/image-type-unsupported',
      `Unsupported image type: ${mimeType}. Supported types are PNG, JPEG, WebP, and GIF.`,
    )
  }
  if (input.type === 'file' && mimeType.startsWith('image/')) {
    throw new AttachmentValidationError(
      'attachment/type-mismatch',
      'Image media types must use the image attachment type.',
    )
  }

  return {
    type: input.type,
    name: input.name.trim(),
    size: input.size,
    mimeType,
  }
}

/** @param {number} bytes */
export function formatAttachmentSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`
}

/** @param {Uint8Array} bytes */
function bytesToBase64(bytes) {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const hasSecond = index + 1 < bytes.length
    const hasThird = index + 2 < bytes.length
    const second = hasSecond ? bytes[index + 1] : 0
    const third = hasThird ? bytes[index + 2] : 0
    output += BASE64_ALPHABET[first >> 2]
    output += BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)]
    output += hasSecond ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)] : '='
    output += hasThird ? BASE64_ALPHABET[third & 63] : '='
  }
  return output
}

/**
 * @param {Blob} blob
 * @param {{ name?: string, maxBytes?: number }} [options]
 * @returns {Promise<AttachmentDraft>}
 */
export async function createAttachmentFromBlob(blob, options = {}) {
  if (!(blob instanceof Blob)) {
    throw new AttachmentValidationError('attachment/blob-required', 'A File or Blob is required.')
  }
  const possibleFile = /** @type {Blob & { name?: unknown }} */ (blob)
  const name = options.name ?? (typeof possibleFile.name === 'string' ? possibleFile.name : '')
  const mimeType = blob.type.trim().toLowerCase() || 'application/octet-stream'
  const type = attachmentType(mimeType)
  const metadata = validateAttachmentMetadata({
    type,
    name,
    size: blob.size,
    mimeType,
  }, { maxBytes: options.maxBytes })

  /** @type {AttachmentDraft} */
  const attachment = {
    id: secureId(),
    ...metadata,
    fileRef: blob,
  }
  if (metadata.type === 'image') {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    attachment.dataUrl = `data:${metadata.mimeType};base64,${bytesToBase64(bytes)}`
  }
  return attachment
}

/**
 * @param {string} value
 * @returns {{ payload: string, mimeType?: string }}
 */
function parseBase64(value) {
  if (typeof value !== 'string') {
    throw new AttachmentValidationError('attachment/base64-invalid', 'Attachment base64 data is invalid.')
  }
  let payload = value
  let mimeType
  if (value.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(value)
    if (match === null) {
      throw new AttachmentValidationError('attachment/base64-invalid', 'Attachment data URL is invalid.')
    }
    mimeType = match[1].trim().toLowerCase()
    payload = match[2]
  }

  const compact = payload.replace(/\s+/g, '')
  if (
    compact.length === 0
    || compact.length % 4 === 1
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)
    || compact.slice(0, -2).includes('=')
  ) {
    throw new AttachmentValidationError('attachment/base64-invalid', 'Attachment base64 data is invalid.')
  }
  const padded = compact.padEnd(compact.length + ((4 - compact.length % 4) % 4), '=')
  return { payload: padded, ...(mimeType === undefined ? {} : { mimeType }) }
}

/** @param {string} value */
function decodedBase64Size(value) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

/**
 * @param {{ base64: string, name: string, mimeType: string }} input
 * @param {{ maxBytes?: number }} [options]
 * @returns {AttachmentDraft}
 */
export function createAttachmentFromBase64(input, options = {}) {
  const parsed = parseBase64(input.base64)
  const declaredMime = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : ''
  if (parsed.mimeType !== undefined && parsed.mimeType !== declaredMime) {
    throw new AttachmentValidationError(
      'attachment/mime-mismatch',
      `Attachment data URL type ${parsed.mimeType} does not match ${declaredMime || 'the declared type'}.`,
    )
  }
  const mimeType = declaredMime || parsed.mimeType || 'application/octet-stream'
  const type = attachmentType(mimeType)
  const metadata = validateAttachmentMetadata({
    type,
    name: input.name,
    size: decodedBase64Size(parsed.payload),
    mimeType,
  }, { maxBytes: options.maxBytes })

  return {
    id: secureId(),
    ...metadata,
    dataUrl: `data:${metadata.mimeType};base64,${parsed.payload}`,
  }
}
