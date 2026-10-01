import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const external = new Set(manifest.dsh?.client?.external ?? [])

export default defineConfig({
  entry: { client: 'src/client/index.js' },
  format: 'cjs',
  platform: 'browser',
  outDir: 'lib',
  clean: false,
  dts: false,
  external: [...external],
  noExternal: ['zod'],
  inlineOnly: ['zod'],
  outputOptions: {
    exports: 'named',
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
