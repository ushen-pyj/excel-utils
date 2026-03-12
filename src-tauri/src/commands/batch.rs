use crate::models::{BatchProcessResult, BatchRule};

#[tauri::command]
pub fn batch_apply_column_rule(
    paths: Vec<String>,
    output_dir: String,
    column_name: String,
    rules: Vec<BatchRule>,
    has_header: bool,
) -> Result<BatchProcessResult, String> {
    crate::features::batch::process_batch(paths, output_dir, column_name, rules, has_header)
}
