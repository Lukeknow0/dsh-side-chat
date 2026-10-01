import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  outDir: 'lib',
  clean: false,
  dts: false,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-storage-domain',
    '@deepseek-ai/dsh-typert-protocol',
  ],
  plugins: [typertPlugin({ mode: 'package', faces: ['host'] })],
})
