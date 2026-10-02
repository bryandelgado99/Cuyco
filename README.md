<div align="center">

<img src="src-tauri/icons/icon.png" width="168" alt="Cuyco, a small guinea pig peeking over the top edge of the screen">

# Cuyco

**A tiny guinea pig that lives at the top of your screen and keeps an eye on your AI coding agent sessions.**

Approve Claude Code permissions, watch your agents work, drop a file, chat with Claude, all without leaving what you're doing.

![Windows 10/11](https://img.shields.io/badge/Windows-10%2F11-0078D4?logo=windows&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb%20%7C%20rpm-FCC624?logo=linux&logoColor=black)
![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-backend-000?logo=rust)
![Bun](https://img.shields.io/badge/Bun-package%20manager-FBF0DF?logo=bun&logoColor=black)
![Material 3](https://img.shields.io/badge/Material%203-tokens-D0BCFF?logo=materialdesign&logoColor=black)
![License: MIT](https://img.shields.io/badge/license-MIT-CBA66E)

![surface](https://img.shields.io/badge/-141218-141218?style=flat-square)
![primary](https://img.shields.io/badge/-D0BCFF-D0BCFF?style=flat-square)
![caramel](https://img.shields.io/badge/-CBA66E-CBA66E?style=flat-square)
![cream](https://img.shields.io/badge/-F6E8D2-F6E8D2?style=flat-square)

*Material 3 dark roles, with the cuy's caramel and cream.*

</div>

---

## Why

Cuyco is an **independent, open fork** inspired by [Coucou](https://github.com/Louis-CFM/coucou),
which lives in the MacBook notch. There is no notch on a PC, so Cuyco lives at the
top edge of the screen instead, on Windows and Linux.

The **cuy** is a plump guinea pig (“cuy” is the Ecuadorian word for it) with a small
nose and whiskers. It peeks out when something is running, gets annoyed when you poke
it, goes dizzy if you insist, and tells you the moment Claude Code needs you.

## What you get

| On the island | What it does |
| --- | --- |
| 🤖 **Claude Code, live** | Every session at the top of your screen: what it reads, edits and runs, step by step. |
| ✅ **Approve from the island** | Permission requests show up with **Deny / Allow**, from any terminal: Windows Terminal, PowerShell, VS Code, Git Bash. One click, back to work. |
| 💬 **Chat with Claude** | Ask about a file you dropped or a session you're watching. |
| 📎 **Drop a file** | The cuy turns into a box, swallows the file, then answers questions about it. |
| 🔌 **Integrations** | Stripe, n8n, GitHub, Vercel, Resend, Notion and Cal.com, each with its own coloured pill. |
| 🎭 **A real character** | Idle breathing, blinks, eyes that follow the pointer, emotes and 28 sounds. |
| 🫥 **Invisible when idle** | Hides when nothing is running, peeks out when you reach the top of the screen. |
| 🔒 **Private by design** | No telemetry, no account. Keys live in the Windows Credential Manager or the Linux Secret Service. The app only talks to the services you plug in. |

## Build it yourself

You need [Rust](https://rustup.rs), [Bun](https://bun.sh) and, on Windows, the
**MSVC build tools** (Visual Studio Build Tools with “Desktop development with
C++”). WebView2 ships with Windows 10/11.

```powershell
bun install
bun run tauri dev      # live-reloading development build
bun run pack           # builds the installer and drops it in release/
```

`bun run dev` alone serves the front end in an ordinary browser, enough to work on
the island's looks. It also serves `dev/upload-preview.html`, which replays the whole
file-drop choreography on a loop: the one part of the UI that otherwise needs a real
drag from Explorer to see. Neither page ships in the app.

`bun run pack` leaves two files in `release/`:

```
Cuyco-Windows-X.Y.Z-setup.exe    the versioned installer
Cuyco-Windows-setup.exe          the same file under the rolling name
```

Installing is optional: `target/release/cuyco.exe` runs on its own. There is no
window in the taskbar and no console. The island at the top of the screen and the
cuy in the notification area are the whole app, and Quit lives in its menu.

The character and the icons are **drawn in code**, not shipped as image assets:

```powershell
bun run icons          # regenerates src-tauri/icons from scripts/gen-icons.mjs
bun run sounds         # regenerates the 28 WAVs from scripts/gen-sounds.mjs
```

<details>
<summary><b>Layout</b></summary>

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

</details>

## Setup

Open **Settings… → Claude Code → Install hooks…**. You get the exact diff of what
will change in `%USERPROFILE%\.claude\settings.json`, the path of the dated backup
that will be taken, and nothing is written until you click. Your own hooks are never
touched, and uninstalling removes only Cuyco's entries. A Claude Code session is
never blocked or slowed down by Cuyco.

Keys live in the **Windows Credential Manager** (Windows) or the **Secret Service**
(Linux), never on disk and never in the interface.

<details>
<summary><b>Log</b></summary>

`%LOCALAPPDATA%\Cuyco\cuyco.log` on Windows, `~/.local/share/cuyco/cuyco.log` on
Linux: hook events, permission decisions, poller problems. It stays on your machine.

</details>

<details>
<summary><b>Linux</b></summary>

The same app builds for Linux: everything that differs lives in
`src-tauri/src/platform/`, and the relay's transport in `hook/src/unix.rs`.

```bash
sudo apt install build-essential pkg-config \
  libwebkit2gtk-4.1-dev libgtk-layer-shell-dev libayatana-appindicator3-dev \
  librsvg2-dev libssl-dev libdbus-1-dev patchelf \
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good
bun install
bun run tauri dev      # live-reloading development build
bun run pack           # AppImage, .deb and .rpm in release/
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

</details>

## What's next

Cuyco is an early fork and the visuals are still a first pass. The running list of
what's left, from character refinement and real sounds to the full Material 3 pass,
packaging and media, lives in [TODO.md](TODO.md).

## Credits

Cuyco is an independent fork inspired by **Coucou** by
[Louis Raillé](https://louisraille.fr). The original source code is MIT-licensed;
its brand and artwork (Coucou, the Mochi character, the icons, the sounds and the
media) remain © Louis Raillé, all rights reserved. Cuyco is not affiliated with, or
endorsed by, Coucou or its author.

## License

- **Code:** [MIT](LICENSE): use it, fork it, learn from it, just keep the copyright
  notice.
- **Name, character, icon and sounds:** © Paul Delgado, all rights reserved, see
  [LICENSE-ASSETS.md](LICENSE-ASSETS.md). Shipping your own fork? Give it your own
  name, character and sounds.
