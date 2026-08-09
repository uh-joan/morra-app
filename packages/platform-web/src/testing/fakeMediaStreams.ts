// fakeMediaStreams.ts — injectable fake mic/camera MediaStreams, "where
// feasible" per the M3 dispatch's test-mode seam item. Browser-only (no
// spike equivalent — the spike always used a real device). This is an
// ALTERNATIVE to Chrome's --use-fake-device-for-media-stream launch flag:
// useful when a test needs a stream it can construct/tear down inline
// (e.g. a page that must work with a specific synthetic signal) rather than
// relying on browser launch args.
export function createFakeVideoStream(width = 320, height = 240, fps = 30): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const c2d = canvas.getContext("2d")!;
  c2d.fillStyle = "#333";
  c2d.fillRect(0, 0, width, height);
  let hue = 0;
  const timer = setInterval(() => {
    hue = (hue + 5) % 360;
    c2d.fillStyle = `hsl(${hue}, 40%, 30%)`;
    c2d.fillRect(0, 0, width, height);
  }, Math.round(1000 / fps));
  const stream = canvas.captureStream(fps);
  stream.getVideoTracks()[0]?.addEventListener("ended", () => clearInterval(timer));
  return stream;
}

export interface FakeAudioStream {
  stream: MediaStream;
  stop: () => void;
}

/** A quiet synthetic tone (NOT speech) — useful for exercising the VAD/
 * onset pipeline end-to-end without asserting anything about recognized
 * word content, same isolation strategy @morra/recognition's integration
 * fixture uses for its vosk check. */
export function createFakeAudioStream(ctx: AudioContext, frequency = 440): FakeAudioStream {
  const dest = ctx.createMediaStreamDestination();
  const osc = ctx.createOscillator();
  osc.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.value = 0.05;
  osc.connect(gain).connect(dest);
  osc.start();
  return {
    stream: dest.stream,
    stop: () => {
      osc.stop();
      osc.disconnect();
      gain.disconnect();
    },
  };
}
