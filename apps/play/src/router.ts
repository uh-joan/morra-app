// router.ts — hash routes over the app's screen/mode state (2026-08-17).
// The UI state was already one string (body[data-screen]) plus the session
// mode; the router mirrors it into location.hash and back, so the browser's
// back/forward, reload and deep links work. It owns no state of its own:
// screens.ts/modes.ts keep setting the screen and mode as before and call
// reflectRoute(); the router only translates.
//
//   #/                    title
//   #/tripulants          character select (?per=duel|entrena — the intent)
//   #/duel/:rival         fight, Partida, against nino|bru|merce|rei
//   #/entrena/:rival      fight, Entrenament — sparring with a rival, or "sol"
//   #/espill              L'Espill (+ ?tab=rei|numeros|sequencia)
//   #/calibratge          Calibratge — its own page, not part of training
//   #/classificacio       Classificació — the vessel's high-score table
//
// Query flags (?rival=, ?tecnic=1, ?entorn=, …) are per-load config in
// location.search and stay untouched. The VS splash, the end-of-match
// overlay and the onboarding card are not screens and have no route.
import { logEvent } from "./telemetry.js";

export type Route = "title" | "select" | "duel" | "entrena" | "espill" | "calib" | "classificacio";
export type RouteParams = Record<string, string>;
export type Screen = "title" | "select" | "fight" | "espill" | "calib" | "classificacio";
export type Mode = "partida" | "entrenament";

const PATHS: Record<Route, string> = { title: "#/", select: "#/tripulants", duel: "#/duel", entrena: "#/entrena", espill: "#/espill", calib: "#/calibratge", classificacio: "#/classificacio" };
const BY_PATH = new Map<string, Route>(Object.entries(PATHS).map(([r, p]) => [p, r as Route]));

export function routeFor(screen: Screen, mode: Mode): Route {
  if (screen === "fight") return mode === "entrenament" ? "entrena" : "duel";
  return screen === "select" ? "select" : screen === "espill" ? "espill" : screen === "calib" ? "calib" : screen === "classificacio" ? "classificacio" : "title";
}
/** `rival` is the path segment for duel/entrena (nino|bru|merce|rei, or "sol"). */
export function hashFor(route: Route, params: RouteParams = {}, rival: string | null = null): string {
  const q = new URLSearchParams(params).toString();
  const seg = (route === "duel" || route === "entrena") && rival ? "/" + rival : "";
  return PATHS[route] + seg + (q ? "?" + q : "");
}
export function parseHash(hash: string): { route: Route; params: RouteParams; rival: string | null } | null {
  const h = hash || "#/";
  const [pathRaw, query = ""] = h.split("?") as [string, string?];
  const path = pathRaw === "#" || pathRaw === "" ? "#/" : pathRaw;
  let route = BY_PATH.get(path), rival: string | null = null;
  if (!route) {
    // #/duel/bru · #/entrena/sol
    const m = /^(#\/(?:duel|entrena))\/([a-z]+)$/.exec(path);
    if (m) { route = BY_PATH.get(m[1]!); rival = m[2]!; }
  }
  if (!route) return null;
  return { route, params: Object.fromEntries(new URLSearchParams(query)), rival };
}

// ------------------------------------------------------------ apply / reflect
export interface RouteHandlers {
  /** apply a route to the app; called on back/forward, deep link and boot */
  apply: (route: Route, params: RouteParams, rival: string | null) => void;
}
let handlers: RouteHandlers | null = null;
let applying = false;

/** Mirror the app's state into the hash. Screen changes push (a back
 * entry); mode/tab changes replace. No-op when the hash already matches or
 * while a route is being applied (that came FROM the hash). */
export function reflectRoute(screen: Screen, mode: Mode, params: RouteParams = {}, kind: "push" | "replace" = "push", rival: string | null = null): void {
  if (applying || typeof location === "undefined") return;
  const next = hashFor(routeFor(screen, mode), params, rival);
  if (location.hash === next) return;
  if (kind === "push" && location.hash !== "") history.pushState(null, "", next);
  else history.replaceState(null, "", next);
  logEvent("route", { hash: next, kind });
}

export function currentRoute(): { route: Route; params: RouteParams; rival: string | null } {
  return parseHash(location.hash) ?? { route: "title", params: {}, rival: null };
}

/** Wire the router: back/forward and typed hashes call `apply`; the boot
 * hash (a deep link, or a reload) is applied once — after the app has
 * mounted its screens, so it can land anywhere. */
export function installRouter(h: RouteHandlers): void {
  handlers = h;
  window.addEventListener("hashchange", () => {
    const r = parseHash(location.hash);
    if (!r) { history.replaceState(null, "", "#/"); applyRoute("title", {}, null); return; }
    applyRoute(r.route, r.params, r.rival);
  });
  const boot = parseHash(location.hash);
  if (!boot) history.replaceState(null, "", "#/");
  else if (boot.route !== "title") applyRoute(boot.route, boot.params, boot.rival);
}
function applyRoute(route: Route, params: RouteParams, rival: string | null): void {
  if (!handlers) return;
  applying = true;
  try { handlers.apply(route, params, rival); } finally { applying = false; }
  logEvent("route_apply", { route, params, rival });
}
