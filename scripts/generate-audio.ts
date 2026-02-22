import fm from "front-matter";
import { glob } from "glob";
import { EdgeTTS } from "node-edge-tts";
import fs from "node:fs";
import path from "node:path";

const NEWS_DIR = "src/content/news";
const AUDIO_DIR = "public/audio";
const VOICE = "fr-FR-VivienneMultilingualNeural";

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
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
  text = text.replace(/^[ \t]*[-*+]\s*(Discussion HN|Article source).*$/gm, "");
  text = text.replace(/^#+\s+/gm, ""); // Titres
  text = text.replace(/^[-*+]\s+/gm, ""); // Listes génériques
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1"); // Gras
  text = text.replace(/\*([^*]+)\*/g, "$1"); // Italique
  text = text.replace(/__([^_]+)__/g, "$1"); // Gras souligné
  text = text.replace(/_([^_]+)_/g, "$1"); // Italique souligné
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function chunkText(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let currentChunk = "";

  const sentenceRegex = /[^.!?]+([.!?]+(\s+|$))?/g;
  const sentences = text.match(sentenceRegex) || [text];

  for (const sentence of sentences) {
    if (!sentence.trim()) continue; // Ignorer les segments vides

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

  if (!force && fs.existsSync(audioPath)) {
    return;
  }

  console.log(`[${filename}] Starting audio generation...` + (force ? " (forced)" : ""));

  const tts = new EdgeTTS({
    voice: VOICE,
    timeout: 60000,
  });

  const content = fs.readFileSync(file, "utf-8");
  const parsed = fm(content);

  const title = (parsed.attributes as any).title || "";
  const body = parsed.body;

  const textToRead = `${title}. 

  ${cleanMarkdown(body)}`;

  const chunks = chunkText(textToRead);
  console.log(`[${filename}] Text divided into ${chunks.length} segments.`);

  try {
    if (chunks.length === 1) {
      await tts.ttsPromise(chunks[0], audioPath);
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
          const data = fs.readFileSync(tempPath);
          fs.appendFileSync(audioPath, data);
          fs.unlinkSync(tempPath);
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(`[${filename}] Audio generated successfully.`);
  } catch (err) {
    console.error(`[${filename}] Error during generation:`, err);

    if (fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
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
