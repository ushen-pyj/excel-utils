use super::helpers::{batch_rule, generated_table, write_csv, TestWorkspace};
use crate::{batch_apply_column_rule, preview_input_table, TableInput};
use std::fs;
use std::time::{Duration, Instant};

#[test]
#[ignore = "performance test; run explicitly with cargo test -- --ignored"]
fn preview_large_generated_table_under_reasonable_time() {
    let raw = generated_table(20_000, true);
    let start = Instant::now();
    let result = preview_input_table(TableInput {
        raw,
        delimiter: "\t".to_string(),
        has_header: true,
    })
    .expect("preview large table");
    let elapsed = start.elapsed();

    assert_eq!(result.rows.len(), 20_000);
    assert!(elapsed < Duration::from_secs(3), "preview took {elapsed:?}");
}

#[test]
#[ignore = "performance test; run explicitly with cargo test -- --ignored"]
fn batch_processing_large_csv_under_reasonable_time() {
    let workspace = TestWorkspace::new("batch-perf");
    let input = workspace.file("large.csv");
    let output_dir = workspace.file("out");
    fs::create_dir_all(&output_dir).expect("create output dir");

    let mut rows = vec![vec!["name", "dept"]];
    for index in 0..15_000 {
        if index % 2 == 0 {
            rows.push(vec![" Alice ", "Sales"]);
        } else {
            rows.push(vec![" Bob ", "Finance"]);
        }
    }
    write_csv(&input, &rows);

    let start = Instant::now();
    let result = batch_apply_column_rule(
        vec![input.to_string_lossy().to_string()],
        output_dir.to_string_lossy().to_string(),
        "name".to_string(),
        vec![batch_rule("trim", "", 0)],
        true,
    )
    .expect("batch perf");
    let elapsed = start.elapsed();

    assert_eq!(result.processed, 1);
    assert!(elapsed < Duration::from_secs(5), "batch took {elapsed:?}");
}
