use crate::common::table::parse_table;
use crate::models::{CleanResult, TableInput};

#[tauri::command]
pub fn preview_input_table(input: TableInput) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    Ok(crate::common::table::build_clean_result(
        table.columns.clone(),
        table.rows.clone(),
        vec![
            format!(
                "Parsed {} rows and {} columns",
                table.rows.len(),
                table.columns.len()
            ),
            "Current preview comes from the text input area".to_string(),
        ],
    ))
}

#[tauri::command]
pub fn trim_cells(input: TableInput, column_index: usize) -> Result<CleanResult, String> {
    crate::features::cleaning::transform_single_column(
        input,
        column_index,
        |value| value.trim().to_string(),
        |column| vec![format!("Trimmed whitespace in column {column}")],
    )
}

#[tauri::command]
pub fn change_case(
    input: TableInput,
    column_index: usize,
    mode: String,
) -> Result<CleanResult, String> {
    let normalized_mode = mode.to_lowercase();
    crate::features::cleaning::transform_single_column(
        input,
        column_index,
        |value| match normalized_mode.as_str() {
            "uppercase" => value.to_uppercase(),
            "lowercase" => value.to_lowercase(),
            _ => value.to_string(),
        },
        |column| vec![format!("Applied {normalized_mode} to column {column}")],
    )
}

#[tauri::command]
pub fn fill_empty_cells(
    input: TableInput,
    column_index: usize,
    fill_value: String,
) -> Result<CleanResult, String> {
    crate::features::cleaning::transform_single_column(
        input,
        column_index,
        |value| {
            if value.trim().is_empty() {
                fill_value.clone()
            } else {
                value.to_string()
            }
        },
        |column| vec![
            format!("Filled empty cells in column {column}"),
            format!("Fill value: {fill_value}"),
        ],
    )
}

#[tauri::command]
pub fn format_numeric_column(
    input: TableInput,
    column_index: usize,
    decimals: usize,
) -> Result<CleanResult, String> {
    crate::features::cleaning::transform_single_column(
        input,
        column_index,
        |value| crate::common::formatting::format_number_cell(value, decimals),
        |column| vec![
            format!("Formatted numeric values in column {column}"),
            format!("Decimals: {decimals}"),
        ],
    )
}

#[tauri::command]
pub fn dedupe_rows(
    input: TableInput,
    column_index: Option<usize>,
) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    crate::features::cleaning::dedupe_table(table, column_index)
}

#[tauri::command]
pub fn split_column(
    input: TableInput,
    column_index: usize,
    split_by: String,
) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    crate::features::cleaning::split_table_column(table, column_index, &split_by)
}

#[tauri::command]
pub fn merge_columns(
    input: TableInput,
    column_indices: Vec<usize>,
    join_with: String,
    new_column_name: String,
) -> Result<CleanResult, String> {
    let table = parse_table(input)?;
    crate::features::cleaning::merge_table_columns(table, column_indices, &join_with, new_column_name)
}
