// Cuyco runs without a console window: Cuyco is the whole UI.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cuyco_lib::run()
}
