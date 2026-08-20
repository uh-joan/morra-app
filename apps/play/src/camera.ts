// camera.ts — ports spikes/s03-beat.html L1859–2030: MediaPipe init with
// GPU→CPU retry (initHandLandmarker), startCamera, the rVFC onVideoFrame
// loop, monotonicMs, camera FPS chip, drawHandOverlay, setHandDetected, and
// the big-number renders (L1534–1548). MediaPipe runs on the MAIN THREAD via
// dynamic import of the +esm URL — no worker, no createImageBitmap (finding
// I; 0.10.14 ships no vision_bundle.js so a worker loader 404s, race #11).
// Timestamps: rVFC metadata.expectedDisplayTime is the perf-timeline `t` for
// ALL offset math; MediaPipe's graph gets the monotonicMs()-clamped value
// only (its calculator graph hard-requires strictly increasing timestamps,
// which expectedDisplayTime does not guarantee — race #1).

import { countFingers, countFingersSpike, HAND_CONNECTIONS, computeCentroidVelocity, type Centroid, type Landmark } from "@morra/recognition";
import {
  FINGER_COUNT_RULE,
  HAND_FRAME_HISTORY_MS,
  MEDIAPIPE_HAND_LANDMARKER_TASK_URL,
  MEDIAPIPE_VISION_ESM_URL,
  MEDIAPIPE_VISION_WASM_URL,
} from "./config.js";
import { el } from "./dom.js";
import { reportError, setChip } from "./status.js";
import { ensureAudioResumed } from "./audioClock.js";
import { currentHandState, processHandVelocity, setPreOnsetCountProvider } from "./velocity.js";
import { preOnsetFingerCount } from "./game/preOnset.js";
import { renderBigNumber, renderBigNumberError, renderBigNumberNoHand } from "./render/bigNumber.js";
import { recordFrame } from "./landmarkRecorder.js";
import { computeFraming, drawFramingGuide, FRAMING_COPY, type FramingState, NO_HAND } from "./framing.js";
import { deviceKeyFrom } from "./calibration/store.js";

interface HandLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): { landmarks?: Landmark[][] };
}

let handLandmarker: HandLandmarkerLike | null = null;
let handDelegateActive: "GPU" | "CPU" | null = null;
export let handTrackingActive = false;

let lastKnownFingerCount: number | null = null;

/** Camera device fingerprint (calibration is per profile+device). Set on
 * startCamera from the live track's settings; "unknown" before that. */
export let cameraDeviceKey = "unknown";
let onDeviceKey: (key: string) => void = () => {};
export function setDeviceKeyHandler(h: (key: string) => void): void {
  onDeviceKey = h;
  if (cameraDeviceKey !== "unknown") h(cameraDeviceKey);
}

// Framing guide (ghost hand): computed every detected-hand frame; drawn on
// the overlay only while some flow asked for it (calibration, onboarding).
let framingGuideOn = false;
let lastFraming: FramingState = NO_HAND;
let framingHintEl: HTMLElement | null | undefined;
let onFraming: (s: FramingState) => void = () => {};
export function setFramingGuide(on: boolean): void {
  framingGuideOn = on;
  if (framingHintEl === undefined) framingHintEl = document.getElementById("framingHint");
  if (framingHintEl && !on) framingHintEl.hidden = true;
}
export function setFramingHandler(h: (s: FramingState) => void): void {
  onFraming = h;
}
export function currentFraming(): FramingState {
  return lastFraming;
}
function updateFraming(lm: Landmark[] | null): void {
  const next = computeFraming(lm);
  const changed = next.hint !== lastFraming.hint || next.inZone !== lastFraming.inZone;
  lastFraming = next;
  if (framingGuideOn) {
    if (framingHintEl === undefined) framingHintEl = document.getElementById("framingHint");
    if (framingHintEl && changed) {
      framingHintEl.textContent = FRAMING_COPY[next.hint];
      framingHintEl.hidden = next.inZone;
      framingHintEl.classList.toggle("in-zone", next.inZone);
    }
  }
  if (changed) onFraming(next);
}
let camFrameTimes: number[] = []; // rolling perf timestamps, for the fps readout
export const handFrameHistory: { t: number; count: number }[] = []; // {t, count} per detected-hand frame

// Registered at module init: the velocity FSM asks for the resting count the
// instant it fires an onset (same frame, before the history moves on).
setPreOnsetCountProvider((motionStart) => preOnsetFingerCount(handFrameHistory, motionStart));

let lastHandPos: Centroid | null = null;
let lastHandT: number | null = null;

let overlayCtx: CanvasRenderingContext2D | null = null;

// Per-frame count hook — game.ts's updateReadyPillFromFrame plugs in at M5;
// until then the shell only shows the live readouts.
export type FrameCountHandler = (count: number | null) => void;
let onFrameCount: FrameCountHandler = () => {};
export function setFrameCountHandler(handler: FrameCountHandler): void {
  onFrameCount = handler;
}

export function lastFingerCount(): number | null {
  return lastKnownFingerCount;
}

async function initHandLandmarker(): Promise<void> {
  // jsdelivr, not esm.sh: FilesetResolver needs to fetch raw .wasm/loader
  // files next to the module, which esm.sh's transform pipeline does not
  // serve ("ModuleFactory not set" — spike finding). The +esm module URL and
  // the raw /wasm asset URL are deliberately different (config.ts).
  const { HandLandmarker, FilesetResolver } = await import(/* @vite-ignore */ MEDIAPIPE_VISION_ESM_URL);
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_VISION_WASM_URL);
  const modelAssetPath = MEDIAPIPE_HAND_LANDMARKER_TASK_URL;
  // GPU delegate can throw on real hardware/driver combos that fake devices
  // never exercise — retry once on CPU rather than leaving hand tracking
  // dead with no signal (spike L1873–1891).
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
    });
    handDelegateActive = "GPU";
  } catch (gpuErr) {
    reportError("model", new Error(`GPU delegate failed (${gpuErr instanceof Error ? gpuErr.message : gpuErr}), retrying on CPU`));
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 1,
    });
    handDelegateActive = "CPU";
  }
}

export async function startCamera(): Promise<void> {
  el.btnCam.disabled = true;
  setChip(el.chipCamera, "requesting…", "warn");
  setChip(el.chipModel, "loading…", "warn");
  try {
    // Inside the button gesture: also unfreeze the shared AudioContext so
    // the clock mapping goes live (finding A).
    await ensureAudioResumed();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
    el.camPreview.srcObject = stream;
    await el.camPreview.play();
    const track = stream.getVideoTracks()[0];
    const settings: MediaTrackSettings = track?.getSettings ? track.getSettings() : {};
    cameraDeviceKey = deviceKeyFrom(settings);
    onDeviceKey(cameraDeviceKey);
    el.handOverlay.width = el.camPreview.videoWidth || settings.width || 480;
    el.handOverlay.height = el.camPreview.videoHeight || settings.height || 360;
    overlayCtx = el.handOverlay.getContext("2d");
    setChip(el.chipCamera, `${el.handOverlay.width}x${el.handOverlay.height}`, "ok");

    await initHandLandmarker();

    handTrackingActive = true;
    setChip(el.chipModel, `loaded (${handDelegateActive})`, handDelegateActive === "GPU" ? "ok" : "warn");
    el.camPreview.requestVideoFrameCallback(onVideoFrame);
  } catch (err) {
    setChip(el.chipCamera, "error", "bad");
    setChip(el.chipModel, "failed", "bad");
    renderBigNumberError(err instanceof Error ? err.message : String(err));
    reportError("camera/model", err);
    el.btnCam.disabled = false;
  }
}

let lastMpTimestampMs = -1;
export function monotonicMs(candidateMs: number): number {
  // MediaPipe's calculator graph requires strictly increasing timestamps;
  // expectedDisplayTime alone is not guaranteed monotonic (compositor
  // re-estimation; synthetic video sources jitter it). Feed the graph a
  // clamped-monotonic value while keeping the real expectedDisplayTime for
  // the actual offset math.
  const t = candidateMs <= lastMpTimestampMs ? lastMpTimestampMs + 1 : candidateMs;
  lastMpTimestampMs = t;
  return t;
}

function updateCameraFps(nowMs: number): void {
  camFrameTimes.push(nowMs);
  const cutoff = nowMs - 1000;
  while (camFrameTimes.length && camFrameTimes[0]! < cutoff) camFrameTimes.shift();
  const fps = camFrameTimes.length;
  setChip(el.chipCamera, `${el.handOverlay.width}x${el.handOverlay.height} @ ${fps}fps`, "ok");
}

function drawHandOverlay(lm: Landmark[] | null, settled: boolean): void {
  if (!overlayCtx) return;
  const w = el.handOverlay.width;
  const h = el.handOverlay.height;
  overlayCtx.clearRect(0, 0, w, h);
  // body[data-ma] is the hand choice from the Calibratge tabs (right by
  // default): the ghost is authored as a left hand, so mirror it for dreta.
  if (framingGuideOn) drawFramingGuide(overlayCtx, w, h, lastFraming, document.body.dataset.ma === "dreta");
  if (!lm) return;
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeStyle = settled ? "#2ea043" : "#d29922";
  overlayCtx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    overlayCtx.moveTo(lm[a]!.x * w, lm[a]!.y * h);
    overlayCtx.lineTo(lm[b]!.x * w, lm[b]!.y * h);
  }
  overlayCtx.stroke();
  overlayCtx.fillStyle = "#58a6ff";
  for (const p of lm) {
    overlayCtx.beginPath();
    overlayCtx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    overlayCtx.fill();
  }
}

function setHandDetected(detected: boolean): void {
  el.handIndicator.classList.toggle("on", detected);
  el.handIndicatorText.textContent = detected ? "mà a la vista" : "cap mà";
  setChip(el.chipHand, detected ? `detected (${currentHandState()})` : `none (${currentHandState()})`, detected ? "ok" : "dim");
}

function onVideoFrame(now: number, metadata: VideoFrameCallbackMetadata): void {
  el.camPreview.requestVideoFrameCallback(onVideoFrame);
  updateCameraFps(now);
  if (!handTrackingActive || !handLandmarker) return;
  // expectedDisplayTime is on the performance.now() timeline; mediaTime is a
  // different clock and is not used for offset math.
  const t = metadata.expectedDisplayTime ?? now;
  let result;
  try {
    result = handLandmarker.detectForVideo(el.camPreview, monotonicMs(t));
  } catch (err) {
    reportError("hand", err);
    renderBigNumberError(err instanceof Error ? err.message : String(err));
    return;
  }
  if (result && result.landmarks && result.landmarks.length) {
    const lm = result.landmarks[0]!;
    setHandDetected(true);
    updateFraming(lm);
    drawHandOverlay(lm, currentHandState() !== "spiking");
    const count = FINGER_COUNT_RULE === "spike" ? countFingersSpike(lm) : countFingers(lm);
    renderBigNumber(count);
    lastKnownFingerCount = count;
    handFrameHistory.push({ t, count });
    recordFrame(t, lm, count); // corpus recorder — no-op unless ?rec=1 and recording
    const cutoff = t - HAND_FRAME_HISTORY_MS;
    while (handFrameHistory.length && handFrameHistory[0]!.t < cutoff) handFrameHistory.shift();
    // Centroid velocity — the spike's formula (L1999–2008), NOT mean-per-tip
    // (see @morra/recognition tipVelocity.ts's header on why they differ).
    const tips = [4, 8, 12, 16, 20].map((i) => lm[i]!);
    const { v, centroid } = computeCentroidVelocity(tips, lastHandPos, lastHandT, t);
    if (v != null) processHandVelocity(t, v, lastKnownFingerCount);
    lastHandPos = centroid;
    lastHandT = t;
    onFrameCount(count);
  } else {
    setHandDetected(false);
    updateFraming(null);
    drawHandOverlay(null, false);
    renderBigNumberNoHand();
    lastHandPos = null;
    lastHandT = null;
    onFrameCount(null);
  }
}
