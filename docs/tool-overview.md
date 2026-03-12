# Tool Overview

This document is for maintainers and task runners. It explains what the current tool can do, which source files implement each capability, and where to look first before modifying behavior.

## Architecture

The project currently uses a simple two-layer structure:

- `src/main.ts`
  Responsible for the desktop UI, button bindings, form state, table rendering, rule-chain interactions, and calls into Rust through `invoke(...)`.
- `src-tauri/src/lib.rs`
  Responsible for all spreadsheet parsing, cleaning transforms, batch processing, file import/export, financial calculations, and printable report assembly.

In practice, the Rust layer is the feature source of truth. The frontend mostly collects input, calls a Rust command, and renders the returned result.

## Current Features

### 1. Workbook import and preview

Purpose:
- Open local `.xlsx`, `.xlsm`, `.xls`, and `.csv` files
- Inspect workbook metadata and sheet list
- Load a selected sheet into the cleaning area

Frontend entry:
- `src/main.ts`
  Key handlers: `openWorkbook`, `loadSheet`, `refreshPreview`

Rust implementation:
- `src-tauri/src/lib.rs`
  Commands: `inspect_workbook`, `load_sheet_table`, `preview_input_table`
  Internal helpers: `read_source`, `read_csv_rows`, `rows_to_table`, `parse_table`

### 2. Data cleaning

Purpose:
- Parse pasted table text
- Apply single-column transforms
- Apply a configurable rule chain
- Deduplicate rows
- Split a column into multiple columns
- Merge multiple columns into one
- Copy generated CSV

Frontend entry:
- `src/main.ts`
  Key handlers: `applyColumnRule`, `applyRuleChain`, `dedupeRows`, `splitColumn`, `mergeColumns`, `copyCsv`
  UI helpers: `refreshColumnControls`, `refreshBatchRulePreview`, `renderRuleChainList`

Rust implementation:
- `src-tauri/src/lib.rs`
  Commands: `trim_cells`, `change_case`, `fill_empty_cells`, `format_numeric_column`, `dedupe_rows`, `split_column`, `merge_columns`
  Internal helpers: `transform_single_column`, `apply_rule_chain_to_table`, `apply_rule_to_cell`, `format_number_cell`, `build_clean_result`

Current rule types:
- `trim`
- `uppercase`
- `lowercase`
- `fill-empty`
- `format-number`

### 3. Batch processing

Purpose:
- Reuse the current rule or rule chain
- Match a column by column name across multiple files
- Process each file's first worksheet
- Export cleaned output to a selected directory

Frontend entry:
- `src/main.ts`
  Key handlers: `pickBatchFiles`, `pickBatchOutputDir`, `runBatch`

Rust implementation:
- `src-tauri/src/lib.rs`
  Command: `batch_apply_column_rule`
  Internal helpers: `batch_process_single_file`, `apply_rule_chain_to_table`, `describe_batch_rule`, `rule_summary`

Current behavior notes:
- Batch processing requires a known column name from the current table context
- Matching is done by exact column name
- Each file defaults to its first worksheet
- Export format follows the input type: CSV stays CSV, workbook stays XLSX

### 4. Export

Purpose:
- Export the current table to `.csv` or `.xlsx`

Frontend entry:
- `src/main.ts`
  Key handler: `exportCurrentTable`

Rust implementation:
- `src-tauri/src/lib.rs`
  Command: `export_table`
  Internal helpers: `export_csv`, `export_xlsx`, `normalize_rows`, `pad_rows`

### 5. Financial modeling

Purpose:
- Compute periodic loan payment
- Generate loan amortization schedule
- Compute NPV
- Generate NPV sensitivity table
- Compute IRR
- Push generated finance tables back into the cleaning area

Frontend entry:
- `src/main.ts`
  Key handlers: `calculateLoan`, `generateSchedule`, `calculateNpv`, `generateSensitivity`, `calculateIrr`, `useFinanceTable`

Rust implementation:
- `src-tauri/src/lib.rs`
  Commands: `loan_payment`, `loan_amortization_schedule`, `net_present_value`, `npv_sensitivity_table`, `internal_rate_of_return`
  Internal helpers: `validate_loan_request`, `periodic_payment`, `compute_npv`, `npv_and_derivative`, `format_decimal`

### 6. Print preview

Purpose:
- Build a print-friendly report from the current text table
- Limit preview rows for printing

Frontend entry:
- `src/main.ts`
  Key handlers: `previewPrint`, `printNow`

Rust implementation:
- `src-tauri/src/lib.rs`
  Command: `build_printable_report`

Current behavior notes:
- The Rust layer currently returns the first 20 rows for preview
- `generatedAt` is currently a fixed descriptive string, not a real timestamp

## Where To Change Things

If a task asks for UI changes only:
- Start with `src/main.ts`
- Check whether the Rust response shape already supports the UI change

If a task asks for new behavior or data rules:
- Start with `src-tauri/src/lib.rs`
- Then wire the new command or response fields in `src/main.ts`

If a task asks for batch behavior, import/export, or file compatibility:
- Start with `src-tauri/src/lib.rs`
  The file-reading and export path lives there

If a task asks for confidence before editing:
- Read `docs/testing-guide.md`
  That file lists the test coverage and where each behavior is already exercised
