# Excel Utils

Excel toolbox built with Tauri 2, TypeScript, and Rust.

## Quick Start

- `npm run dev`: start the Vite frontend
- `npm run tauri dev`: start the Tauri desktop app
- `npm run build`: build the frontend assets
- `npm run tauri build`: build the desktop app

## Documentation

- [Tool Overview](./docs/tool-overview.md): current features, user workflow, and where each feature lives in the codebase
- [Testing Guide](./docs/testing-guide.md): test directory structure, case coverage, generated fixtures, and how to view results

## Source Map

- Frontend UI and event wiring: `src/main.ts`
- Rust command layer and business logic: `src-tauri/src/lib.rs`
- Rust tests: `src-tauri/src/tests/`
