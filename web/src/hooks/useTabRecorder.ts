import { useEffect, useRef, useState } from 'react'

type Status = 'idle' | 'requesting' | 'recording' | 'stopping' | 'preview'

export function useTabRecorder() {
  const [status, setStatus] = useState<Status>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const meterFrame = useRef<number | null>(null)
  const meterContext = useRef<AudioContext | null>(null)
  const url = useRef('')
  const cancelled = useRef(false)
  const mounted = useRef(true)
  const request = useRef(0)

  function clearPreview() {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = ''
    setPreview(null)
    setPreviewUrl('')
  }

  function stopTracks() {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  function stopTimer() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  function stopMeter() {
    if (meterFrame.current !== null) cancelAnimationFrame(meterFrame.current)
    meterFrame.current = null
    if (meterContext.current) void meterContext.current.close()
    meterContext.current = null
    if (mounted.current) setLevel(0)
  }

  function startMeter(audioStream: MediaStream) {
    if (typeof AudioContext === 'undefined') return
    try {
      const context = new AudioContext()
      meterContext.current = context
      const source = context.createMediaStreamSource(audioStream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      let lastUpdate = 0
      const measure = (timestamp: number) => {
        analyser.getByteTimeDomainData(samples)
        if (timestamp - lastUpdate >= 100) {
          let energy = 0
          for (const sample of samples) energy += ((sample - 128) / 128) ** 2
          setLevel(Math.min(100, Math.round(Math.sqrt(energy / samples.length) * 250)))
          lastUpdate = timestamp
        }
        meterFrame.current = requestAnimationFrame(measure)
      }
      meterFrame.current = requestAnimationFrame(measure)
      void context.resume().catch(() => {})
    } catch {
      stopMeter()
    }
  }

  function stop() {
    if (recorder.current?.state === 'recording') {
      setStatus('stopping')
      recorder.current.stop()
    }
    stopTimer()
    stopMeter()
    stopTracks()
  }

  function cancel() {
    cancelled.current = true
    request.current++
    stop()
    clearPreview()
    setStatus('idle')
    setError('')
  }

  function discard() {
    clearPreview()
    setStatus('idle')
  }

  async function start() {
    if (status !== 'idle' && status !== 'preview') return
    clearPreview()
    setError('')
    setElapsed(0)
    setLevel(0)
    setStatus('requesting')
    cancelled.current = false
    const currentRequest = ++request.current
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      setError('Tab recording is unavailable in this browser or device. Try a desktop browser.')
      setStatus('idle')
      return
    }
    let captured: MediaStream | null = null
    try {
      // Display capture requires a video source in Chrome. Only the audio track
      // is passed to MediaRecorder; the video track is never recorded.
      captured = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
      if (currentRequest !== request.current || !mounted.current) {
        captured.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = captured
      const audioTracks = captured.getAudioTracks()
      if (!audioTracks.length)
        throw new Error('No audio was shared. Select a tab and enable audio sharing in the picker.')
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      )
      const audioStream = new MediaStream(audioTracks)
      const mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined)
      recorder.current = mediaRecorder
      const chunks: Blob[] = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      mediaRecorder.onerror = () => {
        cancelled.current = true
        stopTimer()
        stopMeter()
        if (mediaRecorder.state === 'recording') mediaRecorder.stop()
        stopTracks()
        if (mounted.current) {
          setStatus('idle')
          setError('Recording failed. Try sharing the tab again.')
        }
      }
      mediaRecorder.onstop = () => {
        recorder.current = null
        stopTimer()
        stopMeter()
        stopTracks()
        if (!mounted.current || cancelled.current) return
        const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType || 'audio/webm' })
        if (!blob.size) {
          setStatus('idle')
          setError('No audio was recorded. Make sure the shared tab is playing audio.')
          return
        }
        url.current = URL.createObjectURL(blob)
        setPreview(blob)
        setPreviewUrl(url.current)
        setStatus('preview')
      }
      captured.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (mediaRecorder.state === 'recording') stop()
        })
      })
      mediaRecorder.start(1000)
      startMeter(audioStream)
      setStatus('recording')
      const started = Date.now()
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250)
    } catch (reason) {
      captured?.getTracks().forEach((track) => track.stop())
      stream.current = null
      stopMeter()
      if (currentRequest !== request.current || !mounted.current) return
      setStatus('idle')
      setError(
        reason instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(reason.name)
          ? 'Screen sharing was cancelled or denied. Your song is still here.'
          : reason instanceof DOMException && reason.name === 'InvalidStateError'
            ? 'The browser could not open the sharing picker. Click Record from tab again in a supported desktop browser.'
            : reason instanceof Error
              ? reason.message
              : 'Could not start tab recording.',
      )
    }
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      request.current++
      cancelled.current = true
      stopTimer()
      stopMeter()
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stopTracks()
      if (url.current) URL.revokeObjectURL(url.current)
    }
  }, [])

  return { status, elapsed, level, preview, previewUrl, error, start, stop, cancel, discard }
}
