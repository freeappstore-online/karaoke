import { useEffect, useRef, useState } from 'react'
import { useToast } from '@freeappstore/sdk/ui'
import { activeLine, clock, toLrc, type Song } from '../lyrics/model'
import { download } from '../lyrics/storage'
import { useFollow } from '../audio/useFollow'
import { decode } from '../audio/decode'
import type { Match } from '../audio/fingerprint'
export function Player({ song }: { song: Song }) {
  const audio = useRef<HTMLAudioElement>(null),
    stage = useRef<HTMLElement>(null)
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [offset, setOffset] = useState(0),
    [rate, setRate] = useState(1)
  const [mode, setMode] = useState<'play' | 'listen'>('play'),
    [test, setTest] = useState(''),
    [testing, setTesting] = useState(false)
  const follow = useFollow(song),
    toast = useToast()
  const result = follow.result
  const [now, setNow] = useState(performance.now())
  useEffect(() => {
    let id = 0
    const frame = () => {
      const observedAt = performance.now()
      setNow(observedAt)
      if (audio.current) setTime(audio.current.currentTime)
      if (playing || (result.state === 'matched' && observedAt - result.at < 1700)) {
        id = requestAnimationFrame(frame)
      }
    }
    frame()
    return () => cancelAnimationFrame(id)
  }, [playing, result.state, result.at])
  useEffect(() => {
    setTime(0)
    setPlaying(false)
    setOffset(0)
    setTest('')
    setMode('play')
    if (audio.current) audio.current.playbackRate = 1
    setRate(1)
  }, [song.id])
  const locked = result.state === 'matched' && now - result.at < 1600
  const lyricTime =
    mode === 'play'
      ? time + offset
      : locked
        ? result.time + Math.min((now - result.at) / 1000, 1.6) + offset
        : -1
  const index = activeLine(song.lines, lyricTime),
    current = song.lines[index]
  const next = index < 0 ? song.lines.find((l) => l.start > lyricTime) : song.lines[index + 1]
  const toggle = async () => {
    if (!audio.current) return
    try {
      if (audio.current.paused) await audio.current.play()
      else audio.current.pause()
    } catch {
      toast.show('Could not play this recording. Try a supported audio file.')
    }
  }
  const seek = (t: number) => {
    if (audio.current) {
      audio.current.currentTime = t
      setTime(t)
    }
  }
  const labels: Record<string, string> = {
    off: 'Microphone is off',
    preparing: 'Preparing reference recording…',
    listening: 'Listening · allow 4–6 seconds',
    matched: locked ? 'Following the associated recording' : 'Signal lost · finding the song again',
    ambiguous: 'Repeated passage · position uncertain',
    'no-match': 'No match · play the associated recording',
    quiet: 'Too quiet · bring the music closer',
    error: result.message ?? 'Microphone unavailable',
  }
  async function checkSample() {
    setTesting(true)
    setTest('Analyzing a five-second excerpt…')
    let worker: Worker | undefined
    try {
      const response = await fetch(song.audioUrl)
      if (!response.ok) throw new Error('Recording unavailable')
      const decoded = await decode(await response.blob())
      const start = Math.min(26, Math.max(0, decoded.duration - 6))
      if (decoded.duration < 4)
        throw new Error('Use a recording of at least four seconds for this check.')
      const excerpt = decoded.samples.slice(
        Math.floor(start * decoded.rate),
        Math.floor((start + Math.min(5, decoded.duration - start)) * decoded.rate),
      )
      worker = new Worker(new URL('../audio/matcher.worker.ts', import.meta.url), {
        type: 'module',
      })
      const match = await new Promise<Match>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Analysis timed out.')), 30_000)
        worker!.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('Analysis failed.'))
        }
        worker!.onmessage = (event) => {
          if (event.data.type === 'ready')
            worker!.postMessage({ type: 'query', samples: excerpt, rate: decoded.rate })
          else if (event.data.type === 'match') {
            clearTimeout(timeout)
            resolve(event.data.match)
          } else {
            clearTimeout(timeout)
            reject(new Error(event.data.message))
          }
        }
        worker!.postMessage({ type: 'reference', samples: decoded.samples, rate: decoded.rate }, [
          decoded.samples.buffer,
        ])
      })
      setTest(
        match.state === 'matched'
          ? `Match found at ${match.time.toFixed(1)} seconds. Expected ${(start + excerpt.length / decoded.rate).toFixed(1)} seconds. This tests the matcher with the recording, without turning on your microphone.`
          : `${match.state === 'ambiguous' ? 'Repeated passage: position is ambiguous.' : 'No confident match.'} Try a recording with more distinctive musical changes.`,
      )
    } catch (error) {
      setTest(String(error))
    } finally {
      worker?.terminate()
      setTesting(false)
    }
  }
  return (
    <>
      <div className="song-heading">
        <div>
          <span className="eyebrow">NOW SINGING</span>
          <h2>{song.title}</h2>
          <p>{song.artist}</p>
        </div>
        <span className="pill">{song.timing === 'word' ? 'Word by word' : 'Line by line'}</span>
      </div>
      <div className="mode-controls" aria-label="Playback mode">
        <button
          aria-pressed={mode === 'play'}
          onClick={() => {
            follow.stop()
            setMode('play')
          }}
        >
          ▶ Play & sing
        </button>
        <button
          aria-pressed={mode === 'listen'}
          onClick={() => {
            audio.current?.pause()
            setMode('listen')
          }}
        >
          ◉ Listen & follow
        </button>
      </div>
      <section ref={stage} className="karaoke-stage" aria-label="Karaoke lyrics">
        <div className="stage-top">
          <span>
            {mode === 'listen'
              ? ['off', 'error'].includes(result.state)
                ? 'MICROPHONE OFF'
                : locked
                  ? 'LIVE · MATCHED'
                  : 'LIVE · WAITING FOR MATCH'
              : playing
                ? 'SING ALONG'
                : 'READY WHEN YOU ARE'}
          </span>
          <button
            className="quiet"
            onClick={() => {
              const p = document.fullscreenElement
                ? document.exitFullscreen()
                : stage.current?.requestFullscreen()
              void p?.catch(() => toast.show('Full screen is unavailable in this browser.'))
            }}
          >
            ⛶ <span>Full screen</span>
          </button>
        </div>
        <div className="lyric-window">
          <p className="context-line">
            {index > 0
              ? song.lines[index - 1].words.map((w) => w.text).join(' ')
              : 'Take a breath. Find your voice.'}
          </p>
          <div
            className="current-line"
            aria-label={
              current?.words.map((w) => w.text).join(' ') ??
              (mode === 'listen'
                ? 'Waiting for a confident match'
                : time >= song.lines.at(-1)!.end
                  ? 'Thank you for singing'
                  : 'Instrumental · get ready')
            }
          >
            {current ? (
              current.words.map((word, i) => (
                <span
                  key={i}
                  data-active={lyricTime >= word.start && lyricTime < word.end}
                  className={
                    lyricTime >= word.end ? 'sung' : lyricTime >= word.start ? 'active-word' : ''
                  }
                >
                  {word.text}{' '}
                </span>
              ))
            ) : (
              <span>
                {mode === 'listen' && !locked
                  ? ['off', 'error'].includes(result.state)
                    ? 'Turn on the microphone to follow'
                    : 'Listening for your song…'
                  : time >= song.lines.at(-1)!.end
                    ? 'Thank you for singing.'
                    : 'Instrumental · get ready'}
              </span>
            )}
          </div>
          <p className="context-line next-line">
            {next?.words.map((w) => w.text).join(' ') ?? '♪'}
          </p>
        </div>
        <div className="stage-bottom">
          <span>
            {mode === 'play' ? clock(time) : locked ? clock(lyricTime) : '—:—'}{' '}
            <span className="dim">/ {clock(song.duration)}</span>
          </span>
          <span>{index >= 0 ? `Line ${index + 1} of ${song.lines.length}` : '♪'}</span>
        </div>
      </section>
      <audio
        ref={audio}
        src={song.audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() =>
          toast.show('The recording could not be loaded. Reattach your audio file if needed.')
        }
      />
      {mode === 'play' ? (
        <div className="transport panel">
          <button className="primary play-button" onClick={() => void toggle()}>
            {playing ? 'Ⅱ Pause' : '▶ Play song'}
          </button>
          <label className="seek-label">
            <span className="sr-only">Song position</span>
            <input
              aria-label="Song position"
              type="range"
              min="0"
              max={song.duration}
              step="0.05"
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
            />
          </label>
          <label className="small-control">
            Speed
            <select
              value={rate}
              onChange={(e) => {
                const v = Number(e.target.value)
                setRate(v)
                if (audio.current) audio.current.playbackRate = v
              }}
            >
              <option value="0.75">0.75×</option>
              <option value="1">1×</option>
              <option value="1.25">1.25×</option>
            </select>
          </label>
        </div>
      ) : (
        <div className="panel mic-panel">
          <div role="status" className={locked ? 'status good' : 'status'}>
            {labels[result.state]}
          </div>
          <p>
            Play this song’s associated recording on another device or nearby speaker. Your
            microphone is processed locally; nothing is uploaded or saved. This is recording
            matching, so live singing alone may not match.
          </p>
          <button
            className="primary"
            onClick={() => {
              if (['off', 'error'].includes(result.state)) void follow.start()
              else follow.stop()
            }}
          >
            {['off', 'error'].includes(result.state) ? 'Turn on microphone' : 'Stop listening'}
          </button>
        </div>
      )}
      <div className="fine-controls">
        <label>
          Lyric adjustment{' '}
          <input
            aria-label="Lyric adjustment in seconds"
            type="number"
            min="-5"
            max="5"
            step="0.1"
            value={offset}
            onChange={(e) => setOffset(Math.max(-5, Math.min(5, Number(e.target.value))))}
          />{' '}
          seconds
        </label>
        <button
          className="link-button"
          onClick={() =>
            download(new Blob([toLrc(song)], { type: 'text/plain' }), `${song.id}.lrc`)
          }
        >
          ↓ Download timed lyrics
        </button>
      </div>
      <details className="panel lyrics-list">
        <summary>
          All lyrics · {mode === 'play' ? 'choose a line to jump' : 'reference text'}
        </summary>
        {song.lines.map((line, i) => (
          <button
            key={i}
            className={i === index ? 'selected-line' : ''}
            disabled={mode === 'listen'}
            onClick={() => seek(line.start)}
          >
            <span>{clock(line.start)}</span>
            {line.words.map((w) => w.text).join(' ')}
          </button>
        ))}
      </details>
      <details className="panel">
        <summary>Recording & matching check</summary>
        <p>{song.credit ?? 'Your own recording and lyrics, stored in this browser.'}</p>
        <p>
          Matching needs several seconds of audible, distinctive music. Identical repeated passages,
          changed arrangements, loud vocals, or a different recording can prevent a reliable match.
          If the position is uncertain, highlighting waits.
        </p>
        <button disabled={testing} onClick={() => void checkSample()}>
          {testing ? 'Checking…' : 'Test a mid-song excerpt'}
        </button>
        <p role="status">{test}</p>
        <a href={song.audioUrl} download={`${song.id}.wav`}>
          Download associated recording
        </a>
      </details>
    </>
  )
}
