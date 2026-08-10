// appSingletons.ts — the composition root: every stateful, DOM/device-
// owning object in this app is created HERE, once, at module load —
// OUTSIDE React's lifecycle, per the M4 dispatch's boundary law. React
// components only ever read/call these; none of them are created inside a
// component body or effect (the `started` guard in startSensors() below is
// what makes the one unavoidable effect-driven call — actually starting
// devices, which needs a mounted <video> element — safe under React
// StrictMode's dev-time double-invoke).
import {
  AudioContextManager,
  CryptoRandomSource,
  EventBusTelemetrySink,
  LocalStoragePlayerModelStore,
  PerformanceClock,
  getOrCreateBrowserSessionId,
} from "@morra/platform-web";
import { GameStore } from "./game/gameStore.js";
import { SensorPipeline } from "./sensors/sensorPipeline.js";
import { RivalVoicePlayer } from "./sensors/rivalVoicePlayer.js";
import { LocalProfileRegistryStore } from "./profiles/localProfileRegistryStore.js";
import { LocalSettingsStore } from "./profiles/localSettingsStore.js";

const clock = new PerformanceClock();
const cryptoRandom = new CryptoRandomSource(); // implements BOTH RandomSource (AI decisions) and SecureRandomSource (nonces) — security audit M6
// BUG FIX (reload wiped the mirror's default "session" view — see
// sessionId.ts for the root cause): reload-stable, sessionStorage-backed id
// shared by BOTH the telemetry sink and GameStoreDeps.sessionId below, so a
// throw recorded before a reload and one recorded after are stamped with
// the SAME sessionId and both show up under the Entrenament mirror's
// default "session" scope.
const sessionId = getOrCreateBrowserSessionId();
const telemetry = new EventBusTelemetrySink({ endpoint: "/log", sessionId });
const playerModelStore = new LocalStoragePlayerModelStore();
// Feature 3 — "who's playing": profile registry (list of profiles +
// last-played) and per-profile settings, both web-app-layer concerns (see
// their own files' comments on why they're not @morra/platform-web ports).
const profileRegistryStore = new LocalProfileRegistryStore();
const settingsStore = new LocalSettingsStore();

export const store = new GameStore(
  {
    playerModelStore,
    settingsStore,
    profileRegistryStore,
    random: cryptoRandom,
    secureRandom: cryptoRandom,
    clock,
    sessionId: telemetry.sessionId,
    telemetry,
  },
  false // voskLoaded flips true once sensorPipeline confirms the model loaded
);

export const audioManager = new AudioContextManager();
export const sensorPipeline = new SensorPipeline(store, audioManager, "/assets/vosk-model/vosk-model-small-ca-0.4.zip");
export const rivalVoicePlayer = new RivalVoicePlayer(store, audioManager);

let started = false;
let startPromise: Promise<void> | null = null;

/** Idempotent — safe to call from a mount effect that React StrictMode
 * double-invokes in dev. */
export function startSensors(videoEl: HTMLVideoElement): Promise<void> {
  if (started) return startPromise ?? Promise.resolve();
  started = true;
  startPromise = Promise.all([sensorPipeline.start(videoEl), rivalVoicePlayer.load("/assets/rival-voice")]).then(() => undefined);
  return startPromise;
}
