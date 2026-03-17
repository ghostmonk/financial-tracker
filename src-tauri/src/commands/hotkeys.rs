use crate::db_command;
use crate::models::category_hotkey::{self, CategoryHotkey, SetHotkeyParams};

db_command!(list_hotkeys -> Vec<CategoryHotkey>, category_hotkey::list_hotkeys);
db_command!(set_hotkey -> CategoryHotkey, category_hotkey::set_hotkey, params: SetHotkeyParams => move);
db_command!(remove_hotkey -> (), category_hotkey::remove_hotkey, key: String);
