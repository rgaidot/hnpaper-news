import fs from "node:fs";
import path from "node:path";

// Define the interface for the audio index data
export interface AudioIndexData {
  [slug: string]: {
    size: number;
  };
}

let _audioIndex: AudioIndexData | null = null;

export function getAudioIndex(): AudioIndexData {
  if (_audioIndex) return _audioIndex;
  
  try {
    const indexPath = path.join(process.cwd(), "src", "data", "audio-index.json");
    if (fs.existsSync(indexPath)) {
      const data = fs.readFileSync(indexPath, "utf-8");
      _audioIndex = JSON.parse(data);
    } else {
      _audioIndex = {};
    }
  } catch (e) {
    _audioIndex = {};
  }
  return _audioIndex;
}

export function getAudioUrl(siteUrl: string | URL, slug: string): string {
  // Use public R2 URL from env vars (either Vite/Astro style or standard process.env)
  const baseUrl = import.meta.env?.PUBLIC_R2_URL || process.env.PUBLIC_R2_URL || siteUrl;
  const base = baseUrl.toString().replace(/\/$/, "");
  
  // If no R2 URL is provided, fallback to the old local behavior for dev testing without R2
  if (base === siteUrl.toString().replace(/\/$/, "")) {
    return `${base}/audio/${slug}.mp3`;
  }
  return `${base}/audio/${slug}.mp3`;
}

export function hasAudio(slug: string): boolean {
  const index = getAudioIndex();
  return !!index[slug];
}

export function getAudioSize(slug: string): number {
  const index = getAudioIndex();
  return index[slug]?.size || 0;
}
