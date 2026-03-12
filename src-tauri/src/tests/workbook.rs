use super::helpers::{batch_rule, write_csv, write_xlsx, TestWorkspace};
use crate::{batch_apply_column_rule, export_table, inspect_workbook, load_sheet_table};
use std::fs;

#[test]
fn inspect_workbook_supports_csv_and_xlsx() {
    let workspace = TestWorkspace::new("inspect-workbook");
    let csv_path = workspace.file("staff.csv");
    let xlsx_path = workspace.file("staff.xlsx");

    write_csv(&csv_path, &[
        vec!["name", "dept"],
        vec!["Alice", "Sales"],
        vec!["Bob", "Finance"],
    ]);
    write_xlsx(
        &xlsx_path,
        &[
            ("Sheet1", vec![vec!["name", "dept"], vec!["Carol", "Marketing"]]),
            ("Sheet2", vec![vec!["city", "region"], vec!["Shanghai", "East"]]),
        ],
    );

    let csv_info = inspect_workbook(csv_path.to_string_lossy().to_string()).expect("inspect csv");
    let xlsx_info = inspect_workbook(xlsx_path.to_string_lossy().to_string()).expect("inspect xlsx");

    assert_eq!(csv_info.kind, "csv");
    assert_eq!(csv_info.sheets.len(), 1);
    assert_eq!(xlsx_info.sheets.len(), 2);
    assert_eq!(xlsx_info.sheets[1].name, "Sheet2");
}

#[test]
fn load_sheet_table_reads_selected_sheet_and_applies_limit() {
    let workspace = TestWorkspace::new("load-sheet");
    let xlsx_path = workspace.file("report.xlsx");

    write_xlsx(
        &xlsx_path,
        &[(
            "Data",
            vec![
                vec!["name", "dept", "amount"],
                vec!["Alice", "Sales", "100"],
                vec!["Bob", "Finance", "200"],
                vec!["Carol", "Marketing", "300"],
            ],
        )],
    );

    let result = load_sheet_table(
        xlsx_path.to_string_lossy().to_string(),
        "Data".to_string(),
        true,
        2,
    )
    .expect("load sheet");

    assert_eq!(result.columns, vec!["name", "dept", "amount"]);
    assert_eq!(result.rows.len(), 2);
    assert!(result.summary.iter().any(|item| item.contains("3 total rows, 2 preview rows")));
}

#[test]
fn export_table_writes_csv_and_xlsx_files() {
    let workspace = TestWorkspace::new("export-table");
    let csv_path = workspace.file("cleaned.csv");
    let xlsx_path = workspace.file("cleaned.xlsx");
    let columns = vec!["name".to_string(), "dept".to_string()];
    let rows = vec![vec!["Alice".to_string(), "Sales".to_string()]];

    let csv_result = export_table(
        csv_path.to_string_lossy().to_string(),
        "csv".to_string(),
        "CSV".to_string(),
        columns.clone(),
        rows.clone(),
    )
    .expect("export csv");
    let xlsx_result = export_table(
        xlsx_path.to_string_lossy().to_string(),
        "xlsx".to_string(),
        "SheetA".to_string(),
        columns,
        rows,
    )
    .expect("export xlsx");

    assert!(csv_path.exists());
    assert!(xlsx_path.exists());
    assert_eq!(csv_result.format, "csv");
    assert_eq!(xlsx_result.format, "xlsx");
    assert!(fs::read_to_string(&csv_path).expect("read csv").contains("Alice,Sales"));
}

#[test]
fn batch_apply_column_rule_processes_multiple_files() {
    let workspace = TestWorkspace::new("batch-success");
    let output_dir = workspace.file("out");
    fs::create_dir_all(&output_dir).expect("create output dir");

    let first = workspace.file("first.csv");
    let second = workspace.file("second.csv");
    write_csv(&first, &[
        vec!["name", "dept"],
        vec![" Alice ", "Sales"],
        vec![" Bob ", "Finance"],
    ]);
    write_csv(&second, &[
        vec!["name", "dept"],
        vec![" Carol ", "Marketing"],
        vec![" Dave ", "Legal"],
    ]);

    let result = batch_apply_column_rule(
        vec![
            first.to_string_lossy().to_string(),
            second.to_string_lossy().to_string(),
        ],
        output_dir.to_string_lossy().to_string(),
        "name".to_string(),
        vec![batch_rule("trim", "", 0)],
        true,
    )
    .expect("batch apply should succeed");

    assert_eq!(result.processed, 2);
    assert_eq!(result.failed, 0);
    let exported = fs::read_to_string(output_dir.join("first-cleaned.csv")).expect("read batch csv");
    assert!(exported.contains("Alice,Sales"));
}

#[test]
fn batch_apply_column_rule_reports_missing_column_failures() {
    let workspace = TestWorkspace::new("batch-failure");
    let output_dir = workspace.file("out");
    fs::create_dir_all(&output_dir).expect("create output dir");

    let source = workspace.file("missing.csv");
    write_csv(&source, &[
        vec!["name", "dept"],
        vec!["Alice", "Sales"],
    ]);

    let result = batch_apply_column_rule(
        vec![source.to_string_lossy().to_string()],
        output_dir.to_string_lossy().to_string(),
        "amount".to_string(),
        vec![batch_rule("trim", "", 0)],
        true,
    )
    .expect("batch apply should return result object");

    assert_eq!(result.processed, 0);
    assert_eq!(result.failed, 1);
    assert!(result.results[0].message.contains("Column 'amount' not found"));
}

#[test]
fn exported_csv_can_be_previewed_again() {
    let workspace = TestWorkspace::new("reimport-export");
    let csv_path = workspace.file("roundtrip.csv");
    export_table(
        csv_path.to_string_lossy().to_string(),
        "csv".to_string(),
        "CSV".to_string(),
        vec!["name".to_string(), "amount".to_string()],
        vec![vec!["Alice".to_string(), "100.50".to_string()]],
    )
    .expect("export csv");

    let loaded = load_sheet_table(
        csv_path.to_string_lossy().to_string(),
        "CSV".to_string(),
        true,
        10,
    )
    .expect("load exported csv");

    assert_eq!(loaded.columns, vec!["name", "amount"]);
    assert_eq!(loaded.rows[0], vec!["Alice", "100.50"]);
}
