// playermodel.mjs — empty shell (Phase F). Phase G/H will make this the
// shared model consumed by BOTH the AI (L4's cross-match reads) and the
// mirror (docs/rival-ai-design.md §3-4): an in-memory + localStorage-
// persisted history of the player's (f, g, outcome, timing) per throw, plus
// a hashable snapshot for the fairness-replay log. For now it only defines
// a stable shape callers can already code against without changing again
// when the real modeling logic lands.

export function createEmptyModel() {
  return { throws: [], version: 1 };
}

export function recordThrow(model, throwRecord) {
  return { ...model, throws: [...model.throws, throwRecord] };
}

// A stable, hashable snapshot of the model — logged per-throw once Phase G's
// ai.mjs actually consumes a model (design doc §4: "the model snapshot hash
// goes into the debug/event log per throw"). Phase F's model is always
// empty in practice, so this is just a throw-count placeholder for now.
export function snapshotModel(model) {
  return { throwCount: model ? model.throws.length : 0 };
}
