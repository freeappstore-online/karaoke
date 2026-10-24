// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useTabRecorder } from './useTabRecorder'

class MockRecorder {
  static isTypeSupported = () => true
  state: RecordingState = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  stream: MediaStream
  constructor(stream: MediaStream) {
    this.stream = stream
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['recorded audio'], { type: this.mimeType }) })
    this.onstop?.()
  }
}

describe('useTabRecorder', () => {
  const stopTrack = vi.fn()
  const track = { stop: stopTrack, addEventListener: vi.fn() } as unknown as MediaStreamTrack
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as MediaStream
  const getDisplayMedia = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', MockRecorder)
    vi.stubGlobal(
      'MediaStream',
      class {
        tracks: MediaStreamTrack[]
        constructor(tracks: MediaStreamTrack[]) {
          this.tracks = tracks
        }
      },
    )
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    })
    getDisplayMedia.mockResolvedValue(stream)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('captures tab audio, previews it after Stop, and releases every track', async () => {
    const { result, unmount } = renderHook(() => useTabRecorder())
    await act(async () => {
      await result.current.start()
    })
    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true })
    expect(result.current.status).toBe('recording')
    act(() => result.current.stop())
    await waitFor(() => expect(result.current.status).toBe('preview'))
    expect(result.current.preview?.type).toBe('audio/webm')
    expect(result.current.previewUrl).toBe('blob:preview')
    expect(stopTrack).toHaveBeenCalled()
    act(() => result.current.discard())
    expect(result.current.status).toBe('idle')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    unmount()
  })

  it('keeps the editor available when the picker is denied', async () => {
    getDisplayMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    const { result } = renderHook(() => useTabRecorder())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toMatch(/cancelled or denied/)
  })

  it('discards cancelled audio and stops sharing', async () => {
    const { result } = renderHook(() => useTabRecorder())
    await act(async () => {
      await result.current.start()
    })
    act(() => result.current.cancel())
    expect(result.current.status).toBe('idle')
    expect(result.current.preview).toBeNull()
    expect(stopTrack).toHaveBeenCalled()
  })

  it('rejects a shared source without audio and stops its tracks', async () => {
    getDisplayMedia.mockResolvedValueOnce({ ...stream, getAudioTracks: () => [] })
    const { result } = renderHook(() => useTabRecorder())
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.error).toMatch(/No audio was shared/)
    expect(stopTrack).toHaveBeenCalled()
  })
})
