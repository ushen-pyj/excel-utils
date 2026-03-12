use crate::models::{PrintResult, TableInput};

#[tauri::command]
pub fn build_printable_report(input: TableInput, title: String) -> Result<PrintResult, String> {
    crate::features::print::build_report(input, title)
}
