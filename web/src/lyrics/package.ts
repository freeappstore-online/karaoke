import { validateLines, type Song } from './model'

type PackageSong = Omit<Song, 'audioUrl' | 'local'>

export function serializeSongPackage(song: Song, audioDataUrl: string): string {
  if (!audioDataUrl.startsWith('data:audio/')) throw new Error('Audio data is required.')
  const metadata: PackageSong = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    credit: song.credit,
    duration: song.duration,
    lines: song.lines,
    timing: song.timing,
  }
  return JSON.stringify({ version: 1, song: metadata, audio: audioDataUrl })
}

export function parseSongPackage(text: string): { song: PackageSong; audio: Blob } {
  const data = JSON.parse(text)
  const song = data.song as PackageSong
  if (
    data.version !== 1 ||
    typeof data.audio !== 'string' ||
    !/^data:audio\/[\w.+-]+;base64,/.test(data.audio) ||
    typeof song?.id !== 'string' ||
    typeof song.title !== 'string' ||
    song.title.length > 200 ||
    typeof song.artist !== 'string' ||
    song.artist.length > 200 ||
    (song.credit !== undefined && typeof song.credit !== 'string') ||
    !['line', 'word'].includes(song.timing)
  )
    throw new Error('This is not a supported Karaoke song package.')
  validateLines(song.lines, song.duration)
  const binary = atob(data.audio.split(',')[1])
  if (binary.length > 40 * 1024 * 1024) throw new Error('Recording exceeds 40 MB.')
  const audio = new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], {
    type: data.audio.slice(5, data.audio.indexOf(';')),
  })
  return { song, audio }
}
