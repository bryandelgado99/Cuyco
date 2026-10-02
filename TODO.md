# Cuyco — what's left to do

A running list for this fork. Nothing here is a contract; it's the honest state
of the app right after the initial rebrand. Tick items off as they land.

## Visuals

- [ ] **Review the cuy in motion.** The character was redrawn as a guinea pig
      (rounder body, small ears, cream/caramel palette) but has not been eyeballed
      yet. Run `npm run dev`, then tune ear size/placement and body proportions.
- [ ] **Give it a face.** Add a nose/muzzle and per-state expressions — today the
      mouth only shows up in the box morph, and every state shares the same face.
- [ ] **Mini characters.** The integration pills reuse the same drawing at tiny
      sizes; confirm the ears and the palette still read there.
- [ ] **Prototype reference.** `design/prototype/` and `design/captures/` are not
      in this repo — decide whether to bring our own references in.

## Audio

- [ ] **Real sound design.** `sounds/*.wav` are synthesised placeholders generated
      by `scripts/gen-sounds.mjs`. Replace them with hand-crafted versions of the
      28 events, keeping the file names so nothing else has to change.

## Material 3 / M3E

- [ ] **Apply the tokens to the views.** `src/style.css` carries the M3 shape
      scale, the emphasised motion curves and dark colour roles, but only a few
      surfaces use them (island, cards, buttons). Rework pills, chat, switches,
      dropdowns and settings with the tokens.
- [ ] **State layers** using `--md-state-hover` / `--md-state-press` on every
      interactive control.
- [ ] **Material Symbols** for the icons if we adopt the set.

## Identity & config

- [ ] **Confirm the app id.** `tauri.conf.json` uses
      `io.github.bryandelgado99.cuyco`, a placeholder. Swap in the real reverse
      domain **before** release: changing it later resets install paths,
      Credential Manager entries and saved data.
- [ ] **Trademark note** for the name "Cuyco" if it ships publicly.

## Packaging & release

- [ ] **Run the Rust build.** Only the front end was verified (`tsc` + `vite`).
      `npm run pack`, and the Linux AppImage/.deb/.rpm, still need a build with
      the Rust toolchain.
- [ ] **Installer and tray branding** check on a real install.
- [ ] **Code signing** (Windows) to avoid the Defender false positive the
      original hit.
- [ ] **CI workflows** for Windows and Linux artefacts.
- [ ] **Our own version and CHANGELOG** (currently inherited: 0.1.1).

## Docs & media

- [ ] **Screenshots and a hero image** for the README. Nothing from the original
      app can be reused — everything must be recorded from our own build.

## Out of scope for now

- The **macOS (Swift) app** is not part of this repo. Decide later whether to
  rebrand it too, or keep Cuyco Windows/Linux-only.
