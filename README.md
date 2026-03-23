# HNPaper News

Welcome to the **HNPaper News** repository, an automated news archive from [HNPaper](https://hnpaper-labs.gaidot.net).

## ✨ Features

- **Daily Summaries**: Automated archives of HNPaper news.
- **Audio Player (TTS)**: Integrated text-to-speech functionality to listen to articles. MP3 audio files are automatically generated for each article by the `generate-audio.ts` script, which are then used by the TTS player and for Google Cast.
- **Word-Level Highlighting**: VTT subtitles enable per-word highlighting during audio playback.
- **Google Cast Support**: Stream article audio to Google Cast devices (e.g., Google Home, Chromecast) with subtitle support.
- **Podcast Feed**: RSS feed that exposes every article with an MP3 enclosure.
- **PWA Support**: Installable as a native app on mobile and desktop devices with offline caching capabilities and full Multi-Page Application (MPA) routing support.
- **Share Section**: Click on the link icon next to any paragraph to copy a direct link to that specific section.
- **Full-Page Player**: Dedicated `/player/:slug` route with an audio visualizer.
- **Archives & Pagination**: `/news` paginated archive (12 items per page).
- **Tags & Navigation**: Support for reading and navigating articles by categories using a dedicated `/tags` route and tag clouds.
- **Newspaper Design**: A clean, serif-focused aesthetic inspired by classic print media, utilizing a dynamic Masonry layout for article sections.
- **Global Search (Pagefind)**: Integrated client-side search using Pagefind, enabling users to search articles with dynamic results, "Load More" pagination, and custom styling. The search index is automatically built and copied during the build process.

## 🚀 Technologies

- **Framework**: [Astro](https://astro.build) v5
- **Styles**: [Tailwind CSS](https://tailwindcss.com) v4
- **Package Manager**: [Bun](https://bun.sh)
- **PWA**: Vite PWA
- **Search**: [Pagefind](https://pagefind.app)
- **Deployment/Serving**: Docker (Nginx with Brotli) & GitHub Pages
- **Linting/Formatting**: [Biome](https://biomejs.dev)

## 📂 Project Structure

```text
/
├── .github/workflows # GitHub Actions for deployment and audio generation
├── data/             # Content and generated data
│   ├── audio/        # Generated audio files (mp3, vtt)
│   ├── news/         # News Markdown files (YYYY-MM-DD-HHMM.md)
│   └── audio-index.json # Generated JSON index
├── public/           # Static files (favicon, CNAME, pwa icons)
├── scripts/          # Automation scripts (audio generation, release)
├── src/
│   ├── components/   # UI Components (TTSPlayer, Search, etc.)
│   ├── content/      # Content collections config and symlinks
│   ├── layouts/      # Layouts (Layout.astro)
│   ├── pages/        # Routes (index, pagination, detail pages)
│   ├── scripts/      # Client-side scripts (TTS, Navigation)
│   ├── styles/       # Global CSS
│   └── utils/        # Shared helpers (dates, reading time, audio paths)
├── astro.config.mjs  # Astro configuration
├── makefile          # Shortcuts for build and deployment
├── nginx.conf        # Optimized Nginx configuration
├── Dockerfile        # Container configuration for production serving
└── package.json      # Dependencies and scripts
```

## 🧭 Diagrams (Overview)

### Content, audio, and site pipeline

```mermaid
flowchart TD
  A[Markdown<br/>data/news/*.md] --> B[scripts/generate-audio.ts]
  B --> C[Edge TTS<br/>node-edge-tts]
  B --> D[FFmpeg/ffprobe<br/>durations + concat]
  C --> E[data/audio/*.mp3 + *.vtt<br/>or Cloudflare R2]
  D --> E
  B --> IDX[data/audio-index.json]
  E --> F[Astro pages]
  IDX --> F
  F --> G["/news/:slug/"]
  F --> H["/player/:slug/"]
  F --> I["/podcast.xml"]
  F --> J["/news/[...page]"]
  F --> K["/tags/[tag]/[...page]"]
  F --> L["/"]
```

### Build flow with search indexing

```mermaid
flowchart TD
  A[astro build] --> B[dist/<br/>static site]
  B --> C[pagefind --site dist]
  C --> D[dist/pagefind]
  D --> E[public/pagefind]
```

### Audio Generation Flow (`generate-audio.ts`)

```mermaid
flowchart TD
  Start([Start generation]) --> ReadMD[Read Markdown files]
  ReadMD --> CheckExisting{Check existing<br/>R2 or Local?}
  CheckExisting -->|Missing| CleanText[Clean & Chunk Text]
  CheckExisting -->|Exists| Skip[Skip file]
  Skip --> Index
  CleanText --> TTS[Edge TTS: Generate audio chunks]
  TTS --> Concat[FFmpeg: Concat MP3 & create VTT]
  Concat --> Storage{Upload to R2?}
  Storage -- Yes --> R2[Upload MP3 & VTT to Cloudflare R2<br/>Remove local files]
  Storage -- No --> Local[Keep in data/audio/]
  R2 --> Index[Add to audio-index.json<br/>with file size]
  Local --> Index
```

### Automated Deployment Flow (GitHub Actions)

```mermaid
flowchart TD
  Push([Push to main/feat]) --> Checkout[Checkout code]
  Checkout --> SetupBun[Setup Bun & Install dependencies]
  SetupBun --> SetupFFmpeg[Install FFmpeg]
  SetupFFmpeg --> GenAudio["Generate Audio & Index<br/>(using R2 secrets)"]
  GenAudio --> AstroBuild["Astro Build<br/>& Pagefind Indexing"]
  AstroBuild --> UploadArtifact[Upload Artifact to GH Pages]
  UploadArtifact --> Deploy([Deploy to GitHub Pages environment])
```

## 🛠️ Installation and Local Development

Prerequisites:

- [Bun](https://bun.sh) installed.
- `ffmpeg` + `ffprobe` available in PATH (audio generation uses them).

1.  **Install dependencies**

    ```bash
    make install
    ```

2.  **Start the development server**

    ```bash
    make dev
    ```

    The site will be available at `http://localhost:4321`.

3.  **Preview the production build locally**

    To test the optimized production build (including Pagefind search, which requires a build to generate the index):

    ```bash
    make build-code
    make preview
    ```

4.  **Generate Audio Files**

    The project automatically generates `.mp3` audio files and `.vtt` subtitles for each article. This step requires an internet connection because `node-edge-tts` uses Microsoft Edge TTS voices.

    **Cloudflare R2 Storage Integration:**
    To avoid excessive storage on GitHub and speed up generation times, audio files are synced to a Cloudflare R2 bucket. Set the following environment variables (or `.env` file locally):
    - `R2_ACCOUNT_ID`: Your Cloudflare account ID.
    - `R2_ACCESS_KEY_ID`: Your R2 API access key.
    - `R2_SECRET_ACCESS_KEY`: Your R2 API secret key.
    - `R2_BUCKET_NAME`: The name of your R2 bucket.
    - `PUBLIC_R2_URL`: The public domain of your R2 bucket (e.g., `https://pub-xxxxxx.r2.dev`).
    - `PUBLIC_POSTHOG_KEY`: Your PostHog project API key for client-side analytics.
    - `PUBLIC_POSTHOG_HOST`: Your PostHog ingestion host (e.g. `https://eu.i.posthog.com` or your self-hosted domain).

    If these credentials are provided, the script will fetch missing audio from R2, generate it if necessary, upload it, and then delete the local file. It will output an index file at `data/audio-index.json`. If credentials are omitted, it will fall back to saving files directly in the `data/audio/` directory.

    ```bash
    make generate-audio
    ```

    To force regeneration of all audio files (even if they already exist):

    ```bash
    bun run scripts/generate-audio.ts --force
    ```

5.  **Linting & Formatting**

    The project uses Biome for linting and formatting.

    ```bash
    # Lint files
    make lint

    # Format files
    make format

    # Check and fix issues
    make check-fix
    ```

## 📊 Analytics

Client-side analytics are sent to PostHog only when both `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST` are defined.

### Search events

- `search_performed`: Triggered after a Pagefind query completes. Properties: `query`, `results_count`.
- `search_result_clicked`: Triggered when a user clicks a search result. Properties: `query`, `result_index`, `visible_results`, `total_results`, `target_url`.
- `search_load_more_clicked`: Triggered when the user expands the visible search result list. Properties: `query`, `visible_results`, `total_results`.
- `search_cleared`: Triggered when the search field is cleared with the clear button. Properties: `query`, `results_count`.

### Audio and player events

- `tts_play_started`: Triggered when article playback starts. Properties: `slug`, `title`, `player_surface`, `playback_mode`.
- `tts_paused`: Triggered when playback is paused. Properties: `slug`, `title`, `player_surface`, plus `current_time_seconds` or `current_char_index` depending on playback mode.
- `tts_resumed`: Triggered when playback resumes. Properties: `slug`, `title`, `player_surface`, plus `current_time_seconds` or `current_char_index`.
- `tts_stopped`: Triggered when playback is stopped before completion. Properties: `slug`, `title`, `player_surface`.
- `tts_playback_completed`: Triggered when audio reaches the end. Properties: `slug`, `title`, `player_surface`, `duration_seconds`.
- `tts_speed_changed`: Triggered when playback speed changes. Properties: `slug`, `title`, `player_surface`, `playback_mode`, `speed`.
- `tts_seeked_from_text`: Triggered when playback jumps from a clicked word in the article. Properties: `slug`, `title`, `player_surface`, `selected_word`, plus `target_time_seconds` or `current_char_index`.
- `tts_open_full_player_clicked`: Triggered when the article player opens the dedicated `/player/:slug` page. Properties: `slug`, `title`, `source`.
- `tts_cast_requested`: Triggered when the cast action is requested. Properties: `slug`, `title`, `player_surface`.
- `tts_cast_connected`: Triggered after a cast session is connected. Properties: `slug`, `title`, `player_surface`.

### Shared analytics properties

- `slug`: Article identifier used in URLs.
- `title`: Article title.
- `player_surface`: Playback UI origin, either `article_player` or `full_player`.
- `playback_mode`: Active playback transport, either `audio`, `cast`, or `speech_synthesis`.

### Recommended dashboards

- Search usage: track `search_performed` over time, average `results_count`, and top `query` values.
- Search effectiveness: build a funnel from `search_performed` to `search_result_clicked` and segment by `query`.
- Audio engagement: compare `tts_play_started`, `tts_paused`, `tts_resumed`, `tts_stopped`, and `tts_playback_completed`.
- Playback completion by article: break down `tts_playback_completed` by `slug` and compare it to `tts_play_started`.
- Player surface adoption: split `tts_play_started` by `player_surface` to see whether users listen more from article pages or the dedicated player.
- Speed preferences: chart `tts_speed_changed` by `speed` to understand listening habits.
- Cast usage: monitor `tts_cast_requested` and `tts_cast_connected` as a simple cast conversion funnel.

### Dashboard definitions

#### Dashboard 1: Search

Name: `Search Performance`

Widgets to create:

- `Searches over time`
  - Event: `search_performed`
  - Display: line chart
  - Interval: daily
- `Top queries`
  - Event: `search_performed`
  - Breakdown: `query`
  - Display: bar chart
  - Limit: 20
- `Searches with zero results`
  - Event: `search_performed`
  - Filter: `results_count = 0`
  - Display: single value
- `Search result click-through`
  - Insight type: funnel
  - Step 1: `search_performed`
  - Step 2: `search_result_clicked`
  - Breakdown optional: `query`

#### Dashboard 2: Audio

Name: `Audio Engagement`

Widgets to create:

- `Starts vs completions`
  - Events: `tts_play_started`, `tts_playback_completed`
  - Display: line or bar
  - Interval: daily
- `Completion rate funnel`
  - Funnel:
    - Step 1: `tts_play_started`
    - Step 2: `tts_playback_completed`
  - Breakdown: `player_surface`
- `Pause / resume / stop`
  - Events: `tts_paused`, `tts_resumed`, `tts_stopped`
  - Display: stacked bar
- `Top listened articles`
  - Event: `tts_play_started`
  - Breakdown: `slug`
  - Display: bar chart

#### Dashboard 3: Player & Cast

Name: `Player Behavior`

Widgets to create:

- `Article player vs full player`
  - Event: `tts_play_started`
  - Breakdown: `player_surface`
  - Display: pie or bar
- `Playback mode usage`
  - Event: `tts_play_started`
  - Breakdown: `playback_mode`
  - Display: bar
- `Speed preferences`
  - Event: `tts_speed_changed`
  - Breakdown: `speed`
  - Display: bar
- `Cast conversion`
  - Funnel:
    - Step 1: `tts_cast_requested`
    - Step 2: `tts_cast_connected`

## 📦 Build & Deployment

### GitHub Pages (Automated)

Deployment is automated via **GitHub Actions**.

- On every push to the `main` branch, the workflow `.github/workflows/deploy.yml` runs.
- It automatically installs `ffmpeg`, fetches missing audio from Cloudflare R2 (or generates it), builds the Astro site with Pagefind indexing, and deploys everything to the GitHub Pages environment.

### Docker / Podman & Nginx (Manual/Private)

The project includes a `Dockerfile` and an optimized `nginx.conf` for serving the static site with Brotli compression and proper security headers. It uses `podman` in the provided `makefile`.

1.  **Build the production image**
    This command will pull the latest code, build the Astro site, and build the container image using Podman.
    ```bash
    make build
    ```

2.  **Publish to a private registry**
    The makefile includes commands to tag and push the image to a private registry.
    ```bash
    # Publish and tag the image
    make publish

    # Push to the private registry
    make push
    ```

## 🧰 Components, Utils & Scripts

### `src/components/`

- `ArticleFloatingNav.astro`: A floating navigation bar for articles (next/prev section, speed control) that syncs with TTS playback.
- `AudioPlayer.astro`: A persistent audio player component for listening to articles.
- `Search.astro`: A client-side search interface powered by Pagefind with dynamic results and pagination.
- `TagCloud.astro` / `TagList.astro`: Components for displaying categorized tags associated with articles.
- `TTSPlayer.astro`: The primary UI controls for the Text-to-Speech functionality within articles.
- `VoiceVisualizer.astro`: An audio visualizer used on the dedicated player route (`/player/:slug`).

### `src/layouts/`

- `Layout.astro`: The primary layout wrapper for the website, including the common `<head>` metadata, navigation, PWA, and global search.
- `LayoutPlayer.astro`: A specialized layout used exclusively for the full-screen audio player route without the standard navigation elements.

### `scripts/generate-audio.ts`

This script automates the creation of MP3 audio files and VTT subtitles from the Markdown articles. The complete flow is as follows:
1.  **Parse Markdown**: Reads articles from `data/news/` and extracts the frontmatter title and body content.
2.  **Clean & Chunk**: Strips Markdown formatting, links, and specific tags to create clean plain text. Splits the text into manageable chunks (max 2000 chars) to respect TTS API limits.
3.  **Generate Audio (Edge TTS)**: Calls the Microsoft Edge TTS API (`node-edge-tts`) to generate audio segments and word-level timestamp JSONs.
4.  **Concatenate & Convert**: Uses `ffmpeg` and `ffprobe` to measure durations, concatenate audio chunks into a single `.mp3` file, and convert the JSON timestamps into a valid WebVTT (`.vtt`) subtitle format.
5.  **Cloud Storage (Optional)**: If Cloudflare R2 credentials are provided, uploads the `.mp3` and `.vtt` files to the bucket and removes them locally.
6.  **Index Generation**: Updates `data/audio-index.json` with the final file sizes, which is used by the site to display audio capabilities and populate RSS feed enclosures.

### `scripts/release.sh`

Simple tag-based release script: `./scripts/release.sh X.Y.Z`

### `src/utils/`

- `audio.ts`: Helpers for audio paths and URLs.
- `formatDate.ts`: French date formatting utilities.
- `news.ts`: Sorting and retrieval logic for news entries.
- `readingTime.ts`: Reading time calculation.
- `slugify.ts`: String slugification utility.

### `src/scripts/client/`

- `ArticleNavigation.ts`: Handles sectioning, scroll spy, and keyboard shortcuts.
- `TTSController.ts`: Manages audio playback, VTT syncing, and Google Cast integration.
- `masonry.ts`: Client-side masonry layout functionality.

## 📄 Data Format

### News Content

News items are stored in `data/news/` as Markdown files using the `YYYY-MM-DD-HHMM.md` naming convention.

**Frontmatter Schema:**

```yaml
---
title: "Actualités du 27/01/2026 à 14:00"
date: 2026-01-27T14:00:00+01:00
author: HNPaper Bot
tags: [news]
---
```

### Audio Index (`data/audio-index.json`)

When the audio generation script (`scripts/generate-audio.ts`) runs, it produces an index mapping each article's filename (without the `.md` extension) to metadata about its generated audio file (such as its `size` in bytes). This file is utilized by the Astro pages to efficiently determine if an audio version of an article is available and to expose its size for the RSS podcast feed (`/podcast.xml`).

```json
{
  "2026-01-27-1400": {
    "size": 420512
  }
}
```
