class KaraokeCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.parts = []
    this.count = 0
  }
  process(inputs, outputs) {
    // Keep the worklet running through a silent output, never monitor the mic.
    for (const channel of outputs[0] || []) channel.fill(0)
    const channels = inputs[0]
    if (channels && channels.length) {
      const mono = new Float32Array(channels[0].length)
      for (const channel of channels)
        for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / channels.length
      this.parts.push(mono)
      this.count += mono.length
      if (this.count >= sampleRate / 4) {
        const data = new Float32Array(this.count)
        let offset = 0
        for (const part of this.parts) {
          data.set(part, offset)
          offset += part.length
        }
        this.port.postMessage(data, [data.buffer])
        this.parts = []
        this.count = 0
      }
    }
    return true
  }
}
registerProcessor('karaoke-capture', KaraokeCapture)
