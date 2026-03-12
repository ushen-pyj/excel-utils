mod commands;
mod common;
mod features;
mod models;

pub use commands::{
    batch_apply_column_rule, build_printable_report, change_case, dedupe_rows, export_table,
    fill_empty_cells, format_numeric_column, inspect_workbook, internal_rate_of_return,
    load_sheet_table, loan_amortization_schedule, loan_payment, merge_columns,
    net_present_value, npv_sensitivity_table, preview_input_table, split_column, trim_cells,
};
pub use common::table::rows_to_table;
pub use features::cleaning::apply_rule_chain_to_table;
pub use models::{BatchRule, IrrRequest, LoanRequest, NpvRequest, ParsedTable, TableInput};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    commands::run();
}

#[cfg(test)]
mod tests;
