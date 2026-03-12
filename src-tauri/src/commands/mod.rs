mod batch;
mod cleaning;
mod finance;
mod print;
mod workbook;

pub use batch::batch_apply_column_rule;
pub use cleaning::{
    change_case, dedupe_rows, fill_empty_cells, format_numeric_column, merge_columns,
    preview_input_table, split_column, trim_cells,
};
pub use finance::{
    internal_rate_of_return, loan_amortization_schedule, loan_payment, net_present_value,
    npv_sensitivity_table,
};
pub use print::build_printable_report;
pub use workbook::{export_table, inspect_workbook, load_sheet_table};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            cleaning::preview_input_table,
            workbook::inspect_workbook,
            workbook::load_sheet_table,
            workbook::export_table,
            batch::batch_apply_column_rule,
            cleaning::trim_cells,
            cleaning::change_case,
            cleaning::fill_empty_cells,
            cleaning::format_numeric_column,
            cleaning::dedupe_rows,
            cleaning::split_column,
            cleaning::merge_columns,
            finance::loan_payment,
            finance::loan_amortization_schedule,
            finance::net_present_value,
            finance::npv_sensitivity_table,
            finance::internal_rate_of_return,
            print::build_printable_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
