# HNPaper News

Welcome to the **HNPaper News** repository, an automated news archive from [HNPaper](https://hnpaper-labs.gaidot.net).

This project is version v2, rebuilt with **Astro** to replace the old Jekyll version. It generates a fast and lightweight static site hosted on GitHub Pages.

## ✨ Features

-   **Daily Summaries**: Automated archives of HNPaper news.
-   **Audio Player (TTS)**: Integrated text-to-speech functionality to listen to articles. MP3 audio files are automatically generated for each article by the `generate-audio.ts` script, which are then used by the TTS player and for Google Cast.
    -   **Google Cast Support**: Stream article audio to Google Cast devices (e.g., Google Home, Chromecast).
        
        ### How to Use Google Cast

        1.  **Ensure Audio is Generated**: The MP3 audio files for the articles are **automatically generated** by the `generate-audio.ts` script. Ensure this script has run (e.g., as part of the CI/CD pipeline or manually via `bun run scripts/generate-audio.ts`).

        2.  **Access Your Site (Important for Local Development)**:
            *   **Production (GitHub Pages)**: Simply go to your live site URL (e.g., `https://hnpaper-news-labs.gaidot.net`).
            *   **Local Development**: Run `bun run dev --host`. Then, open your browser and navigate to your machine's **local IP address** (e.g., `http://192.168.1.XX:4321`), NOT `localhost`. Ensure your computer and Cast device are on the same Wi-Fi network.

        3.  **Initiate Casting**:
            *   Open the article you want to listen to in Google Chrome.
            *   Click on Chrome's **"Menu"** (three vertical dots) in the top-right corner.
            *   Select **"Cast..."**.
            *   Choose your desired Google Cast device from the list.

        4.  **Playback**: The audio of the article will begin playing on your Google Cast device. Your browser will display a Cast control interface.

    -   Uses a dynamic and engaging female voice (French).
    -   Adjustable playback speed (0.75x to 7x).
    -   Interactive highlighting (karaoke style).
    -   Click on any word to start reading from there.
    -   **Shortcut**: Press `Space` to Play/Pause.
-   **PWA Support**: Installable as a native app on mobile and desktop devices with offline caching capabilities.
-   **Share Section**: Click on the link icon next to any paragraph to copy a direct link to that specific section.
-   **Newspaper Design**: A clean, serif-focused aesthetic inspired by classic print media.

-   **Global Search (Pagefind)**: Integrated client-side search using Pagefind, enabling users to search articles with dynamic results, "Load More" pagination, and custom styling. The search index is automatically built and copied during the build process.

## 🚀 Technologies

-   **Framework**: [Astro](https://astro.build) v5
-   **Styles**: [Tailwind CSS](https://tailwindcss.com) v4
-   **PWA**: Vite PWA
-   **Hosting**: GitHub Pages

## 📂 Project Structure

```text
/
├── .github/workflows # GitHub Actions for deployment
├── public/           # Static files (favicon, CNAME, pwa icons, **generated audio files** in `public/audio`)
├── src/
│   ├── components/   # UI Components (TTSPlayer, etc.)
│   ├── content/      # Content collections
│   │   └── news/     # News Markdown files (YYYY-MM-DD-HHMM.md)
│   ├── layouts/      # Layouts (Layout.astro)
│   ├── pages/        # Routes (index, pagination, detail pages)
│   ├── scripts/      # Client-side scripts (TTS, Navigation)
│   └── styles/       # Global CSS
├── astro.config.mjs  # Astro configuration
└── package.json      # Dependencies and scripts
```

## 📄 Data Format

News items are stored in `src/content/news/` as Markdown files.
**Filename convention**: `YYYY-MM-DD-HHMM.md`

### Frontmatter Schema
Each file must begin with the following YAML frontmatter:

```yaml
---
title: "Actualités du 27/01/2026 à 14:00"
date: 2026-01-27T14:00:00+01:00
author: HNPaper Bot
tags: [news]
---
```

## 🛠️ Installation and Local Development

Prerequisites: Bun installed (https://bun.sh).

1.  **Install dependencies**

    ```bash
    bun install
    ```

2.  **Start the development server**

    ```bash
    bun run dev
    ```

    The site will be available at `http://localhost:4321`.

3.  **Generate Audio Files**

    The project automatically generates `.mp3` audio files for each article, which are used by the TTS player and Google Cast.
    
    ```bash
    bun run scripts/generate-audio.ts
    ```

    To force regeneration of all audio files (even if they already exist):

    ```bash
    bun run scripts/generate-audio.ts --force
    ```

4.  **Preview the production build**

    ```bash
    bun run preview
    ```

## 📦 Deployment

Deployment is automated via **GitHub Actions**.

*   On every push to the `main` branch, the workflow `.github/workflows/deploy.yml` builds the site and deploys it to the GitHub Pages environment.
*   The workflow `.github/workflows/generate-audio.yml` automatically generates and commits audio files for new or updated articles.

