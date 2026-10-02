// Agent hook installation (Claude Code today; Command Code, Codex and OpenCode
// slot into the same registry).
//
// The rule from CLAUDE.md is strict and is followed to the letter: read the
// agent's own config, take a dated backup, merge without touching anybody else's
// hooks, show the diff, and write only after an explicit click. Uninstall removes
// Cuyco's entries and nothing else.
//
// The command is only the quoted exe path plus the event name: on Windows Claude
// Code runs hook commands through Git Bash, and anything with PowerShell or cmd
// in it breaks.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};
use crate::{platform, settings};

/// One CLI agent Cuyco can watch.
pub struct Agent {
    /// Stable id, also used as the relay's `--agent` tag.
    pub id: &'static str,
    pub name: &'static str,
    /// `None` for Claude Code: its hooks are written without `--agent`, which is
    /// how every existing install looks, so they are recognised as untagged.
    pub tag: Option<&'static str>,
    /// Every event the island reacts to, with the hook timeout written to the
    /// agent's config. PermissionRequest waits for a human, so it gets the
    /// decision timeout + 10 s.
    pub events: &'static [(&'static str, u64)],
    pub kind: Kind,
    /// Where this agent's hooks are written.
    pub config: fn() -> PathBuf,
}

/// How an agent's hooks are installed.
pub enum Kind {
    /// A `hooks` object inside the agent's own settings JSON.
    JsonHooks,
    /// Codex reads `hooks.json` only when `features.hooks` is on, so installing
    /// touches two files: the hooks themselves, and that one flag in config.toml.
    CodexHooks,
}

/// Claude Code's events: the full vocabulary, with permission requests on the
/// long timeout because the relay holds the connection until a human answers.
const CLAUDE_EVENTS: &[(&str, u64)] = &[
    ("SessionStart", 10),
    ("SessionEnd", 10),
    ("UserPromptSubmit", 10),
    ("PreToolUse", 10),
    ("PostToolUse", 10),
    ("PostToolUseFailure", 10),
    ("PermissionRequest", 120),
    ("Notification", 10),
    ("Stop", 10),
    ("StopFailure", 10),
    ("SubagentStart", 10),
    ("SubagentStop", 10),
];

/// Command Code's four hook events. It has no permission, prompt or subagent
/// events, so those simply never arrive from it.
const COMMAND_CODE_EVENTS: &[(&str, u64)] = &[
    ("SessionStart", 10),
    ("PreToolUse", 10),
    ("PostToolUse", 10),
    ("Stop", 10),
];

/// Codex speaks the same event vocabulary as Claude Code; these are the ones the
/// island reacts to. PermissionRequest is left out on purpose: the relay answers
/// with Claude's output shape, and until Codex's is confirmed a request it cannot
/// read would just hang, so Codex keeps asking in the terminal.
const CODEX_EVENTS: &[(&str, u64)] = &[
    ("SessionStart", 10),
    ("UserPromptSubmit", 10),
    ("PreToolUse", 10),
    ("PostToolUse", 10),
    ("Stop", 10),
    ("SessionEnd", 10),
    ("SubagentStart", 10),
    ("SubagentStop", 10),
];

pub const AGENTS: &[Agent] = &[
    Agent {
        id: "claude",
        name: "Claude Code",
        tag: None,
        events: CLAUDE_EVENTS,
        kind: Kind::JsonHooks,
        config: claude_settings_path,
    },
    Agent {
        id: "commandcode",
        name: "Command Code",
        tag: Some("commandcode"),
        events: COMMAND_CODE_EVENTS,
        kind: Kind::JsonHooks,
        config: commandcode_settings_path,
    },
    Agent {
        id: "codex",
        name: "Codex",
        tag: Some("codex"),
        events: CODEX_EVENTS,
        kind: Kind::CodexHooks,
        config: codex_hooks_path,
    },
];

/// Marker that identifies a Cuyco entry inside an agent's config.
const MARKER: &str = "cuyco-hook";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookStatus {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub settings_path: String,
    pub hook_path: String,
    pub hook_ready: bool,
}

/// One file an install (or uninstall) rewrites, with the diff to show for it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookFileDiff {
    pub path: String,
    pub diff: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookPreview {
    pub files: Vec<HookFileDiff>,
    /// One dated backup path per file, in the same order.
    pub backups: Vec<String>,
    /// The agent's hooks file, for the panel's header.
    pub settings_path: String,
    /// Identifies the bytes this diff was computed from; handed back to `write`
    /// so we only ever apply what the user actually looked at.
    pub fingerprint: String,
}

pub fn agent(id: &str) -> Option<&'static Agent> {
    AGENTS.iter().find(|a| a.id == id)
}

fn claude_settings_path() -> PathBuf {
    platform::home_dir().join(".claude").join("settings.json")
}

/// The user-scope file, so one install covers every project. Command Code also
/// reads a project-level `.commandcode/settings.json`, which wins over this one:
/// a project that ships its own hooks is left alone, but ours still fire
/// everywhere else.
fn commandcode_settings_path() -> PathBuf {
    platform::home_dir().join(".commandcode").join("settings.json")
}

/// Codex keeps its own hooks in `$CODEX_HOME/hooks.json` (CODEX_HOME defaults to
/// ~/.codex), separate from config.toml.
fn codex_hooks_path() -> PathBuf {
    platform::home_dir().join(".codex").join("hooks.json")
}

fn codex_config_path() -> PathBuf {
    platform::home_dir().join(".codex").join("config.toml")
}

/// The agent's config path.
fn settings_path(agent: &Agent) -> PathBuf {
    (agent.config)()
}

/// Reads the agent's config.
///
/// The only error that means "start from nothing" is the file not being there.
/// Everything else — a lock held by another process, a permission problem, JSON
/// we cannot parse — is reported, because the alternative is treating somebody's
/// unreadable settings as an empty object and then writing that back over them.
fn read_settings(agent: &Agent) -> Result<Value, String> {
    let path = settings_path(agent);
    match std::fs::read(&path) {
        Ok(bytes) => parse_settings(&bytes, &path.display().to_string()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        // A lock, a permission problem, a bad drive: all of them mean we do not
        // know what is in there, and not knowing is not the same as empty.
        Err(err) => Err(format!("Can't read {}: {err}", path.display())),
    }
}

/// The parsing half of `read_settings`, split out so it can be tested without a
/// home directory.
fn parse_settings(bytes: &[u8], path: &str) -> Result<Value, String> {
    // PowerShell writes a UTF-8 BOM with `Set-Content -Encoding utf8`, and
    // serde_json refuses it. Stripping it is safe and well defined; guessing at
    // anything else is not.
    let text = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    if text.iter().all(u8::is_ascii_whitespace) {
        return Ok(json!({}));
    }
    match serde_json::from_slice::<Value>(text) {
        Ok(v) if v.is_object() => Ok(v),
        Ok(_) => Err(format!("{path} isn't a JSON object — Cuyco won't touch it.")),
        Err(err) => Err(format!(
            "{path} isn't valid JSON ({err}). Fix or move it, then try again — Cuyco won't overwrite it."
        )),
    }
}

/// The settings as they are, or an empty object when we cannot tell. Only for
/// read-only paths like `status()`, which must never fail loudly; anything that
/// writes uses `read_settings()` and surfaces the error instead.
fn read_settings_lossy(agent: &Agent) -> Value {
    read_settings(agent).unwrap_or_else(|_| json!({}))
}

/// The trailing arguments of a hook command: the agent tag (when the agent has
/// one) and the event name. Claude Code's entries carry no tag.
fn hook_args(agent: &Agent, event: &str) -> String {
    match agent.tag {
        Some(tag) => format!("--agent {tag} {event}"),
        None => event.to_string(),
    }
}

#[cfg(windows)]
fn hook_command(agent: &Agent, event: &str) -> String {
    let exe = settings::hook_exe_path().to_string_lossy().replace('\\', "/");
    format!("\"{exe}\" {}", hook_args(agent, event))
}

/// The agents run the command through `sh`, which still reads `$`, `` ` `` and
/// `\` inside double quotes. Single quotes keep the path a path, whatever the
/// home directory is called.
#[cfg(unix)]
fn hook_command(agent: &Agent, event: &str) -> String {
    format!(
        "{} {}",
        sh_quote(&settings::hook_exe_path().to_string_lossy()),
        hook_args(agent, event)
    )
}

/// `s` as one single-quoted shell word: `'` becomes `'\''`, nothing else is
/// special inside single quotes.
#[cfg(unix)]
fn sh_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

/// True when `command` is one Cuyco wrote for this agent. The marker alone is not
/// enough once several agents share the relay: the `--agent` tag says whose entry
/// it is, and Claude Code's untagged entries must not be confused with them.
fn command_is_ours(command: &str, agent: &Agent) -> bool {
    if !command.contains(MARKER) {
        return false;
    }
    match agent.tag {
        None => !command.contains("--agent"),
        Some(tag) => {
            let needle = format!("--agent {tag}");
            command.contains(&format!("{needle} ")) || command.ends_with(&needle)
        }
    }
}

fn entry_is_ours(entry: &Value, agent: &Agent) -> bool {
    entry
        .get("hooks")
        .and_then(Value::as_array)
        .map(|hooks| {
            hooks.iter().any(|h| {
                h.get("command")
                    .and_then(Value::as_str)
                    .map(|c| command_is_ours(c, agent))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Settings with this agent's hooks added; everything else is left untouched.
fn merged(existing: &Value, agent: &Agent) -> Value {
    let mut root = existing.as_object().cloned().unwrap_or_default();
    let mut hooks = root
        .get("hooks")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(Map::new);

    for (event, timeout) in agent.events {
        let mut list = hooks
            .get(*event)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        list.retain(|entry| !entry_is_ours(entry, agent));
        list.push(json!({
            "hooks": [{
                "type": "command",
                "command": hook_command(agent, event),
                "timeout": timeout,
            }]
        }));
        hooks.insert((*event).to_string(), Value::Array(list));
    }

    root.insert("hooks".into(), Value::Object(hooks));
    Value::Object(root)
}

/// Settings with every Cuyco entry removed, and nothing else changed.
fn without_ours(existing: &Value, agent: &Agent) -> Value {
    let mut root = existing.as_object().cloned().unwrap_or_default();
    let Some(hooks) = root.get("hooks").and_then(Value::as_object).cloned() else {
        return Value::Object(root);
    };
    let mut out = Map::new();
    for (event, value) in hooks {
        match value.as_array() {
            Some(list) => {
                let kept: Vec<Value> = list
                    .iter()
                    .filter(|e| !entry_is_ours(e, agent))
                    .cloned()
                    .collect();
                if !kept.is_empty() {
                    out.insert(event, Value::Array(kept));
                }
            }
            None => {
                out.insert(event, value);
            }
        }
    }
    if out.is_empty() {
        root.remove("hooks");
    } else {
        root.insert("hooks".into(), Value::Object(out));
    }
    Value::Object(root)
}

fn pretty(v: &Value) -> String {
    serde_json::to_string_pretty(v).unwrap_or_default()
}

/// Down to the second: installing then uninstalling in the same minute must not
/// quietly overwrite the first backup.
fn stamp() -> String {
    let t = platform::local_time();
    format!(
        "{:04}{:02}{:02}-{:02}{:02}{:02}",
        t.year, t.month, t.day, t.hour, t.minute, t.second
    )
}

/// `<name>.bak-<stamp>` beside the file it backs up. Down to the second:
/// installing then uninstalling in the same minute must not quietly overwrite
/// the first backup.
fn backup_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "settings".into());
    path.with_file_name(format!("{name}.bak-{}", stamp()))
}

/// Identifies the exact bytes a preview was computed from. FNV-1a is plenty:
/// the question is only "is this still the file I showed the user?".
fn fingerprint(bytes: &[u8]) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for b in bytes {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x1000_0000_01b3);
    }
    format!("{hash:016x}")
}

/// One file an install (or uninstall) rewrites.
struct Change {
    path: PathBuf,
    /// The bytes as found; empty when the file does not exist yet.
    before: Vec<u8>,
    /// What the file should hold afterwards.
    after: String,
}

/// Identifies every file a preview read, so `write` can refuse a plan built from
/// configs that have moved on since the user looked at the diff.
fn fingerprint_of(plan: &[Change]) -> String {
    let mut bytes = Vec::new();
    for c in plan {
        bytes.extend_from_slice(c.path.to_string_lossy().as_bytes());
        bytes.push(0);
        bytes.extend_from_slice(&c.before);
        bytes.push(0);
    }
    fingerprint(&bytes)
}

/// The bytes of `path`, or nothing when it is not there. A file we cannot read is
/// an error, never "empty": writing over a locked config would lose it.
fn read_optional(path: &Path) -> Result<Vec<u8>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(err) => Err(format!("Can't read {}: {err}", path.display())),
    }
}

/// The agent's hooks file with this install (or uninstall) applied.
fn json_change(path: PathBuf, agent: &Agent, install: bool) -> Result<Change, String> {
    let before = read_optional(&path)?;
    let current = parse_settings(&before, &path.display().to_string())?;
    let next = if install {
        merged(&current, agent)
    } else {
        without_ours(&current, agent)
    };
    let mut after = pretty(&next);
    after.push('\n');
    Ok(Change { path, before, after })
}

/// Every file installing (or uninstalling) this agent rewrites.
fn changes(agent: &Agent, install: bool) -> Result<Vec<Change>, String> {
    let mut plan = vec![json_change(settings_path(agent), agent, install)?];
    // Codex loads hooks.json only when features.hooks is on, so the install also
    // flips that flag. Uninstall leaves config.toml alone: we cannot tell our
    // flag from one the user set, and a hooks.json without our entries is inert.
    if install && matches!(agent.kind, Kind::CodexHooks) {
        let path = codex_config_path();
        let before = read_optional(&path)?;
        let text = String::from_utf8_lossy(&before).to_string();
        let after = codex_config_with_hooks(&text);
        if after != text {
            plan.push(Change { path, before, after });
        }
    }
    Ok(plan)
}

/// config.toml with `features.hooks = true`, edited line by line so comments,
/// ordering and formatting all survive. Cuyco writes this one key and nothing
/// else, so it does not need to understand the rest of the file.
fn codex_config_with_hooks(text: &str) -> String {
    const HEADER: &str = "[features]";
    const KEY: &str = "hooks";
    const DOTTED: &str = "features.hooks";
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    let mut in_features = false;

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_features = trimmed == HEADER;
            continue;
        }
        // A comment's "# hooks = true" yields "# hooks", which matches nothing.
        let name = trimmed.split('=').next().unwrap_or("").trim();
        if (in_features && name == KEY) || name == DOTTED {
            lines[i] = format!("{name} = true");
            return ending(lines);
        }
    }

    // Not there yet: inside an existing [features], or as a table of its own.
    if let Some(i) = lines.iter().position(|l| l.trim() == HEADER) {
        lines.insert(i + 1, format!("{KEY} = true"));
    } else {
        if !lines.is_empty() {
            lines.push(String::new());
        }
        lines.push(HEADER.to_string());
        lines.push(format!("{KEY} = true"));
    }
    ending(lines)
}

/// `lines` as a TOML file, always with a closing newline.
fn ending(lines: Vec<String>) -> String {
    let mut out = lines.join("\n");
    if !out.is_empty() {
        out.push('\n');
    }
    out
}

// ── Public API ────────────────────────────────────────────────────────────────

pub fn status(agent: &Agent) -> HookStatus {
    let current = read_settings_lossy(agent);
    let installed = current
        .get("hooks")
        .and_then(Value::as_object)
        .map(|hooks| {
            hooks
                .values()
                .filter_map(Value::as_array)
                .flatten()
                .any(|e| entry_is_ours(e, agent))
        })
        .unwrap_or(false);
    let hook_path = settings::hook_exe_path();
    HookStatus {
        id: agent.id.to_string(),
        name: agent.name.to_string(),
        installed,
        settings_path: settings_path(agent).to_string_lossy().to_string(),
        hook_ready: hook_path.exists(),
        hook_path: hook_path.to_string_lossy().to_string(),
    }
}

/// Every agent's status, for the settings panel.
pub fn statuses() -> Vec<HookStatus> {
    AGENTS.iter().map(status).collect()
}

/// The ids of the agents whose hooks are actually in their config right now.
pub fn installed_agents() -> Vec<String> {
    AGENTS
        .iter()
        .filter(|a| status(a).installed)
        .map(|a| a.id.to_string())
        .collect()
}

pub fn preview(agent: &Agent, install: bool) -> Result<HookPreview, String> {
    let plan = changes(agent, install)?;
    Ok(HookPreview {
        files: plan
            .iter()
            .map(|c| HookFileDiff {
                path: c.path.to_string_lossy().to_string(),
                diff: unified_diff(&String::from_utf8_lossy(&c.before), &c.after),
            })
            .collect(),
        backups: plan
            .iter()
            .map(|c| backup_path(&c.path).to_string_lossy().to_string())
            .collect(),
        settings_path: plan
            .first()
            .map(|c| c.path.to_string_lossy().to_string())
            .unwrap_or_default(),
        fingerprint: fingerprint_of(&plan),
    })
}

/// Writes every file the plan touches, after taking a dated backup of each.
///
/// `fingerprint` is the one the preview was computed from. If any file changed
/// in between — another tool, another window, the user's own editor — we stop
/// and make them look at a fresh diff, because the only thing worse than not
/// installing the hooks is silently reverting somebody else's edit.
pub fn write(agent: &Agent, install: bool, fingerprint: &str) -> Result<Vec<String>, String> {
    let plan = changes(agent, install)?;
    if fingerprint_of(&plan) != fingerprint {
        let first = plan
            .first()
            .map(|c| c.path.display().to_string())
            .unwrap_or_default();
        return Err(format!(
            "{first} changed since the preview. Nothing was written — review the new diff."
        ));
    }

    let mut written = Vec::new();
    for change in &plan {
        let backup = backup_path(&change.path);
        write_one(change, &backup)?;
        written.push(backup.to_string_lossy().to_string());
    }
    Ok(written)
}

/// Backs up the file (when it exists) and writes `change.after` beside it, then
/// renames over it: a crash or a full disk leaves the original intact rather
/// than half a file.
fn write_one(change: &Change, backup: &Path) -> Result<(), String> {
    let dir = change.path.parent().unwrap_or(Path::new("."));
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    if change.path.exists() {
        std::fs::copy(&change.path, backup).map_err(|e| format!("backup failed: {e}"))?;
    }

    // A dotfiles setup often makes these files symlinks: write to the file they
    // point at, so the link survives the rename below.
    #[cfg(unix)]
    let path = std::fs::canonicalize(&change.path).unwrap_or_else(|_| change.path.clone());
    #[cfg(not(unix))]
    let path = change.path.clone();

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "settings".into());
    let temp = path.with_file_name(format!("{name}.cuyco-{}", std::process::id()));
    if let Err(err) = write_like(&temp, &path, change.after.as_bytes()) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("write failed: {err}"));
    }
    if let Err(err) = std::fs::rename(&temp, &path) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("write failed: {err}"));
    }
    Ok(())
}

/// Writes `bytes` to `temp`, which is about to replace `original`.
///
/// On Linux a fresh file would get the umask's 0644, and settings.json can hold
/// API keys in its `env` block: the new file is created readable by us only,
/// then given the original's permissions, so the rename never widens them.
fn write_like(temp: &Path, original: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(temp)?;
    file.write_all(bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(original)
            .map(|m| m.permissions().mode() & 0o777)
            .unwrap_or(0o600);
        file.set_permissions(std::fs::Permissions::from_mode(mode))?;
    }
    #[cfg(not(unix))]
    let _ = original;
    Ok(())
}

/// Copies the relay (cuyco-hook.exe / cuyco-hook) into the local data dir's
/// bin/ on launch. In a bundled install it comes from the app resources; in
/// `tauri dev` it sits next to the app binary in the workspace target directory.
///
/// Every candidate is tried rather than just the first, because getting this
/// wrong is silent and fatal: `resources` used to be a glob, which made NSIS
/// mirror the source path into `_up_\target\release\`, no candidate matched, and
/// the relay was simply never installed. It only looked healthy on a developer
/// machine, where a leftover copy from `tauri dev` was already sitting in bin/.
pub fn ensure_hook_exe(app: &AppHandle) {
    let dest = settings::hook_exe_path();
    let Some(dir) = dest.parent() else { return };
    // Nobody else may swap the relay the agents run: its folder is ours only.
    if platform::ensure_private_dir(&settings::local_dir()).is_err()
        || std::fs::create_dir_all(dir).is_err()
    {
        return;
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(p) = app.path().resolve(platform::HOOK_EXE, tauri::path::BaseDirectory::Resource) {
        candidates.push(p);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            // Installed build, then `tauri dev` (target/debug) next to the
            // release hook the pre-build step produces.
            candidates.push(parent.join(platform::HOOK_EXE));
            candidates.push(parent.join("../release").join(platform::HOOK_EXE));
            // Belt and braces: where the old glob form used to land it.
            candidates.push(parent.join("_up_/target/release").join(platform::HOOK_EXE));
        }
    }

    let tried: Vec<String> = candidates.iter().map(|p| p.display().to_string()).collect();
    let Some(src) = candidates.into_iter().find(|p| p.exists()) else {
        crate::log::line(format!(
            "{} not found — agent hooks cannot work. Looked in: {}",
            platform::HOOK_EXE,
            tried.join(", ")
        ));
        return;
    };
    install_relay(&src, &dest);
}

#[cfg(windows)]
fn install_relay(src: &Path, dest: &Path) {
    let same = match (std::fs::metadata(src), std::fs::metadata(dest)) {
        (Ok(a), Ok(b)) => a.len() == b.len() && a.modified().ok() == b.modified().ok(),
        _ => false,
    };
    if same {
        return;
    }
    // A hook may be running right now and hold the file open; keeping the old
    // copy is fine, it is the same relay.
    if let Err(err) = std::fs::copy(src, dest) {
        if !dest.exists() {
            crate::log::line(format!("could not install {}: {err}", platform::HOOK_EXE));
        }
    }
}

/// Linux does not keep the modification time on copy, so the contents decide.
/// The new relay is written beside the old one and renamed over it: a hook
/// starting at that moment runs either the old relay or the new one, never half
/// of one, and a relay that is running right now does not block the update.
#[cfg(unix)]
fn install_relay(src: &Path, dest: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if matches!((std::fs::read(src), std::fs::read(dest)), (Ok(a), Ok(b)) if a == b) {
        return;
    }
    let temp = dest.with_extension(format!("new-{}", std::process::id()));
    let result = std::fs::copy(src, &temp)
        .and_then(|_| std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o755)))
        .and_then(|_| std::fs::rename(&temp, dest));
    if let Err(err) = result {
        let _ = std::fs::remove_file(&temp);
        crate::log::line(format!("could not install {}: {err}", platform::HOOK_EXE));
    }
}

// ── Minimal unified diff (LCS) ────────────────────────────────────────────────

/// settings.json is short, so a plain O(n·m) LCS is the simplest honest diff.
fn unified_diff(before: &str, after: &str) -> String {
    let a: Vec<&str> = before.lines().collect();
    let b: Vec<&str> = after.lines().collect();
    let (n, m) = (a.len(), b.len());

    let mut lcs = vec![vec![0usize; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            lcs[i][j] = if a[i] == b[j] {
                lcs[i + 1][j + 1] + 1
            } else {
                lcs[i + 1][j].max(lcs[i][j + 1])
            };
        }
    }

    let mut out: Vec<String> = Vec::new();
    let (mut i, mut j) = (0usize, 0usize);
    while i < n && j < m {
        if a[i] == b[j] {
            out.push(format!("  {}", a[i]));
            i += 1;
            j += 1;
        } else if lcs[i + 1][j] >= lcs[i][j + 1] {
            out.push(format!("- {}", a[i]));
            i += 1;
        } else {
            out.push(format!("+ {}", b[j]));
            j += 1;
        }
    }
    while i < n {
        out.push(format!("- {}", a[i]));
        i += 1;
    }
    while j < m {
        out.push(format!("+ {}", b[j]));
        j += 1;
    }

    // Keep three lines of context around each change so the panel stays readable.
    let changed: Vec<usize> = out
        .iter()
        .enumerate()
        .filter(|(_, l)| l.starts_with('+') || l.starts_with('-'))
        .map(|(i, _)| i)
        .collect();
    if changed.is_empty() {
        return "No change.".into();
    }
    let mut keep = vec![false; out.len()];
    for idx in changed {
        let lo = idx.saturating_sub(3);
        let hi = (idx + 4).min(out.len());
        for k in lo..hi {
            keep[k] = true;
        }
    }
    let mut result = String::new();
    let mut gap = false;
    for (idx, line) in out.iter().enumerate() {
        if keep[idx] {
            result.push_str(line);
            result.push('\n');
            gap = false;
        } else if !gap {
            result.push_str("  …\n");
            gap = true;
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    const WHERE: &str = "settings.json";

    fn claude() -> &'static Agent {
        agent("claude").expect("claude is always registered")
    }

    /// A stand-in agent, so the per-agent command matching can be tested without
    /// depending on which agents happen to be registered.
    fn tagged(id: &'static str, tag: &'static str) -> Agent {
        Agent {
            id,
            name: id,
            tag: Some(tag),
            events: &[],
            kind: Kind::JsonHooks,
            config: claude_settings_path,
        }
    }

    #[test]
    fn an_agents_entries_are_never_mistaken_for_anothers() {
        let cc = tagged("commandcode", "commandcode");
        let codex = tagged("codex", "codex");
        assert!(command_is_ours("\"x/cuyco-hook.exe\" PreToolUse", claude()));
        assert!(!command_is_ours("\"x/cuyco-hook.exe\" --agent codex PreToolUse", claude()));
        assert!(command_is_ours("\"x/cuyco-hook.exe\" --agent codex PreToolUse", &codex));
        assert!(!command_is_ours("\"x/cuyco-hook.exe\" --agent commandcode Stop", &codex));
        assert!(!command_is_ours("someone-else.exe", &codex));
        // "code" is a prefix of "codex": matching must not be that loose.
        assert!(!command_is_ours("\"x/cuyco-hook.exe\" --agent codex Stop", &cc));
    }

    #[test]
    fn the_registry_covers_every_agent_we_ship() {
        let ids: Vec<&str> = AGENTS.iter().map(|a| a.id).collect();
        assert_eq!(ids, ["claude", "commandcode", "codex"]);
        // Claude Code is the only untagged entry: every other agent must carry a
        // tag, or its entries and Claude's would be indistinguishable.
        assert_eq!(AGENTS.iter().filter(|a| a.tag.is_none()).count(), 1);
        // Every agent points at a real file below the user's home.
        for a in AGENTS {
            assert!(settings_path(a).starts_with(platform::home_dir()), "{}", a.id);
        }
    }

    #[test]
    fn codex_gains_its_flag_once_and_keeps_the_rest_of_the_file() {
        // No [features] table: one is appended, and the existing config stays.
        let added = codex_config_with_hooks("model = \"gpt\"\n");
        assert!(added.starts_with("model = \"gpt\""));
        assert!(added.contains("[features]\nhooks = true"));
        // Running it again rewrites the same line instead of adding a second.
        assert_eq!(codex_config_with_hooks(&added), added);
        assert_eq!(added.matches("hooks = true").count(), 1);
        // An existing table gets the key right under its header.
        let in_table = codex_config_with_hooks("[features]\nmemories = true\n");
        assert!(in_table.contains("[features]\nhooks = true\nmemories = true"));
        // A value the user set is turned on rather than duplicated.
        assert_eq!(codex_config_with_hooks("[features]\nhooks = false\n"), "[features]\nhooks = true\n");
        // A commented-out key is not mistaken for a real one.
        let commented = codex_config_with_hooks("# hooks = true\n");
        assert!(commented.contains("\n[features]\nhooks = true"));
        assert!(commented.starts_with("# hooks = true"));
    }

    #[test]
    fn a_utf8_bom_is_stripped_not_treated_as_corruption() {
        // PowerShell 5's `Set-Content -Encoding utf8` produces exactly this.
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(br#"{"model":"opus","hooks":{}}"#);
        let parsed = parse_settings(&bytes, WHERE).expect("a BOM must not defeat the parser");
        assert_eq!(parsed["model"], "opus");
    }

    #[test]
    fn unreadable_content_is_an_error_never_an_empty_object() {
        // This is the whole bug: returning {} here meant `merged()` produced a
        // file containing nothing but Cuyco's hooks, and the write replaced
        // everything the user had.
        for bad in [&b"{ not json"[..], &b"[1,2,3]"[..], &b"\"a string\""[..]] {
            assert!(
                parse_settings(bad, WHERE).is_err(),
                "content we cannot use must refuse, not come back empty"
            );
        }
    }

    #[test]
    fn empty_and_whitespace_files_start_from_nothing() {
        assert_eq!(parse_settings(b"", WHERE).unwrap(), json!({}));
        assert_eq!(parse_settings(b"  
	 ", WHERE).unwrap(), json!({}));
    }

    #[test]
    fn merging_keeps_every_other_setting_and_every_foreign_hook() {
        let existing = serde_json::json!({
            "model": "claude-opus-5",
            "theme": "dark",
            "enabledPlugins": ["a", "b"],
            "hooks": {
                "PreToolUse": [
                    { "hooks": [{ "type": "command", "command": "someone-elses-tool.exe" }] }
                ],
                "SomeEventWeDoNotTouch": [
                    { "hooks": [{ "type": "command", "command": "keep-me.exe" }] }
                ]
            }
        });

        let after = merged(&existing, claude());
        assert_eq!(after["model"], "claude-opus-5");
        assert_eq!(after["theme"], "dark");
        assert_eq!(after["enabledPlugins"], serde_json::json!(["a", "b"]));

        let pre = after["hooks"]["PreToolUse"].as_array().unwrap();
        assert!(
            pre.iter().any(|e| serde_json::to_string(e).unwrap().contains("someone-elses-tool.exe")),
            "another tool's hook was dropped"
        );
        assert!(pre.iter().any(|e| entry_is_ours(e, claude())), "our own hook was not added");
        assert!(after["hooks"]["SomeEventWeDoNotTouch"].is_array());

        // And removing ours puts it back exactly as it was.
        let cleaned = without_ours(&after, claude());
        assert_eq!(cleaned, existing);
    }

    #[test]
    fn a_fingerprint_notices_any_change() {
        assert_eq!(fingerprint(b"{}"), fingerprint(b"{}"));
        assert_ne!(fingerprint(b"{}"), fingerprint(b"{ }"));
        assert_ne!(fingerprint(b""), fingerprint(b"{}"));
    }

    #[cfg(unix)]
    #[test]
    fn the_hook_path_is_one_shell_word_whatever_it_contains() {
        assert_eq!(sh_quote("/home/a b/x"), "'/home/a b/x'");
        // $, backticks, backslashes and double quotes stay literal in single quotes.
        assert_eq!(sh_quote(r#"/h/$(id)`x`\"y"#), r#"'/h/$(id)`x`\"y'"#);
        // A single quote closes, escapes and reopens.
        assert_eq!(sh_quote("/h/it's"), r"'/h/it'\''s'");
    }

    /// settings.json can carry API keys in its `env` block: rewriting it must
    /// never make it readable by more people than before.
    #[cfg(unix)]
    #[test]
    fn rewriting_settings_never_widens_its_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("cuyco-perm-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let original = dir.join("settings.json");
        let temp = dir.join("settings.json.new");
        let mode = |p: &Path| std::fs::metadata(p).unwrap().permissions().mode() & 0o777;

        for wanted in [0o600, 0o640, 0o644] {
            std::fs::write(&original, b"{}").unwrap();
            std::fs::set_permissions(&original, std::fs::Permissions::from_mode(wanted)).unwrap();
            let _ = std::fs::remove_file(&temp);
            write_like(&temp, &original, b"{\"a\":1}").unwrap();
            assert_eq!(mode(&temp), wanted, "the rewrite must keep {wanted:o}");
        }

        // No original: ours only.
        std::fs::remove_file(&original).unwrap();
        let _ = std::fs::remove_file(&temp);
        write_like(&temp, &original, b"{}").unwrap();
        assert_eq!(mode(&temp), 0o600);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Everything filesystem-shaped lives in one test on purpose: it points
    /// the home directory at a temp directory, and that is process-wide.
    #[test]
    fn writing_backs_up_preserves_and_refuses_a_changed_file() {
        let tmp = std::env::temp_dir().join(format!("cuyco-hooks-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join(".claude")).unwrap();
        std::env::set_var(platform::HOME_VAR, &tmp);

        let path = settings_path(claude());
        assert!(path.starts_with(&tmp), "the test must not touch the real home");

        // A real-shaped file, written the way PowerShell 5 would: UTF-8 with BOM.
        let original = r#"{"model":"claude-opus-5","theme":"dark","tui":{"x":1},"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"other-tool.exe"}]}]}}"#;
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(original.as_bytes());
        std::fs::write(&path, &bytes).unwrap();

        // Install.
        let plan = preview(claude(), true).expect("a BOM must not stop the preview");
        assert!(plan.files[0].diff.contains("cuyco-hook"), "the diff must show what changes");
        let backup = write(claude(), true, &plan.fingerprint).expect("install should succeed");
        assert_eq!(backup.len(), 1);

        // The backup holds the original bytes, BOM and all.
        assert_eq!(std::fs::read(&backup[0]).unwrap(), bytes);

        // Everything else survived, and so did the other tool's hook.
        let after: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(after["model"], "claude-opus-5");
        assert_eq!(after["theme"], "dark");
        assert_eq!(after["tui"]["x"], 1);
        let pre = after["hooks"]["PreToolUse"].as_array().unwrap();
        assert!(pre.iter().any(|e| serde_json::to_string(e).unwrap().contains("other-tool.exe")));
        assert!(status(claude()).installed);

        // A file that moved since the preview is refused, and left alone.
        let stale = preview(claude(), false).unwrap();
        std::fs::write(&path, br#"{"model":"someone-else-edited-this"}"#).unwrap();
        let err = write(claude(), false, &stale.fingerprint).unwrap_err();
        assert!(err.contains("changed since the preview"), "got: {err}");
        let untouched: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(untouched["model"], "someone-else-edited-this");

        // Content we cannot parse is refused before anything is written.
        std::fs::write(&path, b"{ broken").unwrap();
        assert!(preview(claude(), true).is_err());
        assert!(write(claude(), true, "whatever").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"{ broken");

        // Codex: its hooks.json plus the one flag in config.toml, written together.
        let codex = agent("codex").expect("codex is always registered");
        let plan = changes(codex, true).unwrap();
        assert_eq!(plan.len(), 2, "codex installs its hooks and flips features.hooks");
        assert_eq!(plan[0].path, codex_hooks_path());
        assert_eq!(plan[1].path, codex_config_path());
        assert_eq!(write(codex, true, &fingerprint_of(&plan)).unwrap().len(), 2);
        let hooks: Value =
            serde_json::from_slice(&std::fs::read(codex_hooks_path()).unwrap()).unwrap();
        assert!(hooks["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
            .as_str()
            .unwrap()
            .contains("--agent codex"));
        assert!(std::fs::read_to_string(codex_config_path()).unwrap().contains("hooks = true"));
        assert!(status(codex).installed);
        // A second install only rewrites the hooks: the flag is already on.
        assert_eq!(changes(codex, true).unwrap().len(), 1);
        // Uninstall cleans the hooks and leaves the flag alone.
        assert_eq!(changes(codex, false).unwrap().len(), 1);

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
