# HNPaper News (Rust/Zola Migration)

This directory contains the Rust-based migration of the HNPaper News site using [Zola](https://www.getzola.org/).

## Prerequisites

*   **Zola**: Static Site Generator (Rust). Install via `cargo install zola` or download a binary.
*   **Bun**: JavaScript runtime/bundler (used for Tailwind & TypeScript compilation).

## Structure

*   `content/`: Markdown content (migrated from Astro).
*   `templates/`: HTML templates (Tera engine).
*   `static/`: Static assets (CSS, JS, images).
*   `client/`: TypeScript source code for client-side logic (TTS, Navigation).
*   `styles/`: Tailwind CSS source.
*   `scripts/`: Migration scripts.

## Usage

1.  **Install Dependencies**:
    ```bash
    bun install
    ```

2.  **Development Server**:
    Runs Tailwind, ESBuild, and Zola in watch mode (requires Zola).
    ```bash
    bun run dev
    ```

3.  **Build for Production**:
    Generates the site in `public/`.
    ```bash
    bun run build
    ```

## Notes

*   Content was migrated using `scripts/migration.js`.
*   Templates were ported to Tera syntax.
*   Client-side logic (TTS, Nav) is bundled into `static/js/main.js`.
*   Styles are processed via Tailwind CLI into `static/css/global.css`.