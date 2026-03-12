# Testing Guide

This document is for maintainers and task runners. It explains how the current test suite is organized, which behaviors it covers, how test data is generated, and where to view test results after a run.

## Test Entry

The Rust test suite is wired from:
- `src-tauri/src/lib.rs`
  `#[cfg(test)] mod tests;`
- `src-tauri/src/tests/mod.rs`
  Central module list for all feature-specific test files

## Test Directory Structure

- `src-tauri/src/tests/helpers.rs`
  Shared test helpers, generated table builders, temporary workspace management, CSV/XLSX fixture generation, and common rule builders
- `src-tauri/src/tests/cleaning.rs`
  Data cleaning and parsing tests
- `src-tauri/src/tests/workbook.rs`
  Workbook inspection, sheet loading, export, and batch-processing tests
- `src-tauri/src/tests/finance.rs`
  Financial calculation correctness and invalid-input tests
- `src-tauri/src/tests/print.rs`
  Printable report structure tests
- `src-tauri/src/tests/performance.rs`
  Performance tests using generated large tables and large CSV files

## What Is Covered

### cleaning.rs

Covers:
- text preview parsing
- trim rule
- uppercase/lowercase rule
- empty-cell fill rule
- numeric formatting rule
- multi-step rule chain execution order
- full-row dedupe
- single-column dedupe
- split-column behavior
- merge-column behavior
- printable preview row limit behavior

### workbook.rs

Covers:
- workbook inspection for CSV and XLSX
- sheet loading with row limit
- CSV export
- XLSX export
- batch processing success path
- batch processing failure reporting when a column is missing
- export and re-import round trip for CSV

### finance.rs

Covers:
- PMT correctness
- amortization schedule structure and terminal balance
- NPV correctness
- NPV sensitivity table generation
- IRR convergence for a standard cash-flow series
- invalid loan / NPV / IRR input handling

### print.rs

Covers:
- printable report title
- report columns and row content
- generated summary payload
- preview row payload shape

### performance.rs

Covers:
- previewing a large generated table
- batch processing a large generated CSV file

Important:
- Performance tests are marked `#[ignore]`
- They do not run during normal `cargo test`
- Run them explicitly when needed

## How Test Data Is Generated

The suite intentionally avoids relying on manually maintained fixture files.

Generated at runtime:
- temporary test folders
- CSV files
- XLSX files
- large pasted-table strings
- large batch-processing input files

This behavior is centralized in:
- `src-tauri/src/tests/helpers.rs`

Why this matters:
- fewer stale fixture files
- easier to add new cases close to the tested behavior
- test runs remain self-contained

## How To Run Tests

Run the normal suite:

```powershell
cd src-tauri
cargo test
```

Run the performance suite:

```powershell
cd src-tauri
cargo test -- --ignored
```

## Where To View Test Results

Current behavior:
- test results are shown directly in the task terminal output when `cargo test` runs
- the repository does not currently persist test output to a file by default

When Codex or another task runner executes tests, the first place to check is:
- the thread terminal / command output for that task

Expected summary for the current suite at the time this document was written:
- normal run: `23 passed, 0 failed, 2 ignored`
- ignored tests: 2 performance cases available for explicit execution

If you want a file artifact locally, run:

```powershell
cd src-tauri
cargo test *>&1 | Tee-Object ..\test-results.txt
```

That writes a reusable text report to:
- `test-results.txt` at the project root

## How To Extend The Suite

If you add a new Rust command in `src-tauri/src/lib.rs`:
- add tests in the feature file that matches the behavior
- if no feature file fits, add a new one under `src-tauri/src/tests/`
- register the new module in `src-tauri/src/tests/mod.rs`

If you add new generated fixture patterns:
- put the builders in `src-tauri/src/tests/helpers.rs`
- keep feature tests focused on assertions, not fixture plumbing

If you change current behavior intentionally:
- update the related test first or immediately after implementation
- update `docs/tool-overview.md` when the externally visible capability changes
