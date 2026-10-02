<div align="center">

<img src="src-tauri/icons/128x128.png" width="96" alt="Cuyco icon">

# Cuyco

**A tiny guinea pig that lives at the top of your screen and keeps an eye on your AI coding agent sessions.**

Approve Claude Code permissions, watch your agents work, drop a file, chat with Claude — all without leaving what you're doing.

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb%20%7C%20rpm-FCC624?logo=linux&logoColor=black)
![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-backend-000?logo=rust)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

</div>

---

## Why

Cuyco is an **independent, open fork** inspired by [Coucou](https://github.com/Louis-CFM/coucou),
which lives in the MacBook notch. There is no notch on a PC, so Cuyco lives at the
top edge of the screen instead — on Windows and Linux.

The **cuy** is a plump guinea pig (“cuy” is the Ecuadorian word for it) with big
eyes. It peeks out when something is running, gets annoyed when you poke it, goes
dizzy if you insist, and tells you the moment Claude Code needs you.

## Features

- 🤖 **Claude Code, live** — see every session at the top of your screen: what it
  reads, edits and runs, step by step.
- ✅ **Approve from the island** — Claude Code permission requests show up with
  **Deny / Allow**, from any terminal: Windows Terminal, PowerShell, VS Code, Git
  Bash. One click, back to work.
- 💬 **Chat with Claude** — ask about a file you dropped or a session you're
  watching.
- 📎 **Drop a file on the island** — the cuy turns into a box and swallows it,
  then answers questions about it.
- 🔌 **Integrations** — Stripe, n8n, GitHub, Vercel, Resend, Notion, Cal.com.
  Each one gets its own little coloured pill.
- 🎭 **A real character** — idle breathing, blinks, eyes that follow the pointer
  while it's over the island, emotes and 28 sounds.
- 🫥 **Invisible when idle** — hides away when nothing is running, peeks out when
  you reach the top of the screen.
- 🔒 **Private by design** — no telemetry, no account. Keys live in the Windows
  Credential Manager or the Linux Secret Service. The app only talks to the
  services you plug in.

## Build it yourself

You need [Rust](https://rustup.rs), [Node 20+](https://nodejs.org), and — on
Windows — the **MSVC build tools** (Visual Studio Build Tools with “Desktop
development with C++”). WebView2 ships with Windows 10/11.

```powershell
npm install
npm run tauri dev      # live-reloading development build
npm run pack           # builds the installer and drops it in release/
```

`npm run dev` alone serves the front end in an ordinary browser, which is enough
to work on the island's looks. It also serves `dev/upload-preview.html`, which
replays the whole file-drop choreography on a loop — the one part of the UI that
otherwise needs a real drag from Explorer to see. Neither page ships in the app.

`npm run pack` leaves two files in `release/`:

```
Cuyco-Windows-X.Y.Z-setup.exe    the versioned installer
Cuyco-Windows-setup.exe          the same file under the rolling name
```

Installing is optional — `target/release/cuyco.exe` runs on its own. There is no
window in the taskbar and no console: the island at the top of the screen and the
cuy in the notification area are the whole app, and Quit lives in its menu.

The character and the icons are **drawn in code**, not shipped as image assets:

```powershell
npm run icons          # regenerates src-tauri/icons from scripts/gen-icons.mjs
npm run sounds         # regenerates the 28 WAVs from scripts/gen-sounds.mjs
```

### Layout

```
src/                   island front end (TypeScript, no framework)
  cuyco/               the cuy and the launch greeting, in Canvas 2D
  island/              state machine, hooks, integrations
  views/               every island view
  settings/            the settings window
src-tauri/             Rust backend: window, named pipe, Claude API, pollers
hook/                  cuyco-hook.exe, the Claude Code relay
scripts/               icon and sound generators
sounds/                the 28 WAVs
```

## Setup

Open **Settings… → Claude Code → Install hooks…**. You get the exact diff of what
will change in `%USERPROFILE%\.claude\settings.json`, the path of the dated backup
that will be taken, and nothing is written until you click. Your own hooks are
never touched, and uninstalling removes only Cuyco's entries — and **a Claude Code
session is never blocked or slowed down by Cuyco**.

Keys live in the **Windows Credential Manager** (Windows) or the **Secret Service**
(Linux), never on disk and never in the interface.

### Log

`%LOCALAPPDATA%\Cuyco\cuyco.log` on Windows, `~/.local/share/cuyco/cuyco.log` on
Linux — hook events, permission decisions, poller problems. It stays on your
machine.

## Linux

The same app builds for Linux: everything that differs lives in
`src-tauri/src/platform/`, and the relay's transport in `hook/src/unix.rs`.

```bash
sudo apt install build-essential pkg-config \
  libwebkit2gtk-4.1-dev libgtk-layer-shell-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libdbus-1-dev patchelf \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good
npm install
npm run tauri dev      # live-reloading development build
npm run pack           # AppImage, .deb and .rpm in release/
```

What changes on Linux:

- **The island** is a gtk-layer-shell overlay anchored to the top edge, over any
  top panel, on compositors that support it: COSMIC, KDE Plasma, Hyprland, Sway
  and other wlroots compositors. GNOME has no layer-shell, so there the island is
  a regular window. `CUYCO_LAYER_SHELL=0` forces that mode anywhere.
- **Click-through** is the window's input region, kept equal to the island shape.
- **The cuy's eyes** follow the pointer only while it is over the island: Wayland
  gives no app the cursor position anywhere else.
- **Claude Code hooks** go through `~/.local/share/cuyco/bin/cuyco-hook` and a
  Unix socket at `$XDG_RUNTIME_DIR/cuyco.sock`.
- **Keys** live in the Secret Service (GNOME Keyring, KWallet).

## What's next

Cuyco is an early fork and the visuals are still a first pass. The running list of
what's left — character refinement, real sounds, the full Material 3 pass,
packaging and media — lives in [TODO.md](TODO.md).

## Credits

Cuyco is an independent fork inspired by **Coucou** by
[Louis Raillé](https://louisraille.fr). The original source code is MIT-licensed;
its brand and artwork — Coucou, the Mochi character, the icons, the sounds and the
media — remain © Louis Raillé, all rights reserved. Cuyco is not affiliated with,
or endorsed by, Coucou or its author.

## License

- **Code:** [MIT](LICENSE) — use it, fork it, learn from it, just keep the
  copyright notice.
- **Name, character, icon and sounds:** © Paul Delgado, all rights reserved — see
  [LICENSE-ASSETS.md](LICENSE-ASSETS.md). Shipping your own fork? Give it your own
  name, character and sounds.
