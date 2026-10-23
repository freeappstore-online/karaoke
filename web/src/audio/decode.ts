export async function decode(blob: Blob) {
  const context = new AudioContext()
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer())
    const samples = new Float32Array(buffer.length)
    for (let c = 0; c < buffer.numberOfChannels; c++) { const channel = buffer.getChannelData(c); for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / buffer.numberOfChannels }
    return { samples, rate: buffer.sampleRate, duration: buffer.duration }
  } finally { await context.close() }
}
