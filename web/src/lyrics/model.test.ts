import { describe, expect, it } from 'vitest'
import presets from '../data/presets.json'
import { activeLine, parseLrc, tappedLines, toLrc, validateLines, type Song } from './model'
describe('timed lyrics', () => {
  it('validates all preset word timings and three-stanza recordings', () => {
    for (const song of presets) {
      validateLines(song.lines, song.duration)
      expect(song.lines).toHaveLength(12)
      expect(song.duration).toBeGreaterThan(65)
    }
  })
  it('keeps silence and instrumental gaps unhighlighted', () => {
    const song = presets[0]
    expect(activeLine(song.lines, 0)).toBe(-1)
    expect(activeLine(song.lines, song.lines[3].end + 0.5)).toBe(-1)
    expect(activeLine(song.lines, song.duration)).toBe(-1)
  })
  it('imports enhanced LRC and preserves round-trip word timing', () => {
    const song = presets[0] as Song
    const result = parseLrc(toLrc(song), song.duration)
    expect(result.timing).toBe('word')
    expect(result.lines).toHaveLength(12)
    expect(result.lines[3].end).toBeCloseTo(song.lines[3].end, 1)
    expect(result.lines[2].words[3].start).toBeCloseTo(song.lines[2].words[3].start, 1)
  })
  it('labels standard LRC as line timing without inventing word times', () => {
    const result = parseLrc('[00:02.00]Hello world\n[00:04.00]Next line', 6)
    expect(result.timing).toBe('line')
    expect(result.lines[0].words).toHaveLength(1)
    expect(result.lines[0].words[0].text).toBe('Hello world')
  })
  it('supports repeated LRC line timestamps', () =>
    expect(parseLrc('[00:02.00][00:07.00]Chorus', 10).lines.map((l) => l.start)).toEqual([2, 7]))
  it('builds word timing from taps, including line breaks', () => {
    const lines = tappedLines('Hello world\nSing again', [1, 2, 4, 5], 7)
    expect(lines[0].end).toBe(4)
    expect(lines[1].words[1].end).toBe(7)
  })
  it('rejects incomplete, reversed and out-of-range timing', () => {
    expect(() => tappedLines('Hello world', [1], 4)).toThrow('Time all')
    expect(() => tappedLines('Hello world', [2, 1], 4)).toThrow()
    expect(() => parseLrc('[00:05.00]Too late', 4)).toThrow()
    expect(() => parseLrc('[00:01.00]<00:00.50>Earlier', 4)).toThrow()
    expect(() => tappedLines('Hello', [4], 4)).toThrow()
  })
})
