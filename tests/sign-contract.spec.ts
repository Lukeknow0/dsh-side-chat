import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  SIDE_CHAT_SIGN_CLIP_X,
  SIDE_CHAT_SIGN_LOWER_PATH,
  SIDE_CHAT_SIGN_UPPER_PATH,
  SIDE_CHAT_SIGN_VIEW_BOX,
} from '../src/client/SideChatSign.tsx'

const assetUrl = (name: string) => new URL(`../docs/assets/${name}`, import.meta.url)

function pathData(svg: string): string[] {
  return [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1] ?? '')
}

describe('Parallel Side Branch sign contract', () => {
  it.each([
    ['sign-on-light.svg', '#0B0D0E'],
    ['sign-on-dark.svg', '#F2F0E8'],
  ])('keeps canonical geometry in %s', async (name, neutral) => {
    const svg = await readFile(assetUrl(name), 'utf8')
    expect(svg).toContain(`viewBox="${SIDE_CHAT_SIGN_VIEW_BOX}"`)
    expect(svg).toContain(`x="${SIDE_CHAT_SIGN_CLIP_X}"`)
    expect(svg).toContain(`stroke="${neutral}"`)
    expect(svg).toContain('stroke="#B7E85B"')
    expect(pathData(svg)).toEqual([
      SIDE_CHAT_SIGN_UPPER_PATH,
      SIDE_CHAT_SIGN_LOWER_PATH,
      SIDE_CHAT_SIGN_LOWER_PATH,
    ])
  })

  it('uses the canonical component on all drawer identity surfaces', async () => {
    const drawer = await readFile(new URL('../src/client/SideChatDrawer.tsx', import.meta.url), 'utf8')
    const styles = await readFile(new URL('../src/client/side-chat.module.css', import.meta.url), 'utf8')
    expect(drawer).toContain("import { SideChatSign } from './SideChatSign.tsx'")
    expect(drawer.match(/<SideChatSign\b/g)).toHaveLength(3)
    expect(drawer).not.toContain('function RailMark')
    expect(styles).not.toContain('.railMark > span')
    expect(styles).not.toContain('.loadingRails span')
  })
})
