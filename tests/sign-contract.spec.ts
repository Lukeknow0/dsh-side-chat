import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  SIDE_CHAT_SIGN_CLIP_X,
  SIDE_CHAT_SIGN_LOWER_PATH,
  SIDE_CHAT_SIGN_UPPER_PATH,
  SIDE_CHAT_SIGN_VIEW_BOX,
} from '../src/client/SideChatSign.tsx'

const assetUrl = (name: string) => new URL(`../docs/assets/${name}`, import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const rendererPath = fileURLToPath(new URL('../scripts/render-brand-assets.py', import.meta.url))
const execFileAsync = promisify(execFile)

const COMMITTED_RENDERER_OUTPUTS = {
  'brand-board.png': '5be91de0df71fb871af75546b7bfd9e2c4f5ee90a336b556fc4124675fe41a8f',
  'hero-dark.png': '3e1b73a4d5ee6839a32c520f260c3c74de31175169077468160bdaf5a7aa14dd',
  'hero.png': '3e1b73a4d5ee6839a32c520f260c3c74de31175169077468160bdaf5a7aa14dd',
  'social-card.png': '8d3b82abc08bc02d1134de47167648cdde2092eb6acfa5829a5280d588f7010b',
  'installed-overview-en.png': '98cff9551ac0d77f63f1ed36d7842f31e23aa4802478e9fae0eb29e0a6fb2a5c',
  'installed.png': '98cff9551ac0d77f63f1ed36d7842f31e23aa4802478e9fae0eb29e0a6fb2a5c',
  'concept-surface.png': '03be2224d73d2db2ee5ae40d02cfed00088d73a495e87de7dd0022212a26de73',
  'campaign-statement.png': 'c57f589b66b477bac574841a6cae0d1c274c26d2b53b96e0eea7c4b94f00f38f',
  'symbol-construction.png': '321d9532ac971587e1c7ed06232e956006caba1e0b6b28c6fb7fc1b73e40b898',
} as const

function rendererOutputNames(source: string): string[] {
  const namesBlock = source.match(/RENDERED_ASSET_NAMES = \(\n([\s\S]*?)\n\)/)?.[1]
  if (namesBlock === undefined) throw new Error('Missing RENDERED_ASSET_NAMES')
  return [...namesBlock.matchAll(/^\s+"([^"]+\.png)",$/gm)].map(match => match[1] ?? '')
}

async function trackedPngNames(): Promise<string[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '--', 'docs/assets/*.png'],
    { cwd: repositoryRoot },
  )
  return stdout.trim().split('\n').filter(Boolean).map(path => basename(path)).sort()
}

const itOnDarwin = process.platform === 'darwin' ? it : it.skip
const itOnStrictDarwin = process.platform === 'darwin' && process.env.DSH_SIDE_CHAT_STRICT_ASSET_BYTES === '1'
  ? it
  : it.skip

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

  it('uses the canonical component on all shared Side Chat identity surfaces', async () => {
    const surface = await readFile(new URL('../src/client/SideChatSurface.tsx', import.meta.url), 'utf8')
    const styles = await readFile(new URL('../src/client/side-chat.module.css', import.meta.url), 'utf8')
    expect(surface).toContain("import { SideChatSign } from './SideChatSign.tsx'")
    expect(surface.match(/<SideChatSign\b/g)).toHaveLength(3)
    expect(surface).not.toContain('function RailMark')
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

  it('installs pinned renderer dependencies only on macOS CI', async () => {
    const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
    const requirements = await readFile(new URL('../requirements-brand-assets.txt', import.meta.url), 'utf8')
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return ''
        throw error
      })

    expect(workflow).toContain("if: runner.os == 'macOS'")
    expect(workflow).toContain('python -m pip install -r requirements-brand-assets.txt')
    expect(requirements.trim()).toBe('Pillow==12.2.0')
  })

  it('documents CI idempotence and opt-in authoring byte policies', async () => {
    const guide = await readFile(new URL('../docs/brand/BRAND_GUIDE.md', import.meta.url), 'utf8')

    expect(guide).toContain('DSH_SIDE_CHAT_STRICT_ASSET_BYTES=1')
    expect(guide).toContain('second temporary render')
    expect(guide).toContain('96862052959')
  })

  it('keeps every tracked renderer output declared and hash-pinned without Python', async () => {
    const renderer = await readFile(new URL('../scripts/render-brand-assets.py', import.meta.url), 'utf8')
    const trackedAssetNames = await trackedPngNames()
    const renderedAssetNames = rendererOutputNames(renderer).sort()

    expect(renderedAssetNames).toEqual(trackedAssetNames)
    expect(Object.keys(COMMITTED_RENDERER_OUTPUTS).sort()).toEqual(trackedAssetNames)
    for (const [name, expectedHash] of Object.entries(COMMITTED_RENDERER_OUTPUTS)) {
      const committed = await readFile(assetUrl(name))
      expect(createHash('sha256').update(committed).digest('hex'), name).toBe(expectedHash)
    }
  })

  itOnDarwin('keeps every tracked renderer output stable across native macOS isolated renders', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-side-chat-assets-'))
    const temporaryAssets = join(temporaryRoot, 'docs', 'assets')

    try {
      await cp(fileURLToPath(new URL('../docs/assets/', import.meta.url)), temporaryAssets, { recursive: true })
      const renderer = await readFile(new URL('../scripts/render-brand-assets.py', import.meta.url), 'utf8')
      const renderedAssetNames = rendererOutputNames(renderer)
      const trackedAssetNames = await trackedPngNames()
      expect([...renderedAssetNames].sort()).toEqual(trackedAssetNames)

      await execFileAsync('python3', [rendererPath], {
        cwd: repositoryRoot,
        env: { ...process.env, DSH_SIDE_CHAT_TEST_ASSETS_DIR: temporaryAssets },
      })

      const firstRender = new Map<string, Buffer>()
      for (const name of renderedAssetNames) {
        const rendered = await readFile(join(temporaryAssets, name))
        firstRender.set(name, rendered)
      }

      await execFileAsync('python3', [rendererPath], {
        cwd: repositoryRoot,
        env: { ...process.env, DSH_SIDE_CHAT_TEST_ASSETS_DIR: temporaryAssets },
      })
      for (const name of renderedAssetNames) {
        const rendered = await readFile(join(temporaryAssets, name))
        const previous = firstRender.get(name)
        if (previous === undefined) throw new Error(`Missing first render for ${name}`)
        expect(rendered.equals(previous), name).toBe(true)
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }, 15_000)

  itOnStrictDarwin('matches committed renderer bytes in the opted-in local authoring environment', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-side-chat-assets-strict-'))
    const temporaryAssets = join(temporaryRoot, 'docs', 'assets')

    try {
      await cp(fileURLToPath(new URL('../docs/assets/', import.meta.url)), temporaryAssets, { recursive: true })
      const renderer = await readFile(new URL('../scripts/render-brand-assets.py', import.meta.url), 'utf8')
      const renderedAssetNames = rendererOutputNames(renderer)
      expect([...renderedAssetNames].sort()).toEqual(await trackedPngNames())

      await execFileAsync('python3', [rendererPath], {
        cwd: repositoryRoot,
        env: { ...process.env, DSH_SIDE_CHAT_TEST_ASSETS_DIR: temporaryAssets },
      })
      for (const name of renderedAssetNames) {
        const [committed, rendered] = await Promise.all([
          readFile(assetUrl(name)),
          readFile(join(temporaryAssets, name)),
        ])
        expect(rendered.equals(committed), name).toBe(true)
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }, 15_000)
})
