// In-island settings — an M3E-style expansion-panel accordion holding everything
// the old settings window did. Nothing is written to disk without a click.

import { Bridge, type HookStatus } from "../core/bridge";
import { State, EDITORS, type Settings } from "../core/state";
import { applyTheme, type Theme } from "../core/theme";
import { h, clear, dot } from "./dom";
import { accordion, type AccordionSection } from "./accordion";
import type { ViewHost } from "./views";

const MODELS: [string, string][] = [
  ["claude-opus-5", "Claude Opus 5"],
  ["claude-sonnet-5", "Claude Sonnet 5"],
  ["claude-haiku-4-5", "Claude Haiku 4.5"],
];

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

/** A `.seg` group bound to a getter/setter. No native <select>: OS popups are
 *  unreliable in a non-activating, always-on-top overlay. */
function segControl<T>(options: readonly (readonly [T, string])[], get: () => T, set: (v: T) => void): Control {
  const buttons = options.map(([value, label]) =>
    h("button", { type: "button", onclick: () => set(value) }, label));
  const el = h("div", { class: "seg" }, ...buttons);
  return {
    el,
    sync: () => {
      const v = get();
      buttons.forEach((b, i) => b.classList.toggle("on", options[i][0] === v));
    },
  };
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
  const auto = segControl<number>(
    [[10, "10s"], [15, "15s"], [30, "30s"]],
    () => Math.round(State.settings.autoCloseInterval),
    (v) => { State.settings.autoCloseInterval = v; save(); },
  );
  const screen = segControl<Settings["screen"]>(
    [["primary", "Main display"], ["cursor", "Under cursor"]],
    () => State.settings.screen,
    (v) => { State.settings.screen = v; save(); },
  );
  const theme = segControl<Theme>(
    [["system", "System"], ["light", "Light"], ["dark", "Dark"]],
    () => State.settings.theme,
    (v) => { State.settings.theme = v; applyTheme(v); save(); },
  );
  const position = segControl<Settings["position"]>(
    [["top", "Top"], ["left", "Left"], ["right", "Right"]],
    () => State.settings.position,
    (v) => { State.settings.position = v; save(); },
  );
  const editor = segControl<Settings["editor"]>(
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

// ── Claude Code ───────────────────────────────────────────────────────────────

function claudeCodePanel(): { body: HTMLElement; status: HTMLElement; sync: () => void; refresh: () => Promise<void> } {
  let status: HookStatus = { installed: false, settingsPath: "", hookPath: "", hookReady: false };
  const statusEl = dot("var(--md-error)", 6);
  const body = h("div", { class: "panel-body" });

  function draw() {
    clear(body);
    body.append(
      h("div", {
        class: "hint",
        text: status.installed
          ? "Cuyco is hooked into your Claude Code sessions. Tool calls, questions and permission requests show up in the island, and you can answer them there."
          : "Install the hooks to see your Claude Code sessions in the island and approve permissions without leaving what you are doing.",
      }),
      h("div", { class: "row" }, h("label", { text: "settings.json" }), h("span", { class: "path", text: status.settingsPath })),
      h("div", { class: "row" }, h("label", { text: "Relay" }), h("span", { class: "path", text: status.hookPath }), statusDot(status.hookReady)),
    );

    if (!status.hookReady) {
      body.append(h("div", {
        class: "notice warn",
        text: "cuyco-hook.exe is not in place yet. Restart Cuyco; if it still fails, build it with `cargo build -p cuyco-hook`.",
      }));
    }

    const install = h("button", {
      class: "primary",
      text: status.installed ? "Reinstall hooks…" : "Install hooks…",
      onclick: () => void showPreview(true),
    });
    // Writing hook commands that point at a relay which isn't there would give
    // every Claude Code session a broken hook and nothing to show for it.
    if (!status.hookReady) {
      (install as HTMLButtonElement).disabled = true;
      install.title = "The relay isn't installed yet.";
    }
    const actions = h("div", { class: "row" }, install);
    if (status.installed) {
      actions.append(h("button", { class: "danger", text: "Uninstall hooks…", onclick: () => void showPreview(false) }));
    }
    body.append(actions);
  }

  async function showPreview(install: boolean) {
    let preview;
    try {
      preview = await Bridge.hooksPreview(install);
    } catch (err) {
      // An unreadable or invalid settings.json stops here rather than being
      // treated as empty and written over.
      clear(body);
      body.append(
        h("div", { class: "notice err", text: String(err).replace(/^Error:\s*/, "") }),
        h("div", { class: "row" }, h("button", { text: "Back", onclick: () => draw() })),
      );
      return;
    }
    if (!preview) return;
    clear(body);
    body.append(
      h("div", {
        class: "hint",
        text: install
          ? "This is exactly what will change in your settings.json. Your own hooks are left untouched."
          : "This removes Cuyco's entries only. Your own hooks are left untouched.",
      }),
      renderDiff(preview.diff),
      h("div", { class: "row" }, h("span", { class: "path", text: `Backup → ${preview.backup}` })),
    );
    const confirm = h("button", {
      class: install ? "primary" : "danger",
      text: install ? "Back up and write" : "Back up and remove",
    });
    confirm.addEventListener("click", async () => {
      (confirm as HTMLButtonElement).disabled = true;
      try {
        const backup = await Bridge.hooksApply(install, preview!.fingerprint);
        clear(body);
        body.append(h("div", {
          class: "notice ok",
          text: `Done. Previous settings saved as ${backup}. Open a new Claude Code session to pick the hooks up.`,
        }));
        window.setTimeout(() => void refresh(), 2600);
      } catch (err) {
        (confirm as HTMLButtonElement).disabled = false;
        body.append(h("div", { class: "notice err", text: `Could not write: ${String(err)}` }));
      }
    });
    body.append(h("div", { class: "row" }, confirm, h("button", { text: "Cancel", onclick: () => draw() })));
  }

  const sync = () => {
    statusEl.style.background = status.installed ? "var(--md-success)" : "var(--md-error)";
  };

  async function refresh() {
    const fresh = await Bridge.hooksStatus();
    if (fresh) status = fresh;
    sync();
    draw();
  }

  draw();
  return { body, status: statusEl, sync, refresh };
}

// ── Claude (API) ──────────────────────────────────────────────────────────────

function apiPanel(): { body: HTMLElement; status: HTMLElement; sync: () => void; refresh: () => Promise<void> } {
  let hasKey = false;
  const statusEl = dot("var(--md-error)", 6);
  const state = h("span", { class: "hint" });
  const field = h("input", {
    type: "password", placeholder: "sk-ant-...", autocomplete: "off", spellcheck: "false",
    style: "flex:1 1 auto;min-width:0",
  }) as HTMLInputElement;
  const saveBtn = h("button", { class: "primary", text: "Save key" });
  const clearBtn = h("button", { class: "danger", text: "Remove" });
  const feedback = h("div", {});

  const model = segControl<string>(
    MODELS,
    () => State.settings.model,
    (v) => { State.settings.model = v; save(); },
  );

  async function refresh() {
    hasKey = (await Bridge.secretPresent("anthropic-api-key")) ?? false;
    sync();
  }

  function sync() {
    statusEl.style.background = hasKey ? "var(--md-success)" : "var(--md-error)";
    state.textContent = hasKey
      ? "Key saved in the OS keychain."
      : "No key yet — the chat needs one.";
    field.placeholder = hasKey ? "••••••••••••  (stored)" : "sk-ant-...";
    clearBtn.style.display = hasKey ? "" : "none";
    model.sync();
  }

  saveBtn.addEventListener("click", async () => {
    const value = field.value.trim();
    if (!value) return;
    clear(feedback);
    try {
      await Bridge.secretSet("anthropic-api-key", value);
      field.value = "";
      feedback.append(h("div", { class: "notice ok", text: "Saved. It never touches disk." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not save: ${String(err)}` }));
    }
  });

  clearBtn.addEventListener("click", async () => {
    clear(feedback);
    try {
      await Bridge.secretClear("anthropic-api-key");
      feedback.append(h("div", { class: "notice ok", text: "Key removed." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not remove: ${String(err)}` }));
    }
  });

  const body = h(
    "div",
    { class: "panel-body" },
    state,
    h("div", { class: "row" }, h("label", { text: "API key" }), field, saveBtn, clearBtn),
    h("div", { class: "row" }, h("label", { text: "Model" }), model.el),
    feedback,
  );

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
  const claudeCode = claudeCodePanel();
  const api = apiPanel();
  const integrations = integrationsPanel(present);

  const sections: AccordionSection[] = [
    { title: "General", body: general.body },
    { title: "Claude Code", body: claudeCode.body, trailing: claudeCode.status },
    { title: "Claude", body: api.body, trailing: api.status },
    { title: "Integrations", body: integrations.body },
  ];

  const el = h(
    "div",
    { class: "view" },
    h("div", { class: "card" }, h("div", { class: "settings-panel" }, accordion(sections))),
  );

  async function load() {
    await claudeCode.refresh();
    await api.refresh();
    await integrations.refresh();
    integrations.sync();
  }

  return {
    el,
    sync() {
      general.sync();
      claudeCode.sync();
      api.sync();
      integrations.sync();
      if (!loaded) {
        loaded = true;
        void load();
      }
    },
  };
}
