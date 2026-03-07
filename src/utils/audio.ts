import fs from "node:fs";
import path from "node:path";

export function getAudioPath(slug: string): string {
  return path.join(process.cwd(), "public", "audio", `${slug}.mp3`);
}

export function getAudioUrl(site: string, slug: string): string {
  return `${site}audio/${slug}.mp3`;
}

export function hasLocalAudio(slug: string): boolean {
  return fs.existsSync(getAudioPath(slug));
}
