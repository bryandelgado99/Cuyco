// Preferences, stored as plain JSON in settings.json under platform::config_dir().
// No secret ever lands here — API keys live in the OS keychain (see secrets.rs).

use serde::{Deserialize, Deserializer, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub auto_close_interval: f64,
    pub absence_interval: f64,
    pub active_integrations: Vec<String>,
    /// "primary" = the main display, "cursor" = whichever display the mouse is on.
    pub screen: String,
    pub autostart: bool,
    /// Ids of the CLI agents whose hooks are installed (see hooks::AGENTS).
    /// Older builds stored a single bool for Claude Code; `installed_agents`
    /// accepts both so an existing settings.json still loads.
    #[serde(default, deserialize_with = "installed_agents")]
    pub hooks_installed: Vec<String>,
    /// "system" (follow the OS), "light" or "dark". Defaulted so an older
    /// settings.json still loads.
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Where the island docks: "top", "left" or "right".
    #[serde(default = "default_position")]
    pub position: String,
    /// "Cuy only": hide the agents panel (pills, mini-grid, overview, tabs).
    #[serde(default = "default_hide_agents")]
    pub hide_agents: bool,
    /// Editor "Open terminal" launches: "vscode", "zed", "android-studio", "system" or "custom".
    #[serde(default = "default_editor")]
    pub editor: String,
    /// Launcher used when `editor == "custom"`: an exe name on PATH or a full path.
    #[serde(default)]
    pub editor_command: String,
}

/// `hooksInstalled` used to be `true`/`false` for Claude Code alone. Read both
/// shapes: a bool maps onto Claude, a list is taken as it is.
fn installed_agents<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Stored {
        Bool(bool),
        List(Vec<String>),
    }
    Ok(match Stored::deserialize(deserializer)? {
        Stored::Bool(true) => vec!["claude".into()],
        Stored::Bool(false) => Vec::new(),
        Stored::List(ids) => ids,
    })
}

fn default_theme() -> String {
    "system".into()
}

fn default_position() -> String {
    "top".into()
}

fn default_hide_agents() -> bool {
    false
}

fn default_editor() -> String {
    "vscode".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            sound_volume: 0.12,
            auto_close_interval: 15.0,
            absence_interval: 180.0,
            active_integrations: vec![
                "integration_resend".into(),
                "integration_n8n".into(),
                "integration_vercel".into(),
                "integration_github".into(),
            ],
            screen: "primary".into(),
            autostart: false,
            hooks_installed: Vec::new(),
            theme: default_theme(),
            position: default_position(),
            hide_agents: default_hide_agents(),
            editor: default_editor(),
            editor_command: String::new(),
        }
    }
}

pub use crate::platform::{config_dir, local_dir};

pub fn hook_exe_path() -> PathBuf {
    local_dir().join("bin").join(crate::platform::HOOK_EXE)
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    match std::fs::read(settings_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

pub fn save(settings: &Settings) -> std::io::Result<()> {
    let dir = config_dir();
    crate::platform::ensure_private_dir(&dir)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(settings_path(), json)
}
