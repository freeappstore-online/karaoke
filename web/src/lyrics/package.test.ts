import { describe, expect, it } from 'vitest'
import presets from '../data/presets.json'
import { type Song } from './model'
import { parseSongPackage, serializeSongPackage } from './package'

describe('Karaoke song package', () => {
  it('round trips song metadata, word timings and audio bytes', async () => {
    const song = { ...(presets[0] as Song), credit: 'Original artist' }
    const bytes = new Uint8Array([0, 1, 2, 127, 255])
    const dataUrl = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`
    const json = serializeSongPackage(song, dataUrl)

    expect(JSON.parse(json)).toMatchObject({ version: 1, song: { id: song.id } })
    const imported = parseSongPackage(json)
    expect(imported.song).toEqual({
      id: song.id,
      title: song.title,
      artist: song.artist,
      credit: song.credit,
      duration: song.duration,
      lines: song.lines,
      timing: song.timing,
    })
    expect(imported.audio.type).toBe('audio/wav')
    expect(new Uint8Array(await imported.audio.arrayBuffer())).toEqual(bytes)
  })

  it('rejects unsupported or malformed packages', () => {
    const song = presets[0] as Song
    const packageData = JSON.parse(serializeSongPackage(song, 'data:audio/wav;base64,AA=='))
    expect(() => parseSongPackage(JSON.stringify({ ...packageData, version: 2 }))).toThrow(
      'supported Karaoke song package',
    )
    expect(() =>
      parseSongPackage(JSON.stringify({ ...packageData, audio: 'data:text/plain;base64,AA==' })),
    ).toThrow('supported Karaoke song package')
    expect(() =>
      parseSongPackage(
        JSON.stringify({ ...packageData, song: { ...packageData.song, lines: [] } }),
      ),
    ).toThrow()
  })
})
