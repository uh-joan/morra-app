// resample.ts — ported verbatim from spikes/s03-beat.html's
// resampleTo16kMono, generalized to any target sample rate (vosk needs
// 16kHz specifically; the function itself never hardcoded that).

export async function resampleToSampleRate(
  float32Array: Float32Array,
  srcSampleRate: number,
  targetSampleRate: number
): Promise<Float32Array> {
  if (srcSampleRate === targetSampleRate) return float32Array;
  const duration = float32Array.length / srcSampleRate;
  const offlineCtx = new OfflineAudioContext(1, Math.max(1, Math.ceil(duration * targetSampleRate)), targetSampleRate);
  const srcBuffer = offlineCtx.createBuffer(1, float32Array.length, srcSampleRate);
  // TS's DOM lib types copyToChannel as wanting Float32Array<ArrayBuffer>
  // specifically (not the wider ArrayBufferLike a generic Float32Array
  // param carries) — real captured audio is always a plain ArrayBuffer,
  // never SharedArrayBuffer-backed, so this narrowing is safe.
  srcBuffer.copyToChannel(float32Array as Float32Array<ArrayBuffer>, 0);
  const srcNode = offlineCtx.createBufferSource();
  srcNode.buffer = srcBuffer;
  srcNode.connect(offlineCtx.destination);
  srcNode.start();
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0).slice();
}
