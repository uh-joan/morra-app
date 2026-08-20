// dom.ts — ports spikes/s03-beat.html L1063–1117 ($ + the el id map +
// setStatus), minus beat-mode/harness ids. Typed and fail-fast: a missing id
// throws at startup listing every absent element, so index.html/TS drift is
// caught the moment the page loads instead of as a null deref mid-round.

function grab(missing: string[], id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) {
    missing.push(id);
    // Placeholder keeps the el map total; buildEl throws before it's used.
    return document.createElement("div");
  }
  return node;
}

function buildEl() {
  const missing: string[] = [];
  const g = (id: string) => grab(missing, id);
  const el = {
    // mode + sensor rows
    btnModePartida: g("btnModePartida") as HTMLButtonElement,
    btnModeEntrenament: g("btnModeEntrenament") as HTMLButtonElement,
    btnCam: g("btnCam") as HTMLButtonElement,
    btnMic: g("btnMic") as HTMLButtonElement,
    btnLoadVosk: g("btnLoadVosk") as HTMLButtonElement,
    syncCoOccurrenceMs: g("syncCoOccurrenceMs") as HTMLInputElement,
    btnExportDebug: g("btnExportDebug") as HTMLButtonElement,
    selProfile: g("selProfile") as HTMLSelectElement,
    btnNewProfile: g("btnNewProfile") as HTMLButtonElement,
    btnDeleteProfile: g("btnDeleteProfile") as HTMLButtonElement,
    voskStatus: g("voskStatus"),
    // player side
    camPreview: g("camPreview") as HTMLVideoElement,
    handOverlay: g("handOverlay") as HTMLCanvasElement,
    handIndicator: g("handIndicator"),
    handIndicatorText: g("handIndicatorText"),
    bigNumber: g("bigNumber"),
    bigNumberLabel: g("bigNumberLabel"),
    bigWord: g("bigWord"),
    bigWordLabel: g("bigWordLabel"),
    readyPill: g("readyPill"),
    shoutBadge: g("shoutBadge"),
    voiceMeterFill: g("voiceMeterFill"),
    voiceThreshMark: g("voiceThreshMark"),
    tuneVadMult: g("tuneVadMult") as HTMLInputElement,
    onsetInfo: g("onsetInfo"),
    // rival side
    rivalSide: g("rivalSide"),
    rivalAvatar: g("rivalAvatar"),
    rivalHandSvg: g("rivalHandSvg"),
    rivalHandDigit: g("rivalHandDigit"),
    rivalWord: g("rivalWord"),
    aiCommitStatus: g("aiCommitStatus"),
    // training panel (L'Espill)
    trainingPanel: g("trainingPanel"),
    tileExploitability: g("tileExploitability"),
    tileRandomness: g("tileRandomness"),
    tileSyncRate: g("tileSyncRate"),
    tileMedianDelta: g("tileMedianDelta"),
    btnScopeSession: g("btnScopeSession") as HTMLButtonElement,
    btnScopeAllTime: g("btnScopeAllTime") as HTMLButtonElement,
    trainingSampleCount: g("trainingSampleCount"),
    fHistogram: g("fHistogram"),
    gHistogram: g("gHistogram"),
    topCallsList: g("topCallsList"),
    tellsList: g("tellsList"),
    espillHeadline: g("espillHeadline"),
    bigramHeadline: g("bigramHeadline"),
    trendStrip: g("trendStrip"),
    // L'Espill screen (coach card) + the Entrenament live strip
    coachLabel: g("coachLabel"),
    coachSentence: g("coachSentence"),
    coachPrice: g("coachPrice"),
    coachEvidence: g("coachEvidence"),
    coachCounter: g("coachCounter"),
    liveTopTell: g("liveTopTell"),
    trainingHead: g("trainingHead"),
    readingBox: g("readingBox"),
    readingName: g("readingName"),
    readingCount: g("readingCount"),
    readingDots: g("readingDots"),
    readingLast: g("readingLast"),
    liveExploit: g("liveExploit"),
    shadowCount: g("shadowCount"),
    shadowDots: g("shadowDots"),
    shadowLast: g("shadowLast"),
    missionIdle: g("missionIdle"),
    missionLive: g("missionLive"),
    missionDone: g("missionDone"),
    btnMissionTop: g("btnMissionTop") as HTMLButtonElement,
    missionTopTitle: g("missionTopTitle"),
    btnMissionCoverage: g("btnMissionCoverage") as HTMLButtonElement,
    missionTitle: g("missionTitle"),
    missionProgress: g("missionProgress"),
    missionBarFill: g("missionBarFill"),
    missionGoal: g("missionGoal"),
    missionLiveLine: g("missionLiveLine"),
    missionFeedback: g("missionFeedback"),
    btnMissionStop: g("btnMissionStop") as HTMLButtonElement,
    missionVerdict: g("missionVerdict"),
    btnMissionAgain: g("btnMissionAgain") as HTMLButtonElement,
    btnMissionClose: g("btnMissionClose") as HTMLButtonElement,
    btnOpenEspill: g("btnOpenEspill") as HTMLButtonElement,
    btnEspillBack: g("btnEspillBack") as HTMLButtonElement,
    btnEspillTrain: g("btnEspillTrain") as HTMLButtonElement,
    espillTabs: g("espillTabs"),
    espillPanes: g("espillPanes"),
    readHeadline: g("readHeadline"),
    readFBelief: g("readFBelief"),
    readDrivers: g("readDrivers"),
    readGBelief: g("readGBelief"),
    readSelfWatch: g("readSelfWatch"),
    bigramHeatmap: g("bigramHeatmap"),
    btnExportProfile: g("btnExportProfile") as HTMLButtonElement,
    btnProfileMenu: g("btnProfileMenu") as HTMLButtonElement,
    profileMenu: g("profileMenu"),
    btnResetProfile: g("btnResetProfile") as HTMLButtonElement,
    // game panel
    heroPrompt: g("heroPrompt"),
    gamePanel: g("gamePanel"),
    selAiLevel: g("selAiLevel") as HTMLSelectElement,
    aiLevelDescription: g("aiLevelDescription"),
    scoreboard: g("scoreboard"),
    roundResultCard: g("roundResultCard"),
    roundResultText: g("roundResultText"),
    roundResultDetail: g("roundResultDetail"),
    gameEndBanner: g("gameEndBanner"),
    gameEndText: g("gameEndText"),
    postMatchExploitability: g("postMatchExploitability"),
    postMatchRandomness: g("postMatchRandomness"),
    postMatchSyncRate: g("postMatchSyncRate"),
    btnGoToTraining: g("btnGoToTraining") as HTMLButtonElement,
    btnPlayAgain: g("btnPlayAgain") as HTMLButtonElement,
    // sync verdict + tally
    verdictCard: g("verdictCard"),
    verdictResult: g("verdictResult"),
    verdictDetail: g("verdictDetail"),
    verdictWord: g("verdictWord"),
    heroHitRate: g("heroHitRate"),
    heroThrowCount: g("heroThrowCount"),
    heroHitBarFill: g("heroHitBarFill"),
    syncMedianDelta: g("syncMedianDelta"),
    syncNaturalLead: g("syncNaturalLead"),
    // Ajustos (detector diagnostics + tunables)
    handVel: g("handVel"),
    handState: g("handState"),
    handVelMeterFill: g("handVelMeterFill"),
    micRms: g("micRms"),
    micThresh: g("micThresh"),
    micMeterFill: g("micMeterFill"),
    tuneHighV: g("tuneHighV") as HTMLInputElement,
    tuneLowV: g("tuneLowV") as HTMLInputElement,
    tuneSettleMs: g("tuneSettleMs") as HTMLInputElement,
    // status strip + errors + footer
    chipCamera: g("chipCamera"),
    chipModel: g("chipModel"),
    chipHand: g("chipHand"),
    chipMic: g("chipMic"),
    chipVad: g("chipVad"),
    chipVosk: g("chipVosk"),
    chipClock: g("chipClock"),
    sessionIdFooter: g("sessionIdFooter"),
    errorPanel: g("errorPanel"),
    errorList: g("errorList"),
    errorHeadText: g("errorHeadText"),
    btnClearErrors: g("btnClearErrors") as HTMLButtonElement,
  };
  if (missing.length) {
    throw new Error(`dom.ts: missing element id(s) in index.html: ${missing.join(", ")}`);
  }
  return el;
}

export const el = buildEl();
export type El = typeof el;

export function setStatus(node: HTMLElement, msg: string | null, kind?: "ok" | "err"): void {
  node.style.display = msg ? "block" : "none";
  node.textContent = msg || "";
  node.className = "status" + (kind ? " " + kind : "");
}
