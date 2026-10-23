export type Word = { text: string; start: number; end: number }
export type Line = { words: Word[]; start: number; end: number }
export type Song = { id: string; title: string; artist: string; credit?: string; audioUrl: string; duration: number; lines: Line[]; timing: 'word' | 'line'; local?: boolean }
export const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`
export function activeLine(lines: Line[], time: number): number { return lines.findIndex(line => time >= line.start && time < line.end) }
const stamp = (s: string) => { const [m, rest] = s.split(':'); return Number(m) * 60 + Number(rest) }
const timestamp = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`
export function parseLrc(text: string, duration: number): { lines: Line[]; timing: 'word' | 'line' } {
  const rows: { start: number; text: string }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+:\d{2}(?:\.\d+)?)\]/g)]
    const body = raw.replace(/\[.*?\]/g, '').trim()
    if (body) for (const tag of tags) rows.push({ start: stamp(tag[1]), text: body })
  }
  rows.sort((a, b) => a.start - b.start)
  if (!rows.length) throw new Error('No timed lyrics found. Use [00:12.00]line text, or tap to time plain lyrics.')
  let timing: 'word' | 'line' = 'word'
  const lines = rows.map((row, i): Line => {
    let end = rows[i + 1]?.start ?? duration
    const matches = [...row.text.matchAll(/<(\d+:\d{2}(?:\.\d+)?)>([^<]*)/g)]
    if (matches.length && !matches.at(-1)![2].trim()) end = Math.min(end, stamp(matches.at(-1)![1]))
    const words = matches.length ? matches.filter(m => m[2].trim()).map(m => ({ text: m[2].trim(), start: stamp(m[1]), end: 0 })) : [{ text: row.text, start: row.start, end }]
    if (!matches.length) timing = 'line'
    words.forEach((w, j) => { w.end = words[j + 1]?.start ?? end })
    return { words, start: row.start, end }
  })
  validateLines(lines, duration)
  return { lines, timing }
}
export function validateLines(lines: Line[], duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error('Recording must be between 0 and 60 minutes.')
  if (!lines.length || lines.length > 2000) throw new Error('Add 1–2,000 lyric lines.')
  let previous = -1
  for (const line of lines) {
    if (!line.words.length || !Number.isFinite(line.start) || !Number.isFinite(line.end) || line.start < previous || line.end <= line.start || line.end > duration + .05) throw new Error('Lyric times must be ordered, within the recording, and have a positive duration.')
    let wordEnd = line.start
    for (const word of line.words) {
      if (typeof word.text !== 'string' || !word.text.trim() || word.text.length > 1000 || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < wordEnd - .001 || word.end <= word.start || word.end > line.end + .001) throw new Error('Check word text and timing: words must be ordered inside each line.')
      wordEnd = word.end
    }
    previous = line.end
  }
}
export function toLrc(song: Song) { return song.lines.map(l => `[${timestamp(l.start)}]${l.words.map(w => song.timing === 'word' ? `<${timestamp(w.start)}>${w.text}` : w.text).join(' ')}${song.timing === 'word' ? `<${timestamp(l.end)}>` : ''}`).join('\n') }
export function tappedLines(text: string, taps: number[], duration: number): Line[] {
  let n = 0
  const rows = text.trim().split(/\n+/).map(l => l.trim().split(/\s+/))
  const count = rows.reduce((a, l) => a + l.length, 0)
  if (taps.length !== count) throw new Error(`Time all ${count} words before saving (${taps.length} timed).`)
  const lines = rows.map(row => { const words = row.map(word => { const i = n++; return { text: word, start: taps[i], end: taps[i + 1] ?? duration } }); return { words, start: words[0].start, end: words.at(-1)!.end } })
  validateLines(lines, duration)
  return lines
}
