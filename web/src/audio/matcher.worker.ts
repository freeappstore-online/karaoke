import { fingerprint, locate, type Fingerprint } from './fingerprint'
let reference: Fingerprint | undefined
self.onmessage = (event: MessageEvent) => {
  const { type, samples, rate, prior, request } = event.data
  try {
    if (type === 'reference') {
      reference = fingerprint(samples, rate)
      self.postMessage({ type: 'ready' })
    } else if (reference) {
      const match = locate(reference, fingerprint(samples, rate), prior)
      self.postMessage({ type: 'match', match, request })
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error) })
  }
}
