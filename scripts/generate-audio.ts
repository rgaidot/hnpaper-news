import fm from "front-matter";
import { glob } from "glob";
import { EdgeTTS } from "node-edge-tts";
import fs from "bun:fs";
import path from "bun:path";
import { execSync } from "node:child_process";

const NEWS_DIR = "src/content/news";
const AUDIO_DIR = "public/audio";
const VOICE = "fr-FR-VivienneMultilingualNeural";

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

function getAudioDuration(filePath: string): number {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    ).toString().trim();
    return parseFloat(output);
  } catch (error) {
    console.error(`Error getting duration for ${filePath}:`, error);
    return 0;
  }
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const seconds = date.getUTCSeconds().toString().padStart(2, '0');
  const milliseconds = date.getUTCMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function jsonToVtt(subtitles: any[]): string {
  let vtt = "WEBVTT\n\n";
  subtitles.forEach((sub, index) => {
    const start = formatTime(sub.start);
    const end = formatTime(sub.end);
    vtt += `${index + 1}\n${start} --> ${end}\n${sub.part}\n\n`;
  });
  return vtt;
}

function cleanMarkdown(markdown: string): string {
  let text = markdown;

  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)(\([^)]+\))/g, "");
  text = text.replace(/\{([^\}]+)\}\[[^\]]+\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
  text = text.replace(/(https?:\/\/[^\s]+)/g, "");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/^[ \t]*[-*+]\s*[\*_]*(Discussion HN|Article source)[\*_]*.*$/gm, "");
  text = text.replace(/^#+\s+/gm, "");
  text = text.replace(/^[-*+]\s+/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[^\p{L}\p{N}\p{P}\p{Z}\n]/gu, " ");

  return text.trim();
}

function chunkText(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let currentChunk = "";

  const sentenceRegex = /[^.!?]+([.!?]+(\s+|$))?/g;
  const sentences = text.match(sentenceRegex) || [text];

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      if (sentence.length > maxLength) {
        const subChunks = sentence.match(
          new RegExp(`.{1,${maxLength}}`, "g"),
        ) || [sentence];
        chunks.push(...subChunks);
      } else {
        currentChunk += sentence;
      }
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function processFile(file: string, force: boolean) {
  const filename = path.basename(file, ".md");
  const audioPath = path.join(AUDIO_DIR, `${filename}.mp3`);
  const vttPath = path.join(AUDIO_DIR, `${filename}.vtt`);

  if (!force && fs.existsSync(audioPath) && fs.existsSync(vttPath)) {
    return;
  }

  console.log(`[${filename}] Starting audio generation...` + (force ? " (forced)" : ""));

  const tts = new EdgeTTS({
    voice: VOICE,
    timeout: 60000,
    saveSubtitles: true,
  });

  const content = fs.readFileSync(file, "utf-8");
  const parsed = fm(content);

  const title = (parsed.attributes as any).title || "";
  const body = parsed.body;

  const textToRead = `${title}. 

  ${cleanMarkdown(body)}`;

  const chunks = chunkText(textToRead);
  console.log(`[${filename}] Text divided into ${chunks.length} segments.`);

  let allSubtitles: any[] = [];
  let currentTimeOffset = 0;

  try {
    if (chunks.length === 1) {
      await tts.ttsPromise(chunks[0], audioPath);
      // Wait for the JSON file which is generated alongside audio
      // Based on typical behavior, if audioPath is "file.mp3", json is "file.json"
      // or if using node-edge-tts, it might be "file.mp3.json"
      // Let's check both or check behavior.
      const jsonPath1 = audioPath.replace(/\.mp3$/, ".json");
      const jsonPath2 = audioPath + ".json";
      
      let jsonPath = fs.existsSync(jsonPath1) ? jsonPath1 : (fs.existsSync(jsonPath2) ? jsonPath2 : null);

      if (jsonPath) {
        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        fs.writeFileSync(vttPath, jsonToVtt(jsonContent));
        fs.unlinkSync(jsonPath);
      } else {
        console.warn(`[${filename}] Warning: Subtitles JSON not found.`);
      }

    } else {
      fs.writeFileSync(audioPath, Buffer.alloc(0));

      for (let i = 0; i < chunks.length; i++) {
        const tempPath = path.join(AUDIO_DIR, `${filename}_part${i}.mp3`);
        
        let attempts = 0;

        while (attempts < 3) {
          try {
            await tts.ttsPromise(chunks[i], tempPath);
            break;
          } catch (e) {
            attempts++;
            console.warn(
              `[${filename}] Attempt ${attempts} failed for segment ${i}...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, 2000 + Math.random() * 1000),
            );
            if (attempts === 3) throw e;
          }
        }

        if (fs.existsSync(tempPath)) {
          // Get duration of this chunk
          const durationSec = getAudioDuration(tempPath);
          const durationMs = durationSec * 1000;

          // Append audio
          const data = fs.readFileSync(tempPath);
          fs.appendFileSync(audioPath, data);
          
          // Process subtitles
          const tempJsonPath1 = tempPath.replace(/\.mp3$/, ".json");
          const tempJsonPath2 = tempPath + ".json";
          let tempJsonPath = fs.existsSync(tempJsonPath1) ? tempJsonPath1 : (fs.existsSync(tempJsonPath2) ? tempJsonPath2 : null);

          if (tempJsonPath) {
            const jsonContent = JSON.parse(fs.readFileSync(tempJsonPath, "utf-8"));
            
            // Shift timestamps
            const shifted = jsonContent.map((item: any) => ({
                ...item,
                start: item.start + currentTimeOffset,
                end: item.end + currentTimeOffset
            }));
            
            allSubtitles.push(...shifted);
            fs.unlinkSync(tempJsonPath);
          } else {
             console.warn(`[${filename}] Warning: Subtitles JSON for chunk ${i} not found.`);
          }

          fs.unlinkSync(tempPath);
          
          currentTimeOffset += durationMs;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Write combined VTT
      if (allSubtitles.length > 0) {
        fs.writeFileSync(vttPath, jsonToVtt(allSubtitles));
      }
    }

    console.log(`[${filename}] Audio and VTT generated successfully.`);
  } catch (err) {
    console.error(`[${filename}] Error during generation:`, err);

    if (fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
      } catch (e) {}
    }
    if (fs.existsSync(vttPath)) {
      try {
        fs.unlinkSync(vttPath);
      } catch (e) {}
    }
  }
}

async function generateAudio() {
  const forceRegeneration = process.argv.includes("--force");

  const files = await glob(`${NEWS_DIR}/*.md`);

  console.log(`Found ${files.length} articles.` + (forceRegeneration ? " (forced regeneration)" : ""));

  const CONCURRENCY_LIMIT = 10;
  const activePromises = new Set<Promise<void>>();

  for (const file of files) {
    if (activePromises.size >= CONCURRENCY_LIMIT) {
      await Promise.race(activePromises);
    }

    const p = processFile(file, forceRegeneration).then(() => {
      activePromises.delete(p);
    });

    activePromises.add(p);
  }

  await Promise.all(activePromises);
  console.log("Audio generation finished.");
}

generateAudio().catch(console.error);
