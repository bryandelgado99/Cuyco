// In-island settings — an M3E-style expansion-panel accordion holding everything
// the old settings window did. Nothing is written to disk without a click.

import { Bridge, type HookStatus } from "../core/bridge";
import { State, EDITORS, type Settings } from "../core/state";
import { applyTheme, type Theme } from "../core/theme";
import { h, clear, dot, svg } from "./dom";
import { ICONS } from "./icons";
import { accordion, type AccordionSection } from "./accordion";
import type { ViewHost } from "./views";

interface IntegrationDef {
  id: string;
  name: string;
  color: string;
  fields: { key: string; label: string; placeholder: string; secret: boolean }[];
}

const INTEGRATIONS: IntegrationDef[] = [
  { id: "integration_stripe", name: "Stripe", color: "#0570DE",
    fields: [{ key: "stripe-api-key", label: "Secret key", placeholder: "sk_live_…", secret: true }] },
  { id: "integration_github", name: "GitHub", color: "#F4505E",
    fields: [{ key: "github-token", label: "Token", placeholder: "ghp_…", secret: true }] },
  { id: "integration_vercel", name: "Vercel", color: "#7C5CFF",
    fields: [{ key: "vercel-token", label: "Token", placeholder: "…", secret: true }] },
  { id: "integration_n8n", name: "n8n", color: "#F29B38",
    fields: [
      { key: "n8n-url", label: "Instance URL", placeholder: "https://n8n.example.com", secret: false },
      { key: "n8n-api-key", label: "API key", placeholder: "…", secret: true },
    ] },
  { id: "integration_resend", name: "Resend", color: "#22C55E",
    fields: [{ key: "resend-api-key", label: "API key", placeholder: "re_…", secret: true }] },
  { id: "integration_notion", name: "Notion", color: "#8C8C8C",
    fields: [{ key: "notion-api-key", label: "Integration token", placeholder: "ntn_…", secret: true }] },
  { id: "integration_calcom", name: "Cal.com", color: "#C9956A",
    fields: [{ key: "calcom-api-key", label: "API key", placeholder: "cal_…", secret: true }] },
];

const MAX_ACTIVE = 4;

const INTEGRATION_KEYS = [
  "stripe-api-key", "github-token", "vercel-token",
  "n8n-url", "n8n-api-key", "resend-api-key", "notion-api-key", "calcom-api-key",
];

function save() {
  void Bridge.saveSettings(State.settings);
  State.notify();
}

function statusDot(ok: boolean): HTMLElement {
  return h("i", { class: "dot", style: `background:${ok ? "var(--md-success)" : "var(--md-error)"}` });
}

function renderDiff(text: string): HTMLElement {
  const box = h("div", { class: "diff" });
  for (const line of text.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
    box.append(h("div", { class: cls, text: line }));
  }
  return box;
}

interface Control {
  el: HTMLElement;
  sync: () => void;
}

/** A `.switch` bound to a getter/setter. */
function switchControl(get: () => boolean, set: (v: boolean) => void): Control {
  const el = h("button", { class: "switch", type: "button", "aria-pressed": "false" });
  el.addEventListener("click", () => set(!get()));
  return {
    el,
    sync: () => {
      const on = get();
      el.classList.toggle("on", on);
      el.setAttribute("aria-pressed", String(on));
    },
  };
}

/** Menus currently open, so navigating away (or collapsing) can dismiss them. */
const openMenus = new Set<() => void>();

export function closeSettingsMenus() {
  for (const close of [...openMenus]) close();
}

/** True while a dropdown menu is open — the island defers Escape to it. */
export function settingsMenuOpen(): boolean {
  return openMenus.size > 0;
}

/**
 * A custom dropdown bound to a getter/setter: a trigger showing the current
 * value and a floating menu. No native <select> — OS popups misbehave in a
 * non-activating, always-on-top overlay. The menu lives on <body> and is clamped
 * inside the island, so neither the panel's scroll box nor the accordion's
 * overflow can clip it.
 */
function dropdownControl<T>(
  options: readonly (readonly [T, string])[],
  get: () => T,
  set: (v: T) => void,
): Control {
  const value = h("span", { class: "dd-value" });
  const el = h(
    "button",
    { class: "dd-trigger", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" },
    value,
    svg(ICONS.chevronRight, 12),
  );

  let menu: HTMLElement | null = null;

  function close() {
    if (!menu) return;
    menu.remove();
    menu = null;
    el.classList.remove("open");
    el.setAttribute("aria-expanded", "false");
    openMenus.delete(close);
    document.removeEventListener("mousedown", onDocDown, true);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", close, true);
    window.removeEventListener("resize", close);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }

  function onDocDown(e: MouseEvent) {
    const target = e.target as Node;
    if (menu?.contains(target) || el.contains(target)) return;
    close();
  }

  function place() {
    if (!menu) return;
    const trigger = el.getBoundingClientRect();
    const island = document.getElementById("island")?.getBoundingClientRect();
    const bounds = island ?? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let top = trigger.bottom + 4;
    if (top + mh > bounds.bottom - 4) top = trigger.top - mh - 4;
    top = Math.max(bounds.top + 4, top);
    const left = Math.max(bounds.left + 4, Math.min(trigger.right - mw, bounds.right - mw - 4));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function open() {
    if (menu) {
      close();
      return;
    }
    const current = get();
    menu = h("div", { class: "dd-menu", role: "listbox" });
    for (const [optValue, label] of options) {
      const selected = optValue === current;
      const option = h(
        "button",
        {
          class: selected ? "dd-option on" : "dd-option",
          type: "button",
          role: "option",
          "aria-selected": String(selected),
        },
        h("span", { class: "dd-check" }, selected ? svg(ICONS.check, 12) : null),
        h("span", { class: "dd-label", text: label }),
      );
      option.addEventListener("click", () => {
        set(optValue);
        close();
      });
      menu.append(option);
    }
    document.body.append(menu);
    el.classList.add("open");
    el.setAttribute("aria-expanded", "true");
    place();
    openMenus.add(close);
    document.addEventListener("mousedown", onDocDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    (menu.querySelector(".dd-option.on") as HTMLElement | null)?.focus();
  }

  function syncValue() {
    const current = get();
    value.textContent = options.find(([v]) => v === current)?.[1] ?? "";
  }

  el.addEventListener("click", open);
  syncValue();

  return { el, sync: syncValue };
}

function row(label: string, ...controls: Node[]): HTMLElement {
  return h("div", { class: "settings-row" }, h("label", { text: label }), ...controls);
}

// ── General ───────────────────────────────────────────────────────────────────

function generalPanel(): Control & { body: HTMLElement } {
  const sound = switchControl(
    () => State.settings.soundEnabled,
    (v) => { State.settings.soundEnabled = v; save(); },
  );
  const volume = h("input", {
    type: "range", min: "0", max: "0.2", step: "0.005",
    oninput: (e: Event) => {
      State.settings.soundVolume = Number((e.target as HTMLInputElement).value);
      save();
    },
  }) as HTMLInputElement;
  const auto = dropdownControl<number>(
    [[10, "10s"], [15, "15s"], [30, "30s"]],
    () => Math.round(State.settings.autoCloseInterval),
    (v) => { State.settings.autoCloseInterval = v; save(); },
  );
  const screen = dropdownControl<Settings["screen"]>(
    [["primary", "Main display"], ["cursor", "Under cursor"]],
    () => State.settings.screen,
    (v) => { State.settings.screen = v; save(); },
  );
  const theme = dropdownControl<Theme>(
    [["system", "System"], ["light", "Light"], ["dark", "Dark"]],
    () => State.settings.theme,
    (v) => { State.settings.theme = v; applyTheme(v); save(); },
  );
  const position = dropdownControl<Settings["position"]>(
    [["top", "Top"], ["left", "Left"], ["right", "Right"]],
    () => State.settings.position,
    (v) => { State.settings.position = v; save(); },
  );
  const editor = dropdownControl<Settings["editor"]>(
    EDITORS.map((e) => [e.id, e.label] as const),
    () => State.settings.editor,
    (v) => { State.settings.editor = v; save(); },
  );
  const editorCmd = h("input", {
    type: "text",
    placeholder: "cursor, idea, C:\\…\\studio64.exe",
    style: "flex:1 1 auto;min-width:0",
    // Saved on blur/Enter, not on every keystroke, to keep the caret steady.
    onchange: (e: Event) => {
      State.settings.editorCustom = (e.target as HTMLInputElement).value.trim();
      save();
    },
  }) as HTMLInputElement;
  const cuyOnly = switchControl(
    () => State.settings.hideAgents,
    (v) => { State.settings.hideAgents = v; save(); },
  );
  const autostart = switchControl(
    () => State.settings.autostart,
    (v) => { State.settings.autostart = v; save(); },
  );

  const body = h(
    "div",
    { class: "panel-body" },
    row("Sound", sound.el, volume),
    row("Auto-close", auto.el),
    row("Display", screen.el),
    row("Appearance", theme.el),
    row("Position", position.el),
    row("Editor", editor.el),
    row("Command", editorCmd),
    row("Cuy only", cuyOnly.el),
    row("Launch at startup", autostart.el),
  );

  return {
    body,
    el: body,
    sync: () => {
      sound.sync(); auto.sync(); screen.sync(); theme.sync(); position.sync();
      editor.sync();
      if (editorCmd.value !== State.settings.editorCustom) editorCmd.value = State.settings.editorCustom;
      cuyOnly.sync(); autostart.sync();
      volume.value = String(State.settings.soundVolume);
      volume.style.opacity = State.settings.soundEnabled ? "1" : "0.4";
    },
  };
}

// ── Agents ────────────────────────────────────────────────────────────────────

/**
 * One block per CLI agent Cuyco can watch. Each keeps its own diff preview:
 * installing Codex's hooks must never look like it is about to touch Claude
 * Code's config.
 */
function agentsPanel(): { body: HTMLElement; status: HTMLElement; sync: () => void; refresh: () => Promise<void> } {
  let statuses: HookStatus[] = [];
  const statusEl = dot("var(--md-error)", 6);
  const relay = h("div", { class: "row" });
  const body = h("div", { class: "panel-body" });

  function agentBlock(s: HookStatus): HTMLElement {
    const el = h("div", { class: "agent-block" });

    const drawDefault = () => {
      clear(el);
      el.append(
        h("div", { class: "row" }, h("label", { text: s.name }), h("span", { class: "path", text: s.settingsPath })),
      );
      const install = h("button", {
        class: "primary",
        text: s.installed ? "Reinstall hooks…" : "Install hooks…",
        onclick: () => void showPreview(true),
      });
      // Writing hook commands that point at a relay which isn't there would give
      // every session a broken hook and nothing to show for it.
      if (!s.hookReady) {
        (install as HTMLButtonElement).disabled = true;
        install.title = "The relay isn't installed yet.";
      }
      const actions = h("div", { class: "row" }, install);
      if (s.installed) {
        actions.append(h("button", { class: "danger", text: "Uninstall hooks…", onclick: () => void showPreview(false) }));
      }
      el.append(actions);
    };

    const showPreview = async (install: boolean) => {
      let preview;
      try {
        preview = await Bridge.hooksPreview(s.id, install);
      } catch (err) {
        // An unreadable or invalid config stops here rather than being treated
        // as empty and written over.
        clear(el);
        el.append(
          h("div", { class: "notice err", text: String(err).replace(/^Error:\s*/, "") }),
          h("div", { class: "row" }, h("button", { text: "Back", onclick: drawDefault })),
        );
        return;
      }
      if (!preview) return;
      clear(el);
      const shown: HTMLElement[] = [
        h("div", {
          class: "hint",
          text: install
            ? `This is exactly what will change for ${s.name}. Your own hooks are left untouched.`
            : "This removes Cuyco's entries only. Your own hooks are left untouched.",
        }),
      ];
      // Codex needs two files (its hooks and one feature flag), so the diff is a
      // list rather than a single blob.
      for (const file of preview.files) {
        shown.push(h("div", { class: "row" }, h("label", { text: "File" }), h("span", { class: "path", text: file.path })));
        shown.push(renderDiff(file.diff));
      }
      if (preview.backups.length) {
        shown.push(h("div", { class: "row" }, h("span", { class: "path", text: `Backups → ${preview.backups.join(", ")}` })));
      }
      el.append(...shown);
      const confirm = h("button", {
        class: install ? "primary" : "danger",
        text: install ? "Back up and write" : "Back up and remove",
      });
      confirm.addEventListener("click", async () => {
        (confirm as HTMLButtonElement).disabled = true;
        try {
          const backups = await Bridge.hooksApply(s.id, install, preview!.fingerprint);
          clear(el);
          const saved = backups.length ? ` Previous settings saved as ${backups.join(", ")}.` : "";
          el.append(h("div", {
            class: "notice ok",
            text: `Done.${saved} Open a new ${s.name} session to pick the hooks up.`,
          }));
          window.setTimeout(() => void refresh(), 2600);
        } catch (err) {
          (confirm as HTMLButtonElement).disabled = false;
          el.append(h("div", { class: "notice err", text: `Could not write: ${String(err)}` }));
        }
      });
      el.append(h("div", { class: "row" }, confirm, h("button", { text: "Cancel", onclick: drawDefault })));
    };

    drawDefault();
    return el;
  }

  function draw() {
    clear(body);
    clear(relay);
    const first = statuses[0];
    relay.append(
      h("label", { text: "Relay" }),
      h("span", { class: "path", text: first?.hookPath ?? "" }),
      statusDot(first?.hookReady ?? false),
    );
    body.append(
      h("div", {
        class: "hint",
        text: "Cuyco shows the sessions of the agents you hook here: tool calls, questions and permission requests show up in the island, and you can answer them there.",
      }),
      relay,
    );
    if (first && !first.hookReady) {
      body.append(h("div", {
        class: "notice warn",
        text: "cuyco-hook.exe is not in place yet. Restart Cuyco; if it still fails, build it with `cargo build -p cuyco-hook`.",
      }));
    }
    for (const s of statuses) body.append(agentBlock(s));
  }

  const sync = () => {
    statusEl.style.background = statuses.some((s) => s.installed) ? "var(--md-success)" : "var(--md-error)";
  };

  async function refresh() {
    const fresh = await Bridge.hooksStatus();
    if (fresh) statuses = fresh;
    sync();
    draw();
  }

  draw();
  return { body, status: statusEl, sync, refresh };
}

// ── Integrations ──────────────────────────────────────────────────────────────

function integrationsPanel(present: Record<string, boolean>): { body: HTMLElement; sync: () => void; refresh: () => Promise<void> } {
  const note = h("div", { class: "hint" });
  const switches: { def: IntegrationDef; el: HTMLElement }[] = [];

  function updateNote() {
    const used = State.settings.activeIntegrations.length;
    note.textContent = `Pick up to ${MAX_ACTIVE} pills to show next to Cuyco — ${used}/${MAX_ACTIVE} in use. Keys are stored in the OS keychain, never on disk.`;
  }

  const list = h("div", { class: "int-list" });
  for (const def of INTEGRATIONS) {
    const sw = h("button", { class: "switch", type: "button" });
    sw.addEventListener("click", () => {
      const on = State.settings.activeIntegrations.includes(def.id);
      if (on) {
        State.settings.activeIntegrations = State.settings.activeIntegrations.filter((x) => x !== def.id);
      } else {
        if (State.settings.activeIntegrations.length >= MAX_ACTIVE) return;
        State.settings.activeIntegrations = [...State.settings.activeIntegrations, def.id];
      }
      sw.classList.toggle("on", !on);
      updateNote();
      save();
    });
    switches.push({ def, el: sw });

    const rows = h("div", { class: "int-fields" });
    for (const field of def.fields) {
      const input = h("input", {
        type: field.secret ? "password" : "text",
        placeholder: field.placeholder,
        autocomplete: "off", spellcheck: "false",
        style: "flex:1 1 auto;min-width:0",
      }) as HTMLInputElement;
      const saveBtn = h("button", { text: "Save" });
      const dotEl = statusDot(present[field.key] ?? false);
      saveBtn.addEventListener("click", async () => {
        const value = input.value.trim();
        try {
          await Bridge.secretSet(field.key, value);
          present[field.key] = value.length > 0;
          input.value = "";
          input.placeholder = value ? "••••••••  (stored)" : field.placeholder;
          dotEl.style.background = value ? "var(--md-success)" : "var(--md-error)";
        } catch {
          dotEl.style.background = "var(--md-warning)";
        }
      });
      rows.append(h("div", { class: "row" }, h("label", { style: "min-width:104px", text: field.label }), input, saveBtn, dotEl));
    }

    list.append(
      h("div", { class: "int-entry" },
        h("div", { class: "int-entry-head" },
          sw,
          h("i", { class: "dot", style: `background:${def.color}` }),
          h("span", { text: def.name }),
        ),
        rows,
      ),
    );
  }

  updateNote();
  const body = h("div", { class: "panel-body" }, note, list);
  return {
    body,
    sync: () => {
      for (const { def, el } of switches) {
        el.classList.toggle("on", State.settings.activeIntegrations.includes(def.id));
      }
      updateNote();
    },
    refresh: async () => {
      for (const key of INTEGRATION_KEYS) present[key] = (await Bridge.secretPresent(key)) ?? false;
      // Dots were built with the initial (empty) map; leave a light refresh to sync().
    },
  };
}

// ── View ──────────────────────────────────────────────────────────────────────

export function buildSettingsView(): ViewHost {
  let loaded = false;
  const present: Record<string, boolean> = {};

  const general = generalPanel();
  const agents = agentsPanel();
  const integrations = integrationsPanel(present);

  const sections: AccordionSection[] = [
    { title: "General", body: general.body },
    { title: "Agents", body: agents.body, trailing: agents.status },
    { title: "Integrations", body: integrations.body },
  ];

  const el = h(
    "div",
    { class: "view" },
    h("div", { class: "card" }, h("div", { class: "settings-panel" }, accordion(sections))),
  );

  // A menu belongs to this view: leaving it (or the island collapsing) dismisses
  // any open dropdown instead of leaving it floating over the desktop.
  State.subscribe(() => {
    if (State.view !== "settings" || State.mode !== "expanded") closeSettingsMenus();
  });

  async function load() {
    await agents.refresh();
    await integrations.refresh();
    integrations.sync();
  }

  return {
    el,
    sync() {
      general.sync();
      agents.sync();
      integrations.sync();
      if (!loaded) {
        loaded = true;
        void load();
      }
    },
  };
}
