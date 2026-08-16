// workerSource.ts — the classic-worker Blob source, ported from
// spikes/s01-fingers.html's workerSrc (see spikes/README.md:31 and that
// file's own comment: @mediapipe/tasks-vision's WASM loader calls
// importScripts() internally, which throws in a {type:'module'} Worker —
// "ModuleFactory not set", confirmed live via headless Chrome. The working
// pattern (matching MediaPipe's own worker codelab) is a CLASSIC worker
// that pulls the IIFE bundle in via importScripts(), exposing a global
// `Vision` namespace. OffscreenCanvas is used for off-thread overlay
// rendering; detectForVideo() is fed the raw ImageBitmap directly (a
// documented supported source type).
//
// Ships as a self-contained string (like the spike) because
// AudioWorkletProcessor/classic-Worker sources must be Blob-URL-loadable —
// this can't be a normal imported module. countFingers/dist/HAND_CONNECTIONS
// are duplicated inline (JSON-serialized) rather than shared, same
// constraint the spike documented: the worker is a self-contained Blob.
//
// M5 parity fix: the worker already computed per-frame fingertip velocity
// internally (for its own settled/unsettled overlay-stroke-color flag) but
// discarded the raw number — it's now included in the 'result' message so
// mediapipeFingerRecognizer.ts can run @morra/recognition's own
// stepVelocityStateMachine on the main thread and surface real
// motion-onset events (FingerRecognitionResult.motionOnset), closing the
// gap where the app could only anchor sync timing on count-stability
// (a ~200ms-late bias vs the spike's velocity-anchored timing).

import { HAND_CONNECTIONS } from "./counting.js";

export interface WorkerSourceUrls {
  tasksVisionBundleUrl: string;
  tasksVisionWasmUrl: string;
  handModelUrl: string;
  numHands: number;
}

export function buildFingerWorkerSource(urls: WorkerSourceUrls): string {
  return [
    `importScripts(${JSON.stringify(urls.tasksVisionBundleUrl)});`,
    "const { FilesetResolver, HandLandmarker } = self.Vision;",
    "",
    "let handLandmarker = null;",
    "let canvas = new OffscreenCanvas(640, 480);",
    "let ctx = canvas.getContext('2d');",
    "let settleThreshold = 0.8;",
    "let prevTips = null;",
    "let prevTs = null;",
    "",
    `const CONNECTIONS = ${JSON.stringify(HAND_CONNECTIONS)};`,
    "",
    "function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)); }",
    "function countFingers(lm) {",
    "  const wrist = lm[0];",
    "  const fingers = [[8,6],[12,10],[16,14],[20,18]];",
    "  let count = 0;",
    "  for (const pair of fingers) {",
    "    const tip = pair[0], pip = pair[1];",
    "    if (dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.05) count++;",
    "  }",
    "  const thumbTip = lm[4], thumbIp = lm[3], pinkyMcp = lm[17];",
    "  const thumbLateral = dist(thumbTip, pinkyMcp) > dist(thumbIp, pinkyMcp) * 1.05;",
    "  const thumbUp = count === 0 && dist(thumbTip, wrist) > dist(thumbIp, wrist) * 1.15;",
    "  if (thumbLateral || thumbUp) count++;",
    "  return count;",
    "}",
    "",
    "async function init() {",
    "  try {",
    `    const vision = await FilesetResolver.forVisionTasks(${JSON.stringify(urls.tasksVisionWasmUrl)});`,
    "    let delegate = 'GPU';",
    "    try {",
    "      handLandmarker = await HandLandmarker.createFromOptions(vision, {",
    `        baseOptions: { modelAssetPath: ${JSON.stringify(urls.handModelUrl)}, delegate: 'GPU' },`,
    `        runningMode: 'VIDEO', numHands: ${urls.numHands}`,
    "      });",
    "    } catch (gpuErr) {",
    "      delegate = 'CPU';",
    "      handLandmarker = await HandLandmarker.createFromOptions(vision, {",
    `        baseOptions: { modelAssetPath: ${JSON.stringify(urls.handModelUrl)}, delegate: 'CPU' },`,
    `        runningMode: 'VIDEO', numHands: ${urls.numHands}`,
    "      });",
    "    }",
    "    postMessage({ type: 'ready', delegate: delegate });",
    "  } catch (err) {",
    "    postMessage({ type: 'fatal-error', message: String((err && err.message) || err) });",
    "  }",
    "}",
    "init();",
    "",
    "self.onmessage = async (ev) => {",
    "  const msg = ev.data;",
    "  if (msg.type === 'config') { settleThreshold = msg.settleThreshold; return; }",
    "  if (msg.type !== 'frame' || !handLandmarker) {",
    "    if (msg.bitmap && msg.bitmap.close) msg.bitmap.close();",
    "    return;",
    "  }",
    "  const bitmap = msg.bitmap;",
    "  const id = msg.id;",
    "  const timestamp = msg.timestamp;",
    "  try {",
    "    if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {",
    "      canvas.width = bitmap.width; canvas.height = bitmap.height;",
    "    }",
    "    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);",
    "",
    "    const t0 = performance.now();",
    "    const result = handLandmarker.detectForVideo(bitmap, timestamp);",
    "    const t1 = performance.now();",
    "    const inferenceMs = t1 - t0;",
    "",
    "    let count = null, settled = false, handDetected = false, landmarks = null, velocity = null;",
    "    if (result.landmarks && result.landmarks.length > 0) {",
    "      handDetected = true;",
    "      const lm = result.landmarks[0];",
    "      landmarks = lm;",
    "      count = countFingers(lm);",
    "",
    "      const tips = [4,8,12,16,20].map((i) => lm[i]);",
    "      if (prevTips && prevTs != null) {",
    "        const dt = Math.max(1, timestamp - prevTs) / 1000;",
    "        let totalDisp = 0;",
    "        for (let i = 0; i < tips.length; i++) totalDisp += dist(tips[i], prevTips[i]);",
    "        velocity = (totalDisp / tips.length) / dt;",
    "        settled = velocity < settleThreshold;",
    "      }",
    "      prevTips = tips;",
    "      prevTs = timestamp;",
    "",
    "      ctx.lineWidth = 2;",
    "      ctx.strokeStyle = settled ? '#2ea043' : '#d29922';",
    "      ctx.beginPath();",
    "      for (const c of CONNECTIONS) {",
    "        const a = lm[c[0]], b = lm[c[1]];",
    "        ctx.moveTo(a.x * canvas.width, a.y * canvas.height);",
    "        ctx.lineTo(b.x * canvas.width, b.y * canvas.height);",
    "      }",
    "      ctx.stroke();",
    "      ctx.fillStyle = '#58a6ff';",
    "      for (const p of lm) {",
    "        ctx.beginPath();",
    "        ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, Math.PI * 2);",
    "        ctx.fill();",
    "      }",
    "    } else {",
    "      prevTips = null; prevTs = null;",
    "    }",
    "",
    "    bitmap.close();",
    "    const overlayBitmap = canvas.transferToImageBitmap();",
    "    postMessage({",
    "      type: 'result', id, count, settled, handDetected, landmarks, velocity, inferenceMs, timestamp, overlayBitmap",
    "    }, [overlayBitmap]);",
    "  } catch (err) {",
    "    if (bitmap && bitmap.close) bitmap.close();",
    "    postMessage({ type: 'frame-error', id, message: String((err && err.message) || err) });",
    "  }",
    "};",
  ].join("\n");
}
