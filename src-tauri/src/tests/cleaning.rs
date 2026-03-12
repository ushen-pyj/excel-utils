use super::helpers::{batch_rule, sample_people_table, table_input};
use crate::{
    apply_rule_chain_to_table, build_printable_report, change_case, dedupe_rows,
    fill_empty_cells, format_numeric_column, merge_columns, preview_input_table,
    rows_to_table, split_column, trim_cells,
};

#[test]
fn preview_input_table_parses_header_and_rows() {
    let result = preview_input_table(sample_people_table()).expect("preview should succeed");

    assert_eq!(result.columns, vec!["name", "dept", "amount", "code"]);
    assert_eq!(result.rows.len(), 3);
    assert_eq!(result.rows[0][0], " Alice");
    assert!(result.summary.iter().any(|item| item.contains("Parsed 3 rows and 4 columns")));
}

#[test]
fn trim_cells_cleans_target_column() {
    let result = trim_cells(sample_people_table(), 0).expect("trim should succeed");

    assert_eq!(result.rows[0][0], "Alice");
    assert_eq!(result.rows[1][0], "Bob");
    assert!(result.summary.iter().any(|item| item.contains("Trimmed whitespace")));
}

#[test]
fn change_case_supports_uppercase_and_lowercase() {
    let upper = change_case(sample_people_table(), 1, "uppercase".to_string())
        .expect("uppercase should succeed");
    let lower = change_case(sample_people_table(), 1, "lowercase".to_string())
        .expect("lowercase should succeed");

    assert_eq!(upper.rows[0][1], "SALES");
    assert_eq!(lower.rows[1][1], "hr");
}

#[test]
fn fill_empty_cells_replaces_blank_values() {
    let result = fill_empty_cells(sample_people_table(), 2, "0.00".to_string())
        .expect("fill empty should succeed");

    assert_eq!(result.rows[1][2], "0.00");
    assert!(result.summary.iter().any(|item| item.contains("Fill value: 0.00")));
}

#[test]
fn format_numeric_column_formats_numbers_without_touching_text() {
    let result = format_numeric_column(sample_people_table(), 2, 1)
        .expect("format numeric should succeed");

    assert_eq!(result.rows[0][2], "12.3");
    assert_eq!(result.rows[1][2], "");
}

#[test]
fn apply_rule_chain_runs_in_order() {
    let parsed = rows_to_table(
        vec![
            vec!["name".to_string(), "amount".to_string()],
            vec![" Alice ".to_string(), "12.345".to_string()],
            vec![" ".to_string(), "8".to_string()],
        ],
        true,
    )
    .expect("table parse should succeed");
    let rules = vec![batch_rule("trim", "", 0), batch_rule("fill-empty", "Unknown", 0)];

    let result = apply_rule_chain_to_table(parsed, 0, &rules).expect("rule chain should succeed");

    assert_eq!(result.rows[0][0], "Alice");
    assert_eq!(result.rows[1][0], "Unknown");
    assert!(result.summary.iter().any(|item| item.contains("Matched column: name")));
}

#[test]
fn dedupe_rows_supports_full_row_and_single_column() {
    let dedupe_raw = "name\tdept\nAlice\tSales\nAlice\tSales\nBob\tHR\nBob\tFinance\n";
    let full_row = dedupe_rows(table_input(dedupe_raw, "\t", true), None)
        .expect("full row dedupe should succeed");
    let by_name = dedupe_rows(table_input(dedupe_raw, "\t", true), Some(0))
        .expect("column dedupe should succeed");

    assert_eq!(full_row.rows.len(), 3);
    assert_eq!(by_name.rows.len(), 2);
    assert_eq!(by_name.rows[0][0], "Alice");
}

#[test]
fn split_column_expands_target_column() {
    let result = split_column(sample_people_table(), 3, "-".to_string())
        .expect("split should succeed");

    assert_eq!(result.columns, vec!["name", "dept", "amount", "code 1", "code 2"]);
    assert_eq!(result.rows[0][3], "a");
    assert_eq!(result.rows[0][4], "01");
}

#[test]
fn merge_columns_keeps_unselected_columns_and_appends_result() {
    let result = merge_columns(sample_people_table(), vec![0, 1], "-".to_string(), "label".to_string())
        .expect("merge should succeed");

    assert_eq!(result.columns, vec!["amount", "code", "label"]);
    assert_eq!(result.rows[0][2], "Alice-Sales");
}

#[test]
fn printable_report_limits_rows_to_twenty() {
    let raw = (0..25)
        .map(|index| format!("user{index}\t{}", index + 1))
        .collect::<Vec<_>>();
    let mut lines = vec!["name\tcount".to_string()];
    lines.extend(raw);
    let result = build_printable_report(table_input(&lines.join("\n"), "\t", true), "print test".to_string())
        .expect("print preview should succeed");

    assert_eq!(result.title, "print test");
    assert_eq!(result.rows.len(), 20);
    assert!(result.summary.iter().any(|item| item.contains("Rows: 25")));
}
