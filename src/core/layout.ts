// Island geometry — ported from IslandTypes.swift + IslandWindowController.islandSize
// + IslandRootView.botPosition. All values are logical pixels, identical to the
// macOS app's points.

export type IslandMode = "hidden" | "compact" | "expanded";

/** Where the island is pegged on screen. */
export type Anchor = "top" | "left" | "right";

export type IslandViewName =
  | "overview"
  | "empty"
  | "approval"
  | "question"
  | "error"
  | "finished"
  | "confused"
  | "upload"
  | "uploading"
  | "choose"
  | "mail"
  | "searching"
  | "result"
  | "note"
  | "settings"
  | "greeting";

export type BotStateName =
  | "idle"
  | "working"
  | "thinking"
  | "searching"
  | "approval"
  | "question"
  | "error"
  | "finished"
  | "ratelimit"
  | "sleeping"
  | "dizzy";

export type BotEmoteName = "love" | "surprised" | "proud" | "wink" | "yawn" | "happy" | "annoyed";

export type AgentLayoutMode = "none" | "grid" | "pills" | "column";

export interface ViewLayout {
  height: number;
  botX: number;
  botY: number | null; // null = auto-centred
  botDiameter: number;
  agentMode: AgentLayoutMode;
}

// The window is a fixed 720×320 (largest view) like the macOS panel; the island is
// drawn inside it, glued to the top edge and horizontally centred.
export const PANEL_W = 720;
export const PANEL_H = 320;

// No notch on a PC: these are the hidden/compact sizes from docs/SPEC.md.
export const NOTCH_W = 184;
export const NOTCH_H = 32;
export const COMPACT_W = 288; // NOTCH_W + 104
export const EXPANDED_W = 640;

export const ROUNDED_CORNER = 14; // hidden / compact
export const EXPANDED_CORNER = 22;

// Docked to a side edge the island is a vertical card: a small pill at rest and a
// narrow column when it opens. The pill hugs the cuy — with the agents grid
// stacked below only when there is one to show.
export const SIDE_W = 320;
export const SIDE_PILL_W = 44;
export const SIDE_PILL_H = 100;
/** Pill with nothing but the cuy in it — no agents grid below. */
export const SIDE_PILL_H_MINI = 44;

/** Heights for the narrow side column (the 640-wide VIEW_LAYOUTS do not fit). */
const SIDE_VIEW_HEIGHTS: Record<IslandViewName, number> = {
  overview: 230,
  empty: 200,
  approval: 210,
  question: 190,
  error: 210,
  finished: 200,
  confused: 210,
  upload: 176,
  uploading: 176,
  choose: 176,
  mail: 200,
  searching: 160,
  result: 160,
  note: 180,
  settings: 300,
  greeting: 150,
};

/** Invisible hover strip that wakes the island when hidden. */
export const WAKE_STRIP_W = 240;
export const WAKE_STRIP_H = 6;

export const VIEW_LAYOUTS: Record<IslandViewName, ViewLayout> = {
  overview: { height: 160, botX: 68, botY: null, botDiameter: 58, agentMode: "pills" },
  empty: { height: 160, botX: 70, botY: null, botDiameter: 62, agentMode: "none" },
  approval: { height: 160, botX: 62, botY: null, botDiameter: 56, agentMode: "column" },
  question: { height: 160, botX: 62, botY: null, botDiameter: 56, agentMode: "column" },
  error: { height: 160, botX: 62, botY: null, botDiameter: 58, agentMode: "column" },
  finished: { height: 160, botX: 62, botY: null, botDiameter: 58, agentMode: "column" },
  confused: { height: 160, botX: 76, botY: null, botDiameter: 66, agentMode: "column" },
  upload: { height: 176, botX: 140, botY: 104, botDiameter: 62, agentMode: "column" },
  // botY 103 = bar top (42 + 58) + 3, so the dot really rides the bar. The Swift
  // layout says 118 while its own comment says 103; the comment matches the spec.
  uploading: { height: 176, botX: 46, botY: 103, botDiameter: 20, agentMode: "none" },
  choose: { height: 176, botX: 60, botY: 101, botDiameter: 52, agentMode: "column" },
  mail: { height: 240, botX: 56, botY: null, botDiameter: 46, agentMode: "column" },
  searching: { height: 160, botX: 52, botY: null, botDiameter: 44, agentMode: "column" },
  result: { height: 160, botX: 52, botY: null, botDiameter: 44, agentMode: "column" },
  note: { height: 160, botX: 60, botY: null, botDiameter: 50, agentMode: "column" },
  settings: { height: 300, botX: 54, botY: null, botDiameter: 46, agentMode: "none" },
  greeting: { height: 150, botX: 320, botY: 90, botDiameter: 0, agentMode: "none" },
};

// The upload views above are only the fallback geometry. Once a file is actually
// dropped the whole sequence — Cuyco included — is drawn by src/upload, which
// owns its own constants (USC) straight from UploadSequenceEngine.swift.

export function islandSize(
  mode: IslandMode,
  view: IslandViewName,
  anchor: Anchor = "top",
  agents = true,
): { w: number; h: number } {
  // On a side edge the pill is vertical: the compact/hidden dimensions swap.
  const side = anchor !== "top";
  switch (mode) {
    case "hidden":
      // No notch to hide inside on a PC: the island retracts into the screen
      // edge instead of sitting there as a bar.
      return side ? { w: 0, h: SIDE_PILL_H } : { w: NOTCH_W, h: 0 };
    case "compact":
      // Docked, the pill is only as tall as what it holds: the cuy, plus the
      // agents grid when there is one below it.
      return side
        ? { w: SIDE_PILL_W, h: agents ? SIDE_PILL_H : SIDE_PILL_H_MINI }
        : { w: COMPACT_W, h: NOTCH_H };
    case "expanded": {
      if (side) {
        return { w: SIDE_W, h: SIDE_VIEW_HEIGHTS[view] };
      }
      return { w: EXPANDED_W, h: VIEW_LAYOUTS[view].height };
    }
  }
}

export interface BotPlacement {
  cx: number;
  cy: number;
  diameter: number;
  opacity: number;
}

/** IslandRootView.botPosition — cy is measured from the island's top edge. */
export function botPosition(
  mode: IslandMode,
  view: IslandViewName,
  islandH: number,
  uploadProgress = 0,
  anchor: Anchor = "top",
  agents = true,
): BotPlacement {
  const side = anchor !== "top";
  switch (mode) {
    case "hidden":
      return side
        ? { cx: SIDE_PILL_W / 2, cy: SIDE_PILL_H / 2, diameter: 6, opacity: 0 }
        : { cx: 46, cy: 16, diameter: 6, opacity: 0 };
    case "compact":
      // Docked, the cuy sits centred across the pill; the agents grid, when
      // there is one, stacks underneath it.
      return side
        ? { cx: SIDE_PILL_W / 2, cy: agents ? 30 : SIDE_PILL_H_MINI / 2, diameter: 20, opacity: 1 }
        : { cx: 40, cy: 16, diameter: 20, opacity: 1 };
    case "expanded": {
      const layout = VIEW_LAYOUTS[view];
      // On the right the panel is mirrored, so the cuy hugs the outer (right)
      // edge — around the island's own width, not the 640-wide reference.
      const panelW = side ? SIDE_W : EXPANDED_W;
      const mirror = (cx: number) => (anchor === "right" ? panelW - cx : cx);
      if (view === "uploading") {
        return {
          cx: mirror(36 + uploadProgress * 526),
          cy: layout.botY ?? 103,
          diameter: layout.botDiameter,
          opacity: 1,
        };
      }
      if (layout.botY != null) {
        return { cx: mirror(layout.botX), cy: layout.botY, diameter: layout.botDiameter, opacity: 1 };
      }
      // Centre of the fixed 84 pt card (8 pt top inset + 34 pt header → content at y = 42)
      const headerBottom = 42;
      const cardH = 84;
      const cy = headerBottom + (islandH - headerBottom - cardH) / 2 + cardH / 2;
      return { cx: mirror(layout.botX), cy, diameter: layout.botDiameter, opacity: 1 };
    }
  }
}

export function botGlowColor(s: BotStateName): string {
  switch (s) {
    case "working":
      return "#3B9EFF";
    case "thinking":
      return "#A78BFA";
    case "searching":
      return "#6366F1";
    case "approval":
      return "#F5A524";
    case "error":
      return "#F4505E";
    case "finished":
      return "#34D399";
    case "ratelimit":
      return "#F59E0B";
    default:
      return "#FFFFFF";
  }
}

export function botGlowOpacity(s: BotStateName): number {
  switch (s) {
    case "idle":
    case "sleeping":
      return 0.15;
    case "dizzy":
      return 0;
    default:
      return 0.65;
  }
}

// Project colours (IslandConst.projectColors)
const PROJECT_COLORS: Record<string, string> = {
  korus: "#FF5A4E",
  "sbe hub": "#2EC4A0",
  "morning ai brief": "#F29B38",
  "publication ig": "#7C5CFF",
  "ig post": "#7C5CFF",
  "louisraille.fr": "#38BDF8",
  louisraille: "#38BDF8",
  "notch buddy": "#EC4899",
  "notch-buddy": "#EC4899",
  cuyco: "#EC4899",
};

const FALLBACK_COLORS = ["#22C55E", "#EAB308", "#60A5FA", "#E879F9"];

export function colorForProject(name: string): string {
  const key = name.toLowerCase().trim();
  const exact = PROJECT_COLORS[key];
  if (exact) return exact;
  for (const [k, c] of Object.entries(PROJECT_COLORS)) {
    if (key.startsWith(k) || key.includes(k)) return c;
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

// Card wash colours (CardBackground.washColor)
export type Wash = "red" | "green" | "pink" | "amber" | "cyan" | "indigo" | "soft" | null;

export function washRGBA(wash: Wash): string {
  switch (wash) {
    case "red":
      return "color-mix(in srgb, var(--md-error) 55%, transparent)";
    case "green":
      return "color-mix(in srgb, var(--md-success) 50%, transparent)";
    case "pink":
      return "color-mix(in srgb, var(--md-tertiary) 55%, transparent)";
    case "amber":
      return "color-mix(in srgb, var(--md-warning) 42%, transparent)";
    case "cyan":
      return "color-mix(in srgb, var(--md-primary) 42%, transparent)";
    case "indigo":
      return "color-mix(in srgb, var(--md-primary) 50%, transparent)";
    case "soft":
      return "color-mix(in srgb, var(--md-on-surface) 8%, transparent)";
    default:
      return "transparent";
  }
}
