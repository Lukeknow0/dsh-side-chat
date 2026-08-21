import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SIDE_CHAT_SIGN_CLIP_X,
  SIDE_CHAT_SIGN_LOWER_PATH,
  SIDE_CHAT_SIGN_UPPER_PATH,
  SIDE_CHAT_SIGN_VIEW_BOX,
} from '../src/client/SideChatSign.tsx'

const assetUrl = (name: string) => new URL(`../docs/assets/${name}`, import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

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

  it('keeps the committed client bundle on the canonical sign contract', async () => {
    const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(bundle).toContain(SIDE_CHAT_SIGN_UPPER_PATH)
    expect(bundle).toContain(SIDE_CHAT_SIGN_LOWER_PATH)
    expect(bundle).not.toContain('RailMark')
    expect(bundle).not.toContain('loadingRails')
    expect(bundle).not.toContain(repositoryRoot)
  })

  it('regenerates the light overview and keeps README aliases stable', async () => {
    const [readme, readmeZh, renderer, hero, heroAlias, overview, overviewAlias] = await Promise.all([
      readFile(new URL('../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../README.zh.md', import.meta.url), 'utf8'),
      readFile(new URL('../scripts/render-brand-assets.py', import.meta.url), 'utf8'),
      readFile(assetUrl('hero-dark.png')),
      readFile(assetUrl('hero.png')),
      readFile(assetUrl('installed-overview-en.png')),
      readFile(assetUrl('installed.png')),
    ])
    for (const source of [readme, readmeZh]) {
      expect(source.indexOf('docs/assets/hero-dark.png')).toBeLessThan(source.indexOf('docs/assets/installed-overview-en.png'))
    }
    expect(renderer).toContain('def render_installed_overview()')
    expect(renderer).toContain('draw_sign(draw, 100, 165, 120, INK)')
    expect(heroAlias.equals(hero)).toBe(true)
    expect(overviewAlias.equals(overview)).toBe(true)
  })

  it('patches every embedded raster sign before derivatives are cropped', async () => {
    const renderer = await readFile(new URL('../scripts/render-brand-assets.py', import.meta.url), 'utf8')

    expect(renderer).toContain('def repaint_sign_region(')
    expect(renderer).toContain('def patch_product_surface_signs(')
    expect(renderer).toContain('def patch_ui_system_signs(')
    expect(renderer).toContain('def patch_installed_overview_signs(')
    expect(renderer).toContain('patch_product_surface_signs(board)')
    expect(renderer).toContain('patch_ui_system_signs(board)')
    expect(renderer).toContain('patch_installed_overview_signs(image)')
    expect(renderer).not.toContain('BOARD = Image.open')

    const repaintRegion = renderer.slice(renderer.indexOf('def repaint_sign_region('), renderer.indexOf('def patch_product_surface_signs('))
    const productSurface = renderer.slice(renderer.indexOf('def patch_product_surface_signs('), renderer.indexOf('def patch_ui_system_signs('))
    const uiSystem = renderer.slice(renderer.indexOf('def patch_ui_system_signs('), renderer.indexOf('def patch_installed_overview_signs('))
    const installedOverview = renderer.slice(renderer.indexOf('def patch_installed_overview_signs('), renderer.indexOf('def crop_surface()'))
    const cropSurface = renderer.slice(renderer.indexOf('def crop_surface()'), renderer.indexOf('def render_hero('))
    expect(repaintRegion).toContain('draw.rectangle(region')
    expect(repaintRegion).toContain('draw_sign(draw')
    expect(productSurface.match(/repaint_sign_region\(/g)).toHaveLength(2)
    expect(uiSystem.match(/repaint_sign_region\(/g)).toHaveLength(5)
    expect(installedOverview.match(/repaint_sign_region\(/g)).toHaveLength(3)
    expect(cropSurface).toContain('Image.open(ASSETS / "brand-board.png")')
  })
})
