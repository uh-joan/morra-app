// router.ts — hash routes over the app's screen/mode state (2026-08-17).
// The UI state was already one string (body[data-screen]) plus the session
// mode; the router mirrors it into location.hash and back, so the browser's
// back/forward, reload and deep links work. It owns no state of its own:
// screens.ts/modes.ts keep setting the screen and mode as before and call
// reflectRoute(); the router only translates.
//
//   #/            title
//   #/tripulants  character select
//   #/duel        fight, Partida
//   #/entrena     fight, Entrenament
//   #/espill      L'Espill (+ ?tab=rei|numeros|sequencia)
//
// Query flags (?rival=, ?tecnic=1, ?entorn=, …) are per-load config in
// location.search and stay untouched. The VS splash, the end-of-match
// overlay and the onboarding card are not screens and have no route.
import { logEvent } from "./telemetry.js";

export type Route = "title" | "select" | "duel" | "entrena" | "espill";
export type RouteParams = Record<string, string>;
export type Screen = "title" | "select" | "fight" | "espill";
export type Mode = "partida" | "entrenament";

const PATHS: Record<Route, string> = { title: "#/", select: "#/tripulants", duel: "#/duel", entrena: "#/entrena", espill: "#/espill" };
const BY_PATH = new Map<string, Route>(Object.entries(PATHS).map(([r, p]) => [p, r as Route]));

export function routeFor(screen: Screen, mode: Mode): Route {
  if (screen === "fight") return mode === "entrenament" ? "entrena" : "duel";
  return screen === "select" ? "select" : screen === "espill" ? "espill" : "title";
}
export function hashFor(route: Route, params: RouteParams = {}): string {
  const q = new URLSearchParams(params).toString();
  return PATHS[route] + (q ? "?" + q : "");
}
export function parseHash(hash: string): { route: Route; params: RouteParams } | null {
  const h = hash || "#/";
  const [path, query = ""] = h.split("?") as [string, string?];
  const route = BY_PATH.get(path === "#" || path === "" ? "#/" : path);
  if (!route) return null;
  return { route, params: Object.fromEntries(new URLSearchParams(query)) };
}

// ------------------------------------------------------------ apply / reflect
export interface RouteHandlers {
  /** apply a route to the app; called on back/forward, deep link and boot */
  apply: (route: Route, params: RouteParams) => void;
}
let handlers: RouteHandlers | null = null;
let applying = false;

/** Mirror the app's state into the hash. Screen changes push (a back
 * entry); mode/tab changes replace. No-op when the hash already matches or
 * while a route is being applied (that came FROM the hash). */
export function reflectRoute(screen: Screen, mode: Mode, params: RouteParams = {}, kind: "push" | "replace" = "push"): void {
  if (applying || typeof location === "undefined") return;
  const next = hashFor(routeFor(screen, mode), params);
  if (location.hash === next) return;
  if (kind === "push" && location.hash !== "") history.pushState(null, "", next);
  else history.replaceState(null, "", next);
  logEvent("route", { hash: next, kind });
}

export function currentRoute(): { route: Route; params: RouteParams } {
  return parseHash(location.hash) ?? { route: "title", params: {} };
}

/** Wire the router: back/forward and typed hashes call `apply`; the boot
 * hash (a deep link, or a reload) is applied once — after the app has
 * mounted its screens, so it can land anywhere. */
export function installRouter(h: RouteHandlers): void {
  handlers = h;
  window.addEventListener("hashchange", () => {
    const r = parseHash(location.hash);
    if (!r) { history.replaceState(null, "", "#/"); applyRoute("title", {}); return; }
    applyRoute(r.route, r.params);
  });
  const boot = parseHash(location.hash);
  if (!boot) history.replaceState(null, "", "#/");
  else if (boot.route !== "title") applyRoute(boot.route, boot.params);
}
function applyRoute(route: Route, params: RouteParams): void {
  if (!handlers) return;
  applying = true;
  try { handlers.apply(route, params); } finally { applying = false; }
  logEvent("route_apply", { route, params });
}
