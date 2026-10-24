import { useEffect, useRef, useState } from 'react'
import { PageHeader, useToast } from '@freeappstore/sdk/ui'
import { clock, parseLrc, tappedLines, toLrc, validateLines, type Song } from '../lyrics/model'
import { decode } from '../audio/decode'
import {
  removeDraft,
  saveDraft,
  saveSong,
  type RecordingDraft,
  type StoredSong,
} from '../lyrics/storage'
import { parseSongPackage } from '../lyrics/package'
import { useTabRecorder } from '../hooks/useTabRecorder'
export function Editor({
  onSave,
  onDraftChange,
  onResume,
  drafts,
  draft,
  source,
}: {
  onSave: (song: Song) => void
  onDraftChange: () => void
  onResume: (id: string) => void
  drafts: RecordingDraft[]
  draft?: RecordingDraft
  source?: Song
}) {
  const toast = useToast(),
    player = useRef<HTMLAudioElement>(null)
  const tabRecorder = useTabRecorder()
  const [title, setTitle] = useState(''),
    [artist, setArtist] = useState(''),
    [lyrics, setLyrics] = useState(''),
    [recordingName, setRecordingName] = useState('Tab recording')
  const [file, setFile] = useState<File>(),
    [url, setUrl] = useState(''),
    [duration, setDuration] = useState(0),
    [time, setTime] = useState(0)
  const [method, setMethod] = useState<'tap' | 'lrc'>('tap'),
    [taps, setTaps] = useState<number[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [draftId, setDraftId] = useState<string>()
  const draftWrite = useRef<Promise<void>>(Promise.resolve())
  const loadedDraft = useRef<string | undefined>(undefined)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishingDraft = useRef(false)
  const draftSnapshot = (id: string, audio: Blob, name: string): RecordingDraft => ({
    id,
    audio,
    name,
    duration,
    title,
    artist,
    lyrics,
    method,
    taps,
  })
  const queueDraft = (value: RecordingDraft) => {
    const write = draftWrite.current.catch(() => {}).then(() => saveDraft(value))
    draftWrite.current = write
    return write
  }
  const words = lyrics.trim() ? lyrics.trim().split(/\s+/) : []
  const currentLine = lyrics
    .trim()
    .split(/\n+/)
    .find(
      (_, i, rows) =>
        rows
          .slice(0, i + 1)
          .join(' ')
          .split(/\s+/).length > taps.length,
    )
  useEffect(() => {
    if (!file) return
    const value = URL.createObjectURL(file)
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [file])
  useEffect(() => {
    if (!draft || loadedDraft.current === draft.id) return
    loadedDraft.current = draft.id
    setDraftId(draft.id)
    setFile(new File([draft.audio], draft.name, { type: draft.audio.type }))
    setRecordingName(draft.name.replace(/\.[^.]+$/, ''))
    setDuration(draft.duration)
    setTitle(draft.title)
    setArtist(draft.artist)
    setLyrics(draft.lyrics)
    setMethod(draft.method)
    setTaps(draft.taps)
  }, [draft])
  useEffect(() => {
    if (!draftId || !file || loadedDraft.current !== draftId) return
    const timer = setTimeout(() => {
      draftTimer.current = null
      if (finishingDraft.current) return
      void queueDraft(draftSnapshot(draftId, file, file.name)).catch(() =>
        setError(
          'Could not update the draft in browser storage. Keep this page open or try saving the song.',
        ),
      )
    }, 400)
    draftTimer.current = timer
    return () => {
      clearTimeout(timer)
      if (draftTimer.current === timer) draftTimer.current = null
    }
  }, [draftId, file, duration, title, artist, lyrics, method, taps])
  const tap = () => {
    if (!player.current || player.current.paused || !duration) {
      toast.show('Play the recording, then tap as each word begins.')
      return
    }
    if (taps.length >= words.length) return
    const value = player.current.currentTime
    if (taps.length && value <= taps.at(-1)! + 0.02) {
      toast.show('Seek forward, or undo the previous timing.', { variant: 'error' })
      return
    }
    setTaps([...taps, value])
    setError('')
  }
  useEffect(() => {
    if (!source) return
    const controller = new AbortController()
    setTitle(`${source.title.slice(0, 190)} (copy)`)
    setArtist(source.artist)
    setMethod('lrc')
    setLyrics(toLrc(source))
    setBusy(true)
    void fetch(source.audioUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load this recording.')
        const blob = await response.blob()
        const decoded = await decode(blob)
        if (controller.signal.aborted) return
        setFile(
          new File([blob], `${source.id}.wav`, {
            type: source.audioUrl.endsWith('.wav') ? 'audio/wav' : blob.type,
          }),
        )
        setDuration(decoded.duration)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    return () => controller.abort()
  }, [source])
  async function attach(file?: File): Promise<number | null> {
    if (!file) return null
    setError('')
    setBusy(true)
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error('Choose an audio file smaller than 40 MB.')
      const decoded = await decode(file)
      if (decoded.duration > 3600) throw new Error('Choose a recording shorter than 60 minutes.')
      setFile(file)
      setDuration(decoded.duration)
      setTaps([])
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''))
      setDraftId(undefined)
      return decoded.duration
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(false)
    }
  }
  async function save() {
    setError('')
    setBusy(true)
    try {
      if (!file || !title.trim()) throw new Error('Add a recording and a song title first.')
      const parsed =
        method === 'lrc'
          ? parseLrc(lyrics, duration)
          : { lines: tappedLines(lyrics, taps, duration), timing: 'word' as const }
      const stored: StoredSong = {
        id: crypto.randomUUID(),
        title: title.trim().slice(0, 200),
        artist: artist.trim().slice(0, 200) || 'My recording',
        duration,
        lines: parsed.lines,
        timing: parsed.timing,
        local: true,
        audio: file,
      }
      if (draftId) {
        finishingDraft.current = true
        if (draftTimer.current) clearTimeout(draftTimer.current)
        await queueDraft(draftSnapshot(draftId, file, file.name)).catch(() => {})
      }
      await saveSong(stored)
      if (draftId) {
        try {
          await removeDraft(draftId)
          setDraftId(undefined)
          onDraftChange()
        } catch {
          toast.show(
            'Song saved, but its draft could not be removed. You can discard the draft later.',
            {
              variant: 'error',
            },
          )
        }
      }
      toast.show('Saved in this browser. Export a song package to keep a backup.', {
        variant: 'success',
      })
      onSave({ ...stored, audioUrl: URL.createObjectURL(file) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      finishingDraft.current = false
      setBusy(false)
    }
  }
  async function discardDraft() {
    if (
      !draftId ||
      !window.confirm('Discard this unfinished recording and its audio? This cannot be undone.')
    )
      return
    setBusy(true)
    try {
      finishingDraft.current = true
      if (draftTimer.current) clearTimeout(draftTimer.current)
      await draftWrite.current.catch(() => {})
      await removeDraft(draftId)
      setDraftId(undefined)
      setFile(undefined)
      setDuration(0)
      setUrl('')
      setTaps([])
      onDraftChange()
      toast.show('Recording draft discarded.')
    } catch (reason) {
      setError(`Could not discard the draft: ${String(reason)}`)
    } finally {
      finishingDraft.current = false
      setBusy(false)
    }
  }
  async function acceptRecording() {
    if (!tabRecorder.preview) return
    const type = tabRecorder.preview.type
    const extension = type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm'
    const captured = new File([tabRecorder.preview], `${recordingName.trim()}.${extension}`, {
      type,
    })
    const capturedDuration = await attach(captured)
    if (!capturedDuration) return
    const id = crypto.randomUUID()
    const value = {
      ...draftSnapshot(id, captured, captured.name),
      duration: capturedDuration,
      title: title || recordingName.trim(),
      taps: [],
    }
    setBusy(true)
    try {
      await queueDraft(value)
      setDraftId(id)
      loadedDraft.current = id
      setTitle(value.title)
      tabRecorder.discard()
      onDraftChange()
      toast.show('Recording draft saved in this browser. Add and time lyrics to finish it.', {
        variant: 'success',
      })
    } catch {
      setError(
        'Could not save the recording draft. Browser storage may be full. Your recording is still on this page; keep it open and try again or finish the song now.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function importPackage(file?: File) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      if (file.size > 58 * 1024 * 1024)
        throw new Error('Song package is too large (maximum 58 MB).')
      const { song, audio: blob } = parseSongPackage(await file.text())
      const decoded = await decode(blob)
      validateLines(song.lines, decoded.duration)
      const stored: StoredSong = {
        id: crypto.randomUUID(),
        title: song.title,
        artist: song.artist,
        credit: song.credit,
        duration: decoded.duration,
        lines: song.lines,
        timing: song.timing,
        local: true,
        audio: blob,
      }
      await saveSong(stored)
      toast.show('Song imported.', { variant: 'success' })
      onSave({ ...stored, audioUrl: URL.createObjectURL(blob) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeader
        title="Make a sing-along"
        description="Pair your recording with lyrics. Time the words once, then sing together."
      />
      {drafts.length > 0 && (
        <section className="panel form-stack" aria-label="Unfinished recordings">
          <h2>Unfinished recordings</h2>
          <p>
            These recordings are saved in this browser as drafts. Add lyrics and timing, then Save &
            sing.
          </p>
          {drafts.map((item) => (
            <button type="button" key={item.id} onClick={() => onResume(item.id)}>
              Resume {item.title || item.name}
            </button>
          ))}
        </section>
      )}
      <div className="editor-grid">
        <section className="panel form-stack">
          <h2>1. Your song</h2>
          <label>
            Song title
            <input
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your song a name"
            />
          </label>
          <label>
            Artist or credit
            <input
              maxLength={200}
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Who made this recording?"
            />
          </label>
          <label className="upload-box">
            Choose a recording
            <input
              type="file"
              accept="audio/*"
              disabled={busy}
              onChange={(e) => void attach(e.target.files?.[0])}
            />
            <span>Audio stays in this browser · up to 40 MB / 60 minutes</span>
          </label>
          <div className="tab-recorder">
            <button
              type="button"
              disabled={
                busy ||
                tabRecorder.status === 'requesting' ||
                tabRecorder.status === 'recording' ||
                tabRecorder.status === 'stopping'
              }
              onClick={() => void tabRecorder.start()}
            >
              Record from browser tab
            </button>
            <p className="muted">
              Choose a browser tab and enable audio sharing in the picker. Some desktop browsers
              require screen sharing permission; tab audio and system audio availability varies by
              browser. Playback stays in your browser.
            </p>
            {tabRecorder.status === 'requesting' && <p role="status">Choose a source to share…</p>}
            {tabRecorder.status === 'recording' && (
              <div className="form-stack">
                <p role="status">Recording · {clock(tabRecorder.elapsed)}</p>
                <label className="recording-level">
                  Input level
                  <meter min="0" max="100" value={tabRecorder.level}>
                    {tabRecorder.level}%
                  </meter>
                </label>
                <div className="button-row">
                  <button type="button" onClick={tabRecorder.stop}>
                    Stop
                  </button>
                  <button type="button" onClick={tabRecorder.cancel}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {tabRecorder.status === 'stopping' && <p role="status">Finishing recording…</p>}
            {tabRecorder.preview && (
              <div className="form-stack">
                <p>Preview your recording before adding it to this song.</p>
                <audio controls src={tabRecorder.previewUrl} />
                <label>
                  Recording name
                  <input
                    maxLength={190}
                    value={recordingName}
                    onChange={(event) => setRecordingName(event.target.value)}
                    placeholder="Name this recording"
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    disabled={busy || !recordingName.trim()}
                    onClick={() => void acceptRecording()}
                  >
                    Accept recording
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Discard this recorded audio? This cannot be undone.'))
                        tabRecorder.discard()
                    }}
                  >
                    Discard and retry
                  </button>
                </div>
              </div>
            )}
            {tabRecorder.error && (
              <p role="alert" className="error-box">
                {tabRecorder.error}
              </p>
            )}
          </div>
          {file && (
            <p>
              {file.name} · {clock(duration)}
              {draftId ? ' · Draft saved in this browser' : ''}
            </p>
          )}
          {draftId && (
            <button type="button" disabled={busy} onClick={() => void discardDraft()}>
              Discard recording draft
            </button>
          )}
          <p className="muted">
            Use audio and lyrics you have permission to use. The included hymns are original,
            instrumental backing tracks.
          </p>
        </section>
        <section className="panel form-stack">
          <h2>2. Add lyrics</h2>
          <label>
            Timing method
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value as 'tap' | 'lrc')
                setTaps([])
              }}
            >
              <option value="tap">Tap each word as the recording plays</option>
              <option value="lrc">Paste timed LRC / enhanced LRC</option>
            </select>
          </label>
          <label>
            {method === 'tap' ? 'Lyrics · one sung line per row' : 'Timed lyrics'}
            <textarea
              rows={9}
              maxLength={30000}
              value={lyrics}
              onChange={(e) => {
                setLyrics(e.target.value)
                setTaps([])
                setError('')
              }}
              placeholder={
                method === 'tap'
                  ? 'First line of your song\nSecond line of your song'
                  : '[00:05.00]<00:05.00>Hello <00:05.50>world\n[00:07.00]Next line'
              }
            />
          </label>
          <p className="muted">
            {method === 'tap'
              ? 'Tap at the beginning of every word. Repeated verses need their own lines. Editing lyrics resets your timing.'
              : 'Standard LRC highlights lines. Enhanced LRC uses <mm:ss.xx> before each word. No word times are guessed.'}
          </p>
        </section>
      </div>
      {method === 'tap' && (
        <section className="panel timing-editor">
          <h2>3. Time your words</h2>
          <audio
            ref={player}
            src={url || undefined}
            controls
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          />
          <p>
            {clock(time)} / {clock(duration)} · {taps.length} of {words.length} words timed
          </p>
          <p className="tap-context">{currentLine || 'All words timed'}</p>
          <button
            className="primary tap-button"
            disabled={!file || !words.length || taps.length >= words.length || busy}
            onClick={tap}
            onKeyDown={(e) => {
              if (e.code === 'Space' && e.repeat) e.preventDefault()
            }}
          >
            {taps.length < words.length ? (
              <>
                Tap for <strong>“{words[taps.length]}”</strong>
              </>
            ) : (
              '✓ Timing complete'
            )}
          </button>
          <p>
            Focus this button and press Space at each word’s beginning, or tap it on your phone.
            Leave the last word long enough before the recording ends.
          </p>
          <div className="button-row">
            <button
              disabled={!taps.length}
              onClick={() => {
                const previous = taps.at(-1)!
                setTaps(taps.slice(0, -1))
                if (player.current) player.current.currentTime = Math.max(0, previous - 1)
              }}
            >
              Undo last word
            </button>
            <button
              disabled={!taps.length}
              onClick={() => {
                setTaps([])
                if (player.current) {
                  player.current.pause()
                  player.current.currentTime = 0
                }
              }}
            >
              Start timing again
            </button>
          </div>
        </section>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="save-row">
        <button className="primary" disabled={busy || !file} onClick={() => void save()}>
          {busy ? 'Working…' : 'Save & sing'}
        </button>
        <p>
          Save the completed, timed song in this browser. Export a package from your library to move
          it to another device.
        </p>
      </div>
      <details className="panel">
        <summary>Already have a Karaoke song package?</summary>
        <label>
          Import .karaoke.json
          <input
            disabled={busy}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void importPackage(e.target.files?.[0])}
          />
        </label>
      </details>
    </>
  )
}
