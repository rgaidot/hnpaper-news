import fs from "node:fs";
import path from "node:path";

// Define the interface for the audio index data
export interface AudioIndexData {
  [slug: string]: {
    size: number;
    hash?: string;
    generatedAt?: number;
  };
}

let audioIndex: AudioIndexData | null = null;

export function getAudioIndex(): AudioIndexData {
  if (audioIndex) return audioIndex;
  
  try {
    const indexPath = path.join(process.cwd(), "data", "audio-index.json");
    if (fs.existsSync(indexPath)) {
      const data = fs.readFileSync(indexPath, "utf-8");
      audioIndex = JSON.parse(data);
    } else {
      audioIndex = {};
    }
  } catch (e) {
    audioIndex = {};
  }
  return audioIndex;
}

export function getAudioUrl(siteUrl: string | URL, slug: string): string {
  // Use public R2 URL from env vars (either Vite/Astro style or standard process.env)
  const baseUrl = import.meta.env?.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL || siteUrl;
  const base = baseUrl.toString().replace(/\/$/, "");
  return withAudioVersion(`${base}/audio/${slug}.mp3`, slug);
}

// Cache-busting version: changes on every (re)generation, falls back to the content hash
export function getAudioVersion(slug: string): string {
  const entry = getAudioIndex()[slug];
  return entry?.generatedAt?.toString() ?? entry?.hash ?? "";
}

export function withAudioVersion(url: string, slug: string): string {
  const version = getAudioVersion(slug);
  return version ? `${url}?v=${version}` : url;
}

export function hasAudio(slug: string): boolean {
  const index = getAudioIndex();
  return !!index[slug];
}

export function getAudioSize(slug: string): number {
  const index = getAudioIndex();
  return index[slug]?.size || 0;
}
