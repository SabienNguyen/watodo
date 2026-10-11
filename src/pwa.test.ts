import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

function readRepoFile(file: string): string {
  return readFileSync(path.join(root, file), 'utf8')
}

// A PNG starts with an 8-byte signature, then the IHDR chunk: width and height are big-endian uint32s at bytes 16-23.
function pngSize(file: string): { width: number; height: number } {
  const header = readFileSync(path.join(root, 'public', file)).subarray(0, 24)
  expect(header.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
}

describe('index.html', () => {
  const html = readRepoFile('index.html')

  it('links the apple touch icon', () => {
    expect(html).toMatch(/<link[^>]*rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/)
  })

  it('declares the web-app-capable metas for iOS and Android', () => {
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/)
    expect(html).toMatch(/<meta name="mobile-web-app-capable" content="yes"/)
  })

  it('extends the layout under the notch with viewport-fit=cover', () => {
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/)
  })

  it('is titled watodo', () => {
    expect(html).toMatch(/<title>watodo<\/title>/)
  })
})

describe('PNG icons in public/', () => {
  it.each([
    ['pwa-192.png', 192],
    ['pwa-512.png', 512],
    ['pwa-maskable-512.png', 512],
    ['apple-touch-icon.png', 180],
  ])('%s is %i pixels square', (file, size) => {
    expect(pngSize(file)).toEqual({ width: size, height: size })
  })
})
