import { useCallback, useEffect, useRef, useState } from 'react'
import type { Song } from '../lyrics/model'
import type { Match } from './fingerprint'
import { decode } from './decode'
export type FollowState = {
  state:
    'off' | 'preparing' | 'listening' | 'matched' | 'ambiguous' | 'no-match' | 'quiet' | 'error'
  time: number
  at: number
  score: number
  message?: string
}
export function useFollow(song: Song) {
  const [result, setResult] = useState<FollowState>({ state: 'off', time: 0, at: 0, score: 0 })
  const resources = useRef<{
    worker?: Worker
    stream?: MediaStream
    context?: AudioContext
    node?: AudioWorkletNode
    source?: MediaStreamAudioSourceNode
  }>({})
  const generation = useRef(0)
  const stop = useCallback(() => {
    generation.current++
    const r = resources.current
    resources.current = {}
    r.worker?.terminate()
    r.node?.disconnect()
    r.source?.disconnect()
    r.stream?.getTracks().forEach((t) => t.stop())
    void r.context?.close().catch(() => {})
    setResult({ state: 'off', time: 0, at: 0, score: 0 })
  }, [])
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      stop()
    }
  }, [song.id, stop])
  const start = async () => {
    stop()
    const gen = generation.current
    setResult({ state: 'preparing', time: 0, at: 0, score: 0 })
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
        throw new Error(
          'Microphone follow needs HTTPS and a browser with AudioWorklet support. Try Play & sing instead.',
        )
      // Request permission only in this explicit user action. Never record or store mic audio.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      })
      if (generation.current !== gen) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      resources.current.stream = stream
      const context = new AudioContext()
      resources.current.context = context
      await context.resume()
      const response = await fetch(song.audioUrl)
      if (!response.ok) throw new Error('Cannot load the associated recording.')
      const reference = await decode(await response.blob())
      if (generation.current !== gen) return
      const worker = new Worker(new URL('./matcher.worker.ts', import.meta.url), { type: 'module' })
      resources.current.worker = worker
      await new Promise<void>((resolve, reject) => {
        worker.onmessage = (event) =>
          event.data.type === 'ready' ? resolve() : reject(new Error(event.data.message))
        worker.onerror = () => reject(new Error('Recording analysis failed.'))
        worker.postMessage(
          { type: 'reference', samples: reference.samples, rate: reference.rate },
          [reference.samples.buffer],
        )
      })
      if (generation.current !== gen) return
      await context.audioWorklet.addModule('/mic-worklet.js')
      if (generation.current !== gen) return
      const node = new AudioWorkletNode(context, 'karaoke-capture')
      resources.current.node = node
      const source = context.createMediaStreamSource(stream)
      resources.current.source = source
      source.connect(node)
      node.connect(context.destination)
      let chunks: Float32Array[] = [],
        count = 0,
        busy = false,
        lastQuery = 0
      let lock: { time: number; at: number } | undefined
      worker.onmessage = (event) => {
        busy = false
        if (generation.current !== gen) return
        if (event.data.type === 'error') {
          stop()
          setResult({ state: 'error', time: 0, at: 0, score: 0, message: event.data.message })
          return
        }
        const match = event.data.match as Match
        const at = event.data.request as number
        if (match.state === 'matched') lock = { time: match.time, at }
        else lock = undefined
        setResult({ state: match.state, time: match.time, at, score: match.score })
      }
      worker.onerror = () => {
        stop()
        setResult({
          state: 'error',
          time: 0,
          at: 0,
          score: 0,
          message: 'Audio matching stopped. Please try again.',
        })
      }
      node.port.onmessage = (event) => {
        const data = event.data as Float32Array
        chunks.push(data)
        count += data.length
        while (chunks.length > 1 && count - chunks[0].length >= context.sampleRate * 5)
          count -= chunks.shift()!.length
        const now = performance.now()
        if (count < context.sampleRate * 3.5 || busy || now - lastQuery < 700) return
        const pcm = new Float32Array(count)
        let offset = 0
        for (const chunk of chunks) {
          pcm.set(chunk, offset)
          offset += chunk.length
        }
        busy = true
        lastQuery = now
        const prior = lock && now - lock.at < 1600 ? lock.time + (now - lock.at) / 1000 : undefined
        worker.postMessage(
          { type: 'query', samples: pcm, rate: context.sampleRate, prior, request: now },
          [pcm.buffer],
        )
      }
      stream.getTracks().forEach((track) => {
        track.onended = stop
      })
      setResult({ state: 'listening', time: 0, at: 0, score: 0 })
    } catch (error) {
      if (generation.current !== gen) return
      stop()
      setResult({
        state: 'error',
        time: 0,
        at: 0,
        score: 0,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { result, start, stop }
}
