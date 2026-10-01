/**
 * Task 3.2 TDD — Host-side validation for sidechat prompt attachments.
 *
 * Pure validation tests: no DSH process, profile, filesystem, or network.
 *
 * Run: node --test tests/host/attachments.spec.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { validateSidechatPromptContent } from '../../src/sidechat/attachments.js'
import { SidechatOperationError } from '../../src/sidechat/operations.js'

test('returns the original mixed text, image, and file content after validation', () => {
  const content = [
    { type: 'text', text: 'Describe these attachments.' },
    {
      type: 'image',
      mediaType: 'image/png',
      data: 'aGVsbG8=',
      name: 'pixel.png',
    },
    { type: 'file', receiptId: 'file-upload-receipt-1' },
  ]

  assert.equal(validateSidechatPromptContent(content), content)
})

function assertAttachmentInvalid(content) {
  assert.throws(
    () => validateSidechatPromptContent(content),
    (error) => {
      assert.ok(error instanceof SidechatOperationError)
      assert.equal(error.code, 'sidechat/attachment-invalid')
      assert.equal(error.name, 'SidechatOperationError')
      assert.equal(JSON.stringify(error.details).includes('base64-secret'), false)
      return true
    },
  )
}

test('rejects non-array and empty prompt content', () => {
  for (const content of [undefined, null, {}, 'text', 1, true, []]) {
    assertAttachmentInvalid(content)
  }
})

test('accepts every supported image media type with canonical base64', () => {
  const content = [
    { type: 'image', mediaType: 'image/png', data: 'AA==' },
    { type: 'image', mediaType: 'image/jpeg', data: 'AAA=' },
    { type: 'image', mediaType: 'image/webp', data: 'AAAA' },
    { type: 'image', mediaType: 'image/gif', data: 'R0lGODlhAQ==' },
  ]

  assert.equal(validateSidechatPromptContent(content), content)
})

test('accepts valid single text, image, or file content', () => {
  for (const content of [
    [{ type: 'text', text: 'hello' }],
    [{ type: 'image', mediaType: 'image/png', data: 'aGVsbG8=' }],
    [{ type: 'file', receiptId: 'receipt-123' }],
  ]) {
    assert.equal(validateSidechatPromptContent(content), content)
  }
})

test('rejects null, non-record, unknown, and mixed-invalid parts', () => {
  for (const part of [
    null,
    undefined,
    'text',
    1,
    [],
    {},
    { type: 'audio', data: 'AAAA' },
  ]) {
    assertAttachmentInvalid([part])
  }
  assertAttachmentInvalid([
    { type: 'text', text: 'valid' },
    { type: 'file', receiptId: '' },
  ])
})

test('rejects text parts without a non-empty string', () => {
  for (const text of [undefined, null, '', 0, false, {}, []]) {
    assertAttachmentInvalid([{ type: 'text', text }])
  }
})

test('rejects image parts with unsupported media type or invalid optional name', () => {
  for (const mediaType of [
    undefined,
    null,
    '',
    'image/jpg',
    'image/svg+xml',
    'IMAGE/PNG',
    1,
  ]) {
    assertAttachmentInvalid([{ type: 'image', mediaType, data: 'AAAA' }])
  }
  assertAttachmentInvalid([{
    type: 'image',
    mediaType: 'image/png',
    data: 'AAAA',
    name: 123,
  }])
})

test('rejects empty, malformed, non-canonical, or non-string base64 image data', () => {
  for (const data of [
    undefined,
    null,
    '',
    'base64-secret!',
    'data:image/png;base64,AAAA',
    'TQ',
    'TQ=',
    'TQ===',
    'AB==',
    'AAAA\n',
    123,
    {},
  ]) {
    assertAttachmentInvalid([{ type: 'image', mediaType: 'image/png', data }])
  }
})

test('rejects file parts without a non-blank receipt ID', () => {
  for (const receiptId of [undefined, null, '', '   ', 0, false, {}, []]) {
    assertAttachmentInvalid([{ type: 'file', receiptId }])
  }
})
