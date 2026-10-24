// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Song } from '../lyrics/model'
import { useFollow } from './useFollow'

vi.mock('./decode', () => ({
  decode: vi.fn(async () => ({ samples: new Float32Array(8000), rate: 8000 })),
}))

const song = { id: 'first', audioUrl: '/first.wav' } as Song
const secondSong = { id: 'second', audioUrl: '/second.wav' } as Song

describe('microphone follow lifecycle', () => {
  const stopTrack = vi.fn()
  const closeContext = vi.fn(async () => {})
  const terminateWorker = vi.fn()
  const disconnectSource = vi.fn()
  const disconnectNode = vi.fn()
  const getUserMedia = vi.fn()
  let track: MediaStreamTrack
  let stream: MediaStream

  beforeEach(() => {
    track = { stop: stopTrack, onended: null } as unknown as MediaStreamTrack
    stream = { getTracks: () => [track] } as MediaStream
    getUserMedia.mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, blob: async () => new Blob() })),
    )
    vi.stubGlobal(
      'AudioContext',
      class {
        sampleRate = 48000
        audioWorklet = { addModule: vi.fn(async () => {}) }
        resume = vi.fn(async () => {})
        close = closeContext
        createMediaStreamSource() {
          return { connect: vi.fn(), disconnect: disconnectSource }
        }
        destination = {}
      },
    )
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = { onmessage: null }
        connect = vi.fn()
        disconnect = disconnectNode
      },
    )
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: ((event: { data: { type: string } }) => void) | null = null
        onerror = null
        terminate = terminateWorker
        postMessage(message: { type: string }) {
          if (message.type === 'reference') this.onmessage?.({ data: { type: 'ready' } })
        }
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  async function listening() {
    const hook = renderHook(({ currentSong }) => useFollow(currentSong), {
      initialProps: { currentSong: song },
    })
    await act(async () => hook.result.current.start())
    expect(hook.result.current.result.state).toBe('listening')
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    })
    return hook
  }

  it('explains permission denial without retaining a microphone', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    const hook = renderHook(() => useFollow(song))
    await act(async () => hook.result.current.start())
    expect(hook.result.current.result.state).toBe('error')
    expect(hook.result.current.result.message).toMatch(/Allow microphone access/)
    expect(stopTrack).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('releases a late permission grant after Stop', async () => {
    let grant!: (value: MediaStream) => void
    getUserMedia.mockReturnValueOnce(
      new Promise<MediaStream>((resolve) => {
        grant = resolve
      }),
    )
    const hook = renderHook(() => useFollow(song))
    act(() => {
      void hook.result.current.start()
    })
    act(() => hook.result.current.stop())
    await act(async () => grant(stream))
    await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1))
    expect(hook.result.current.result.state).toBe('off')
    hook.unmount()
  })

  it.each(['Stop', 'song change', 'screen change', 'page hiding', 'navigation', 'track ending'])(
    'releases microphone and processing on %s',
    async (action) => {
      const hook = await listening()
      act(() => {
        if (action === 'Stop') hook.result.current.stop()
        if (action === 'song change') hook.rerender({ currentSong: secondSong })
        if (action === 'screen change') hook.unmount()
        if (action === 'page hiding') {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true })
          document.dispatchEvent(new Event('visibilitychange'))
        }
        if (action === 'navigation') window.dispatchEvent(new Event('pagehide'))
        if (action === 'track ending') track.onended?.(new Event('ended'))
      })
      expect(stopTrack).toHaveBeenCalled()
      expect(terminateWorker).toHaveBeenCalled()
      expect(disconnectSource).toHaveBeenCalled()
      expect(disconnectNode).toHaveBeenCalled()
      expect(closeContext).toHaveBeenCalled()
      hook.unmount()
    },
  )
})
