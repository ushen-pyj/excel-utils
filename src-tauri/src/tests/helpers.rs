use crate::{BatchRule, TableInput};
use rust_xlsxwriter::Workbook;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct TestWorkspace {
    root: PathBuf,
}

impl TestWorkspace {
    pub fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        let root = std::env::temp_dir()
            .join("excel-utils-tests")
            .join(format!("{}-{}-{}", label, std::process::id(), unique));
        fs::create_dir_all(&root).expect("create temp test directory");
        Self { root }
    }

    pub fn file(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }
}

impl Drop for TestWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

pub fn table_input(raw: &str, delimiter: &str, has_header: bool) -> TableInput {
    TableInput {
        raw: raw.to_string(),
        delimiter: delimiter.to_string(),
        has_header,
    }
}

pub fn sample_people_table() -> TableInput {
    table_input(
        "name\tdept\tamount\tcode\n Alice \tSales\t12.345\ta-01\nBob\tHR\t\tb-02\nAlice\tSales\t12.345\ta-01\n",
        "\t",
        true,
    )
}

pub fn write_csv(path: &Path, rows: &[Vec<&str>]) {
    let content = rows
        .iter()
        .map(|row| row.join(","))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(path, content).expect("write csv fixture");
}

pub fn write_xlsx(path: &Path, sheets: &[(&str, Vec<Vec<&str>>)]) {
    let mut workbook = Workbook::new();
    for (sheet_name, rows) in sheets {
        let worksheet = workbook.add_worksheet();
        worksheet.set_name(*sheet_name).expect("set sheet name");
        for (row_index, row) in rows.iter().enumerate() {
            for (column_index, value) in row.iter().enumerate() {
                worksheet
                    .write_string(row_index as u32, column_index as u16, *value)
                    .expect("write xlsx cell");
            }
        }
    }
    workbook.save(path).expect("save xlsx fixture");
}

pub fn batch_rule(rule_type: &str, fill_value: &str, decimals: usize) -> BatchRule {
    BatchRule {
        rule_type: rule_type.to_string(),
        fill_value: fill_value.to_string(),
        decimals,
    }
}

pub fn generated_table(row_count: usize, include_header: bool) -> String {
    let mut rows = Vec::with_capacity(row_count + usize::from(include_header));
    if include_header {
        rows.push("name\tdept\tamount\tcode".to_string());
    }
    for index in 0..row_count {
        rows.push(format!(
            "user{index}\tDept{}\t{}\tcode-{index}",
            index % 12,
            (index as f64) * 1.2345
        ));
    }
    rows.join("\n")
}
