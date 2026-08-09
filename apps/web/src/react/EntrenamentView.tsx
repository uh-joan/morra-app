// EntrenamentView.tsx — "L'Espill" (the mirror): headline tiles, f/g
// histograms, top-3 tells, bigram heatmap, session/all-time scope toggle,
// export/reset. Every number here comes straight out of @morra/core's
// mirror.ts (via gameStore.getMirrorData) — this view only formats and
// lays out numbers @morra/core already computed; it never recomputes
// analytics itself.
import { useMemo, useState } from "react";
import { store } from "../appSingletons.js";
import { useGameStore } from "./useStore.js";
import { TRAINING_PANEL_TEXT } from "../game/copy.js";

function pct(n: number | null | undefined): string {
  return n == null ? "–" : `${(n * 100).toFixed(0)}%`;
}

function downloadJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EntrenamentView() {
  const scope = useGameStore(store, (s) => s.mirrorScope);
  // playerModel is the only piece of store state getMirrorData actually
  // depends on — subscribing to it (rather than nothing) is what makes
  // this view re-render as new throws land, and gives useMemo below a
  // plain variable reference to depend on.
  const playerModel = useGameStore(store, (s) => s.playerModel);
  const [exportedOnce, setExportedOnce] = useState(false);

  const mirror = useMemo(() => {
    // getMirrorData reads the store's own live playerModel internally —
    // `playerModel` is listed as a dep purely to trigger recomputation
    // when it changes; referencing it here (a no-op) makes that dependency
    // honest to the exhaustive-deps linter rather than suppressing it.
    void playerModel;
    return store.getMirrorData(scope);
  }, [scope, playerModel]);

  return (
    <section className="entrenament-view">
      <div className="mirror-scope-toggle">
        <button type="button" id="btnScopeSession" aria-pressed={scope === "session"} onClick={() => store.setMirrorScope("session")}>
          {TRAINING_PANEL_TEXT.scopeSession}
        </button>
        <button type="button" id="btnScopeAllTime" aria-pressed={scope === "allTime"} onClick={() => store.setMirrorScope("allTime")}>
          {TRAINING_PANEL_TEXT.scopeAllTime}
        </button>
      </div>

      <div className="headline-tiles">
        <div id="tileExploitability" className="tile">
          <span className="tile-label">{TRAINING_PANEL_TEXT.headlineExploitability}</span>
          <span className="tile-value">{pct(mirror.exploitability.rate)}</span>
        </div>
        <div id="tileRandomness" className="tile">
          <span className="tile-label">{TRAINING_PANEL_TEXT.headlineRandomness}</span>
          <span className="tile-value">{mirror.randomness ? `${mirror.randomness.redundancyPct.toFixed(0)}%` : "–"}</span>
        </div>
        <div id="tileSyncRate" className="tile">
          <span className="tile-label">{TRAINING_PANEL_TEXT.headlineSyncRate}</span>
          <span className="tile-value">{pct(mirror.syncStats.syncRate)}</span>
        </div>
        <div id="tileMedianDelta" className="tile">
          <span className="tile-label">{TRAINING_PANEL_TEXT.headlineMedianDelta}</span>
          <span className="tile-value">{mirror.syncStats.medianAbsDeltaMs == null ? "–" : `${mirror.syncStats.medianAbsDeltaMs.toFixed(0)}ms`}</span>
        </div>
      </div>

      <h3>{TRAINING_PANEL_TEXT.yourNumbers}</h3>
      <div className="histograms">
        <div>
          <h4>{TRAINING_PANEL_TEXT.fHistogram}</h4>
          <ul className="histogram-bars">
            {mirror.histograms.f.list.map((entry) => (
              <li key={entry.value}>
                <span>{entry.value}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${entry.pct}%` }} />
                </div>
                <span>{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>{TRAINING_PANEL_TEXT.gHistogram}</h4>
          <ul className="histogram-bars">
            {mirror.histograms.g.list.map((entry) => (
              <li key={entry.value}>
                <span>{entry.value}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${entry.pct}%` }} />
                </div>
                <span>{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4>{TRAINING_PANEL_TEXT.topWords}</h4>
          <ul className="histogram-bars">
            {mirror.histograms.topWords.map((w) => (
              <li key={w.word}>
                <span>{w.word}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${w.pct}%` }} />
                </div>
                <span>{w.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h3>{TRAINING_PANEL_TEXT.tellsHeading}</h3>
      {mirror.tells.length === 0 ? (
        <p className="tells-empty">{TRAINING_PANEL_TEXT.tellsEmpty}</p>
      ) : (
        <ul className="tells-list">
          {mirror.tells.map((t) => (
            <li key={t.id}>{t.sentence}</li>
          ))}
        </ul>
      )}

      <h3>{TRAINING_PANEL_TEXT.bigramHeading}</h3>
      <BigramHeatmap bigram={mirror.bigram} />

      <div className="mirror-actions">
        <button
          type="button"
          id="btnExportProfile"
          onClick={() => {
            downloadJson("s03-player-profile.json", store.exportProfileJson());
            setExportedOnce(true);
          }}
        >
          {TRAINING_PANEL_TEXT.exportButton}
        </button>
        <span aria-live="polite" className="sr-only">
          {exportedOnce ? "exported" : ""}
        </span>
        <button
          type="button"
          id="btnResetProfile"
          className="danger"
          onClick={() => {
            if (window.confirm(TRAINING_PANEL_TEXT.resetConfirm)) store.resetProfile();
          }}
        >
          {TRAINING_PANEL_TEXT.resetButton}
        </button>
      </div>
    </section>
  );
}

const HEATMAP_STEPS = [0.05, 0.2, 0.4, 0.6, 0.8];
function heatmapClass(p: number | null): string {
  if (p == null) return "heat-none";
  const step = HEATMAP_STEPS.findIndex((s) => p < s);
  return `heat-${step === -1 ? HEATMAP_STEPS.length : step}`;
}

function BigramHeatmap({ bigram }: { bigram: ReturnType<typeof store.getMirrorData>["bigram"] }) {
  const values = [1, 2, 3, 4, 5] as const;
  return (
    <div className="bigram-grid" role="table">
      {values.map((from) =>
        values.map((to) => {
          const p = bigram.probabilities[from]?.[to] ?? null;
          return (
            <div key={`${from}-${to}`} role="cell" className={`bigram-cell ${heatmapClass(p)}`}>
              {p == null ? "" : `${(p * 100).toFixed(0)}%`}
            </div>
          );
        })
      )}
    </div>
  );
}
