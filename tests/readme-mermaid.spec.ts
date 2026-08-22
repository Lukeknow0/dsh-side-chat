import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const readmeUrls = [
  new URL('../README.md', import.meta.url),
  new URL('../README.zh.md', import.meta.url),
]

describe('README Mermaid diagrams', () => {
  it('keeps sequence-note prose free of bare plus operators', async () => {
    for (const url of readmeUrls) {
      const source = await readFile(url, 'utf8')
      const blocks = [...source.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(match => match[1] ?? '')
      const sequenceNoteLines = blocks
        .filter(block => block.startsWith('sequenceDiagram'))
        .flatMap(block => block.split('\n').filter(line => line.trimStart().startsWith('Note ')))

      expect(sequenceNoteLines).not.toHaveLength(0)
      expect(sequenceNoteLines.join('\n')).not.toMatch(/\s\+\s/)
    }
  })
})
