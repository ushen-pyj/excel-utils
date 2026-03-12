use crate::common::formatting::format_number_cell;
use crate::common::table::{build_clean_result, ensure_column_index, parse_table};
use crate::models::{BatchRule, CleanResult, ParsedTable, TableInput};
use std::collections::HashSet;

pub fn transform_single_column<F, S>(
    input: TableInput,
    column_index: usize,
    mut transform: F,
    summary_builder: S,
) -> Result<CleanResult, String>
where
    F: FnMut(&str) -> String,
    S: Fn(&str) -> Vec<String>,
{
    let table = parse_table(input)?;
    ensure_column_index(&table, column_index)?;
    let column_name = table.columns[column_index].clone();
    let rows = table
        .rows
        .into_iter()
        .map(|mut row| {
            if let Some(cell) = row.get_mut(column_index) {
                *cell = transform(cell);
            }
            row
        })
        .collect::<Vec<_>>();

    Ok(build_clean_result(
        table.columns,
        rows,
        summary_builder(&column_name),
    ))
}

pub fn apply_rule_chain_to_table(
    mut table: ParsedTable,
    column_index: usize,
    rules: &[BatchRule],
) -> Result<CleanResult, String> {
    ensure_column_index(&table, column_index)?;
    if rules.is_empty() {
        return Err("Unsupported batch rule".to_string());
    }

    let column_name = table.columns[column_index].clone();
    let mut summary = vec![format!("Matched column: {column_name}")];

    for rule in rules {
        summary.extend(rule_summary(&column_name, rule)?);
        table.rows = table
            .rows
            .into_iter()
            .map(|mut row| {
                if let Some(cell) = row.get_mut(column_index) {
                    *cell = apply_rule_to_cell(cell, rule);
                }
                row
            })
            .collect::<Vec<_>>();
    }

    Ok(build_clean_result(table.columns, table.rows, summary))
}

pub fn dedupe_table(table: ParsedTable, column_index: Option<usize>) -> Result<CleanResult, String> {
    if let Some(index) = column_index {
        ensure_column_index(&table, index)?;
    }

    let original_count = table.rows.len();
    let mut seen = HashSet::new();
    let mut rows = Vec::new();

    for row in table.rows {
        let key = match column_index {
            Some(index) => row.get(index).cloned().unwrap_or_default(),
            None => row.join("\u{1f}"),
        };
        if seen.insert(key) {
            rows.push(row);
        }
    }

    Ok(build_clean_result(
        table.columns,
        rows,
        vec![
            format!("{original_count} original rows, {} rows after dedupe", seen.len()),
            match column_index {
                Some(index) => format!("Dedupe key column: {index}"),
                None => "Dedupe key: full row".to_string(),
            },
        ],
    ))
}

pub fn split_table_column(
    table: ParsedTable,
    column_index: usize,
    split_by: &str,
) -> Result<CleanResult, String> {
    if split_by.is_empty() {
        return Err("Split delimiter cannot be empty".to_string());
    }
    ensure_column_index(&table, column_index)?;

    let max_segments = table
        .rows
        .iter()
        .map(|row| {
            row.get(column_index)
                .map(|cell| cell.split(split_by).count())
                .unwrap_or(1)
        })
        .max()
        .unwrap_or(1);

    let mut columns = Vec::new();
    for (idx, column) in table.columns.iter().enumerate() {
        if idx == column_index {
            for part_index in 0..max_segments {
                columns.push(format!("{} {}", column, part_index + 1));
            }
        } else {
            columns.push(column.clone());
        }
    }

    let mut rows = Vec::new();
    for row in table.rows {
        let mut new_row = Vec::new();
        for (idx, cell) in row.iter().enumerate() {
            if idx == column_index {
                let parts = cell
                    .split(split_by)
                    .map(|item| item.trim().to_string())
                    .collect::<Vec<_>>();
                for part_index in 0..max_segments {
                    new_row.push(parts.get(part_index).cloned().unwrap_or_default());
                }
            } else {
                new_row.push(cell.clone());
            }
        }
        rows.push(new_row);
    }

    Ok(build_clean_result(
        columns.clone(),
        rows,
        vec![
            format!("Split column {column_index} by '{split_by}'"),
            format!("Output columns: {}", columns.len()),
        ],
    ))
}

pub fn merge_table_columns(
    table: ParsedTable,
    column_indices: Vec<usize>,
    join_with: &str,
    new_column_name: String,
) -> Result<CleanResult, String> {
    if column_indices.is_empty() {
        return Err("Select at least one column to merge".to_string());
    }
    if column_indices.iter().any(|index| *index >= table.columns.len()) {
        return Err("One or more column indices are out of range".to_string());
    }

    let selected = column_indices.iter().copied().collect::<HashSet<_>>();
    let mut columns = Vec::new();
    for (idx, column) in table.columns.iter().enumerate() {
        if !selected.contains(&idx) {
            columns.push(column.clone());
        }
    }
    columns.push(new_column_name.clone());

    let mut rows = Vec::new();
    for row in table.rows {
        let merged = column_indices
            .iter()
            .filter_map(|index| row.get(*index))
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
            .join(join_with);

        let mut new_row = Vec::new();
        for (idx, cell) in row.iter().enumerate() {
            if !selected.contains(&idx) {
                new_row.push(cell.clone());
            }
        }
        new_row.push(merged);
        rows.push(new_row);
    }

    Ok(build_clean_result(
        columns,
        rows,
        vec![
            format!("Merged {} columns", column_indices.len()),
            format!("New column: {new_column_name}"),
        ],
    ))
}

pub fn rule_summary(column_name: &str, rule: &BatchRule) -> Result<Vec<String>, String> {
    match rule.rule_type.as_str() {
        "trim" => Ok(vec![format!("Trimmed whitespace in column {column_name}")]),
        "uppercase" | "lowercase" => {
            Ok(vec![format!("Applied {} to column {column_name}", rule.rule_type)])
        }
        "fill-empty" => Ok(vec![
            format!("Filled empty cells in column {column_name}"),
            format!("Fill value: {}", rule.fill_value),
        ]),
        "format-number" => Ok(vec![
            format!("Formatted numeric values in column {column_name}"),
            format!("Decimals: {}", rule.decimals),
        ]),
        _ => Err("Unsupported batch rule".to_string()),
    }
}

pub fn apply_rule_to_cell(cell: &str, rule: &BatchRule) -> String {
    match rule.rule_type.as_str() {
        "trim" => cell.trim().to_string(),
        "uppercase" => cell.to_uppercase(),
        "lowercase" => cell.to_lowercase(),
        "fill-empty" => {
            if cell.trim().is_empty() {
                rule.fill_value.clone()
            } else {
                cell.to_string()
            }
        }
        "format-number" => format_number_cell(cell, rule.decimals),
        _ => cell.to_string(),
    }
}

pub fn describe_batch_rule(rule: &BatchRule) -> String {
    match rule.rule_type.as_str() {
        "fill-empty" => format!("fill-empty({})", rule.fill_value),
        "format-number" => format!("format-number({})", rule.decimals),
        _ => rule.rule_type.clone(),
    }
}
