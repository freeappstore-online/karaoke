import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { fingerprint, locate, RATE, type Fingerprint } from './fingerprint'
function wav(name: string) {
  const b = readFileSync(fileURLToPath(new URL(`../../public/audio/${name}.wav`, import.meta.url)))
  const samples = new Float32Array((b.length - 44) / 2)
  for (let i = 0; i < samples.length; i++) samples[i] = b.readInt16LE(44 + i * 2) / 32768
  return samples
}
let samples: Float32Array, reference: Fingerprint
beforeAll(() => {
  samples = wav('call-to-the-dawn')
  reference = fingerprint(samples, 16000)
}, 30_000)
describe('reference-recording matching', () => {
  it.each([8.73, 26.17, 49.28])('finds an arbitrary mid-song start at %s seconds', (start) => {
    const query = fingerprint(
      samples.slice(Math.floor(start * 16000), Math.floor((start + 4.8) * 16000)),
      16000,
    )
    const result = locate(reference, query)
    console.info('position', start, result)
    expect(result.state).toBe('matched')
    expect(Math.abs(result.time - (start + 4.8))).toBeLessThan(0.2)
  })
  it.each(['many-hands', 'beside-the-broken-work'])('locates a mid-song passage in %s', (name) => {
    const song = wav(name),
      start = 37.23
    const result = locate(
      fingerprint(song, 16000),
      fingerprint(song.slice(Math.floor(start * 16000), Math.floor((start + 5) * 16000)), 16000),
    )
    expect(result.state).toBe('matched')
    expect(Math.abs(result.time - (start + 5))).toBeLessThan(0.2)
  })
  it('follows a quieter, noisy and mildly filtered recording', () => {
    let seed = 123,
      low = 0
    const excerpt = samples.slice(26 * 16000, 31 * 16000)
    for (let i = 0; i < excerpt.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      low += 0.65 * (excerpt[i] - low)
      excerpt[i] = low * 0.35 + (seed / 4294967296 - 0.5) * 0.008
    }
    const result = locate(reference, fingerprint(excerpt, 16000))
    console.info('noise', result)
    expect(result.state).toBe('matched')
    expect(Math.abs(result.time - 31)).toBeLessThan(0.25)
  })
  it('rejects a different song', () => {
    const other = wav('beside-the-broken-work').slice(15 * 16000, 20 * 16000)
    const result = locate(reference, fingerprint(other, 16000))
    console.info('wrong recording', result)
    expect(result.state).toBe('no-match')
  })
  it('does not locate silence or background noise', () => {
    expect(locate(reference, fingerprint(new Float32Array(RATE * 5))).state).toBe('quiet')
    let seed = 11
    const noise = Float32Array.from({ length: RATE * 5 }, () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return (seed / 4294967296 - 0.5) * 0.2
    })
    expect(locate(reference, fingerprint(noise)).state).toBe('no-match')
  })
  it('does not invent a position for identical repeated passages', () => {
    const excerpt = samples.slice(8 * 16000, 14 * 16000),
      repeated = new Float32Array(excerpt.length * 3)
    for (let i = 0; i < 3; i++) repeated.set(excerpt, i * excerpt.length)
    const result = locate(
      fingerprint(repeated, 16000),
      fingerprint(excerpt.slice(16000, 5 * 16000), 16000),
    )
    console.info('repeated', result)
    expect(result.state).toBe('ambiguous')
  })
  it('requires several seconds of evidence', () =>
    expect(locate(reference, fingerprint(samples.slice(0, 16000), 16000)).state).toBe('quiet'))
})
