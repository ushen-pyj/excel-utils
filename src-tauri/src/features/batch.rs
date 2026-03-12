use std::path::{Path, PathBuf};

use crate::features::cleaning::{apply_rule_chain_to_table, describe_batch_rule};
use crate::features::workbook::{export_dataset, read_source};
use crate::models::{BatchFileResult, BatchProcessResult, BatchRule};

pub fn process_batch(
    paths: Vec<String>,
    output_dir: String,
    column_name: String,
    rules: Vec<BatchRule>,
    has_header: bool,
) -> Result<BatchProcessResult, String> {
    if paths.is_empty() {
        return Err("Please provide at least one input file".to_string());
    }
    if column_name.trim().is_empty() {
        return Err("Column name is required for batch processing".to_string());
    }
    if rules.is_empty() {
        return Err("Please configure at least one batch rule".to_string());
    }

    let mut results = Vec::new();
    let mut processed = 0;
    let mut failed = 0;

    for path in paths {
        match process_single_file(&path, &output_dir, &column_name, &rules, has_header) {
            Ok(result) => {
                processed += 1;
                results.push(result);
            }
            Err(error) => {
                failed += 1;
                results.push(BatchFileResult {
                    input_path: path,
                    output_path: String::new(),
                    format: String::new(),
                    row_count: 0,
                    status: "failed".to_string(),
                    message: error,
                });
            }
        }
    }

    Ok(BatchProcessResult {
        processed,
        failed,
        results,
    })
}

fn process_single_file(
    path: &str,
    output_dir: &str,
    column_name: &str,
    rules: &[BatchRule],
    has_header: bool,
) -> Result<BatchFileResult, String> {
    let source = read_source(path, None)?;
    let parsed = crate::common::table::rows_to_table(source.rows, has_header)?;
    let column_index = parsed
        .columns
        .iter()
        .position(|column| column == column_name)
        .ok_or_else(|| format!("Column '{column_name}' not found"))?;
    let transformed = apply_rule_chain_to_table(parsed, column_index, rules)?;

    let input_path = Path::new(path);
    let stem = input_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("output");
    let extension = if source.kind == "csv" { "csv" } else { "xlsx" };
    let output_path = PathBuf::from(output_dir).join(format!("{stem}-cleaned.{extension}"));
    let output_string = output_path.to_string_lossy().to_string();

    export_dataset(
        output_string.clone(),
        extension.to_string(),
        source.active_sheet.clone(),
        transformed.columns.clone(),
        transformed.rows.clone(),
    )?;

    let chain_label = rules
        .iter()
        .map(describe_batch_rule)
        .collect::<Vec<_>>()
        .join(" -> ");

    Ok(BatchFileResult {
        input_path: path.to_string(),
        output_path: output_string,
        format: extension.to_string(),
        row_count: transformed.rows.len(),
        status: "processed".to_string(),
        message: format!("Applied {chain_label} to column {column_name}"),
    })
}
