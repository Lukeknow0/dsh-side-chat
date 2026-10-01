import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import {
  AttachmentValidationError,
  MAX_ATTACHMENT_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES,
  createAttachmentFromBase64,
  createAttachmentFromBlob,
  formatAttachmentSize,
  validateAttachmentMetadata,
} from '../../src/client/attachments.js'
import { AttachmentChips } from '../../src/client/AttachmentChips.js'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof AttachmentValidationError)
    assert.equal(error.code, code)
    return true
  }
}

test('validates normalized attachment metadata and formats byte sizes', () => {
  assert.deepEqual([...SUPPORTED_IMAGE_MIME_TYPES], [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ])
  assert.deepEqual(validateAttachmentMetadata({
    type: 'file',
    name: 'notes.txt',
    size: 1536,
    mimeType: 'text/plain',
  }), {
    type: 'file',
    name: 'notes.txt',
    size: 1536,
    mimeType: 'text/plain',
  })
  assert.equal(formatAttachmentSize(0), '0 B')
  assert.equal(formatAttachmentSize(1024), '1 KB')
  assert.equal(formatAttachmentSize(1536), '1.5 KB')
  assert.equal(formatAttachmentSize(2 * 1024 * 1024), '2 MB')

  assert.throws(() => validateAttachmentMetadata({
    type: 'file', name: '', size: 1, mimeType: 'text/plain',
  }), expectCode('attachment/name-required'))
  assert.throws(() => validateAttachmentMetadata({
    type: 'file', name: 'empty.txt', size: 0, mimeType: 'text/plain',
  }), expectCode('attachment/empty'))
  assert.throws(() => validateAttachmentMetadata({
    type: 'file', name: 'huge.bin', size: MAX_ATTACHMENT_BYTES + 1, mimeType: 'application/octet-stream',
  }), expectCode('attachment/too-large'))
  assert.throws(() => validateAttachmentMetadata({
    type: 'image', name: 'vector.svg', size: 10, mimeType: 'image/svg+xml',
  }), expectCode('attachment/image-type-unsupported'))
})

test('creates a file attachment from an ordinary Blob and retains its upload reference', async () => {
  const blob = new Blob(['hello'], { type: 'text/plain' })
  const attachment = await createAttachmentFromBlob(blob, { name: 'notes.txt' })

  assert.match(attachment.id, UUID_V4)
  assert.equal(attachment.type, 'file')
  assert.equal(attachment.name, 'notes.txt')
  assert.equal(attachment.size, 5)
  assert.equal(attachment.mimeType, 'text/plain')
  assert.equal(attachment.fileRef, blob)
  assert.equal(attachment.dataUrl, undefined)
})

test('creates supported image previews and rejects unsupported image media types', async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
  const attachment = await createAttachmentFromBlob(png, { name: 'shot.png' })

  assert.equal(attachment.type, 'image')
  assert.equal(attachment.dataUrl, 'data:image/png;base64,iVBORw==')
  assert.equal(attachment.fileRef, png)

  const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' })
  await assert.rejects(
    createAttachmentFromBlob(svg, { name: 'vector.svg' }),
    expectCode('attachment/image-type-unsupported'),
  )
})

test('creates base64 attachments with exact decoded sizes and validates their input', () => {
  const pdf = createAttachmentFromBase64({
    base64: 'JVBERg==',
    name: 'brief.pdf',
    mimeType: 'application/pdf',
  })
  assert.match(pdf.id, UUID_V4)
  assert.deepEqual({
    type: pdf.type,
    name: pdf.name,
    size: pdf.size,
    mimeType: pdf.mimeType,
    dataUrl: pdf.dataUrl,
  }, {
    type: 'file',
    name: 'brief.pdf',
    size: 4,
    mimeType: 'application/pdf',
    dataUrl: 'data:application/pdf;base64,JVBERg==',
  })
  assert.equal(pdf.fileRef, undefined)

  const image = createAttachmentFromBase64({
    base64: 'data:image/gif;base64,R0lGODlh',
    name: 'tiny.gif',
    mimeType: 'image/gif',
  })
  assert.equal(image.type, 'image')
  assert.equal(image.size, 6)
  assert.equal(image.dataUrl, 'data:image/gif;base64,R0lGODlh')

  assert.throws(() => createAttachmentFromBase64({
    base64: 'not base64!', name: 'broken.txt', mimeType: 'text/plain',
  }), expectCode('attachment/base64-invalid'))
  assert.throws(() => createAttachmentFromBase64({
    base64: 'data:image/png;base64,iVBORw==', name: 'wrong.jpg', mimeType: 'image/jpeg',
  }), expectCode('attachment/mime-mismatch'))
})

test('respects a conversion size cap before reading Blob data', async () => {
  const blob = new Blob(['12345'], { type: 'application/octet-stream' })
  await assert.rejects(
    createAttachmentFromBlob(blob, { name: 'five.bin', maxBytes: 4 }),
    expectCode('attachment/too-large'),
  )
  assert.throws(() => createAttachmentFromBase64({
    base64: 'MTIzNDU=', name: 'five.txt', mimeType: 'text/plain',
  }, { maxBytes: 4 }), expectCode('attachment/too-large'))
})

test('renders image and file chips with independent accessible removal controls', async () => {
  const removals = []
  const attachments = [
    {
      id: 'image-1', type: 'image', name: 'shot.png', size: 1536, mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw==',
    },
    {
      id: 'file-1', type: 'file', name: 'brief.pdf', size: 2 * 1024 * 1024, mimeType: 'application/pdf',
    },
  ]
  const renderer = TestRenderer.create(React.createElement(AttachmentChips, {
    attachments,
    onRemove(id) { removals.push(id) },
  }))
  const root = renderer.root

  assert.equal(root.findByProps({ 'aria-label': '已选附件' }).type, 'ul')
  assert.equal(root.findAllByType('li').length, 2)
  assert.equal(root.findAllByType('img').length, 1)
  assert.equal(root.findByType('img').props.src, attachments[0].dataUrl)
  const rendered = JSON.stringify(renderer.toJSON())
  assert.match(rendered, /shot\.png/)
  assert.match(rendered, /1\.5 KB/)
  assert.match(rendered, /brief\.pdf/)
  assert.match(rendered, /2 MB/)

  await act(async () => root.findByProps({ 'aria-label': '删除附件 shot.png' }).props.onClick())
  await act(async () => root.findByProps({ 'aria-label': '删除附件 brief.pdf' }).props.onClick())
  assert.deepEqual(removals, ['image-1', 'file-1'])
})

test('disables removal controls when the list is read-only and renders nothing for an empty list', () => {
  const empty = TestRenderer.create(React.createElement(AttachmentChips, { attachments: [] }))
  assert.equal(empty.toJSON(), null)

  const renderer = TestRenderer.create(React.createElement(AttachmentChips, {
    attachments: [{ id: 'file-1', type: 'file', name: 'a.txt', size: 1, mimeType: 'text/plain' }],
    disabled: true,
    onRemove() { throw new Error('must not run') },
  }))
  assert.equal(renderer.root.findByType('button').props.disabled, true)
})
