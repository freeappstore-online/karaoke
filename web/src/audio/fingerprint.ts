// Gain-normalized time/frequency features. No audio leaves the browser.
export const RATE = 8000
export const SIZE = 1024
export const HOP = 512
export const STEP = HOP / RATE
export const BANDS = 40
export type Fingerprint = { frames: Float32Array[]; energy: Float32Array; duration: number }
export type Match = { state: 'matched' | 'ambiguous' | 'no-match' | 'quiet'; time: number; score: number; margin: number }
const window = Float32Array.from({ length: SIZE }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (SIZE - 1)))
const weights = Array.from({ length: BANDS }, (_, b) => {
  const center = 80 * 2 ** (b / 7)
  return Array.from({ length: SIZE / 2 }, (_, k) => Math.exp(-.5 * (Math.log2(Math.max(1, k * RATE / SIZE) / center) / .10) ** 2))
})
export function resample(input: Float32Array, from: number): Float32Array {
  if (!Number.isFinite(from) || from <= 0) throw new Error('Invalid sample rate')
  if (from === RATE) return input
  // Low pass before decimation to avoid high frequency aliasing.
  const filtered = new Float32Array(input.length)
  const alpha = 1 - Math.exp(-2 * Math.PI * 3200 / from)
  let low = 0
  for (let i = 0; i < input.length; i++) { low += alpha * (input[i] - low); filtered[i] = low }
  return Float32Array.from({ length: Math.floor(input.length * RATE / from) }, (_, i) => { const p = i * from / RATE; const n = Math.floor(p); return filtered[n] + (filtered[Math.min(n + 1, input.length - 1)] - filtered[n]) * (p - n) })
}
function spectrum(input: Float32Array, start: number) {
  const re = new Float64Array(SIZE), im = new Float64Array(SIZE)
  for (let i = 0; i < SIZE; i++) {
    let x = i, rev = 0
    for (let k = 0; k < 10; k++) { rev = (rev << 1) | (x & 1); x >>= 1 }
    re[rev] = input[start + i] * window[i]
  }
  for (let len = 2; len <= SIZE; len *= 2) {
    const angle = -2 * Math.PI / len
    for (let base = 0; base < SIZE; base += len) for (let j = 0; j < len / 2; j++) {
      const c = Math.cos(angle * j), s = Math.sin(angle * j), a = base + j, b = a + len / 2
      const r = re[b] * c - im[b] * s, q = re[b] * s + im[b] * c
      re[b] = re[a] - r; im[b] = im[a] - q; re[a] += r; im[a] += q
    }
  }
  return Float64Array.from({ length: SIZE / 2 }, (_, k) => re[k] ** 2 + im[k] ** 2)
}
export function fingerprint(samples: Float32Array, sampleRate = RATE): Fingerprint {
  const pcm = resample(samples, sampleRate), frames: Float32Array[] = [], energy: number[] = []
  for (let start = 0; start + SIZE <= pcm.length; start += HOP) {
    const power = spectrum(pcm, start)
    let sum = 0
    for (let k = 0; k < SIZE; k++) sum += pcm[start + k] ** 2
    energy.push(Math.sqrt(sum / SIZE))
    const bands = Float32Array.from(weights, band => Math.log1p(band.reduce((v, weight, k) => v + power[k] * weight, 0) * 100))
    const mean = bands.reduce((a, b) => a + b, 0) / BANDS
    let norm = 0
    for (let b = 0; b < BANDS; b++) { bands[b] -= mean; norm += bands[b] ** 2 }
    norm = Math.sqrt(norm) || 1
    for (let b = 0; b < BANDS; b++) bands[b] /= norm
    frames.push(bands)
  }
  return { frames, energy: Float32Array.from(energy), duration: pcm.length / RATE }
}
export function locate(reference: Fingerprint, query: Fingerprint, prior?: number): Match {
  const quiet: Match = { state: 'quiet', time: 0, score: 0, margin: 0 }
  if (query.frames.length < 35 || query.energy.filter(v => v > .0015).length < query.frames.length * .5) return quiet
  if (query.frames.length > reference.frames.length) return { ...quiet, state: 'no-match' }
  const candidates: { i: number; score: number }[] = []
  const length = query.frames.length
  for (let i = 0; i <= reference.frames.length - length; i++) {
    let score = 0, count = 0
    for (let j = 0; j < length; j += 2) {
      if (query.energy[j] < .0015 || reference.energy[i + j] < .0015) continue
      let dot = 0
      for (let b = 0; b < BANDS; b++) dot += query.frames[j][b] * reference.frames[i + j][b]
      score += dot; count++
    }
    candidates.push({ i, score: count >= length * .3 ? score / count : 0 })
  }
  candidates.sort((a, b) => b.score - a.score)
  let best = candidates[0]
  // A recent confirmed lock can resolve repeated choruses, but cannot create a match.
  if (prior !== undefined) {
    const near = candidates.find(c => Math.abs((c.i + length) * STEP - prior) < .8)
    if (near && near.score >= best.score - .02 && near.score > .86) best = near
  }
  const other = candidates.find(c => Math.abs(c.i - best.i) * STEP > 2)?.score ?? 0
  const margin = best.score - other
  const continuity = prior !== undefined && Math.abs((best.i + length) * STEP - prior) < .8
  return { state: best.score < .84 ? 'no-match' : margin < .025 && !continuity ? 'ambiguous' : 'matched', time: (best.i + length - 1) * STEP + SIZE / RATE, score: best.score, margin }
}
