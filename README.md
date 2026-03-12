# Excel Utils

Excel toolbox built with Tauri 2, Next.js, Tailwind CSS, TypeScript, and Rust.

## Quick Start

- `npm run dev`: start the Next.js frontend on `http://127.0.0.1:1420`
- `npm run tauri dev`: start the Tauri desktop app
- `npm run build`: build the static frontend assets for Tauri
- `npm run tauri build`: build the desktop app

## Documentation

- [Tool Overview](./docs/tool-overview.md): current features, user workflow, and where each feature lives in the codebase
- [Testing Guide](./docs/testing-guide.md): test directory structure, case coverage, generated fixtures, and how to view results

## Source Map

- Frontend UI and event wiring: `src/app/page.tsx`
- Rust command layer and business logic: `src-tauri/src/lib.rs`
- Rust tests: `src-tauri/src/tests/`
