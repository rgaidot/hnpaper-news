import fs from "bun:fs";
import path from "bun:path";
import fm from "front-matter";
import { glob } from "glob";
import { EdgeTTS } from "node-edge-tts";

const NEWS_DIR = "src/content/news";
const AUDIO_DIR = "public/audio";
const VOICE = "fr-FR-VivienneMultilingualNeural";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
};

let progressLine = "";
const globalStart = Date.now();
const completionTimes: number[] = [];

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

function drawProgress(line: string) {
  progressLine = line;
  process.stdout.write(`\r${line.padEnd(process.stdout.columns ?? 120)}`);
}

function printLog(output: string) {
  process.stdout.write(`\r${" ".repeat(process.stdout.columns ?? 120)}\r`);
  console.log(output);
  if (progressLine)
    process.stdout.write(
      `\r${progressLine.padEnd(process.stdout.columns ?? 120)}`,
    );
}

const log = {
  info: (tag: string, msg: string) =>
    printLog(`${c.cyan}${c.bold}[${tag}]${c.reset} ${msg}`),

  success: (tag: string, msg: string) =>
    printLog(
      `${c.green}${c.bold}[${tag}]${c.reset} ${c.green}✔${c.reset} ${msg}`,
    ),

  warn: (tag: string, msg: string) =>
    printLog(
      `${c.yellow}${c.bold}[${tag}]${c.reset} ${c.yellow}⚠ ${msg}${c.reset}`,
    ),

  error: (tag: string, msg: string, err?: unknown) => {
    printLog(`${c.red}${c.bold}[${tag}]${c.reset} ${c.red}✘ ${msg}${c.reset}`);
    if (err)
      printLog(`${c.gray}  └─ ${(err as Error).message ?? err}${c.reset}`);
  },

  step: (tag: string, step: number, total: number, msg: string) => {
    const pct = Math.round((step / total) * 100);
    printLog(
      `${c.blue}[${tag}]${c.reset} ${c.dim}(${step}/${total} · ${pct}%)${c.reset} ${msg}`,
    );
  },

  progress: (current: number, total: number, msg: string) => {
    const pct = Math.round((current / total) * 100);
    const filled = Math.floor(pct / 5);
    const bar = `${c.green}${"█".repeat(filled)}${c.reset}${c.gray}${"░".repeat(20 - filled)}${c.reset}`;

    const elapsed = Date.now() - globalStart;
    const elapsedStr = `${c.dim}elapsed ${formatDuration(elapsed)}${c.reset}`;

    let etaStr = "";
    if (completionTimes.length >= 2) {
      const avgMs =
        completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length;
      const remaining = total - current;
      const etaMs = avgMs * remaining;
      const speed = (completionTimes.length / (elapsed / 60000)).toFixed(1);
      etaStr = ` ${c.dim}· ETA ${formatDuration(etaMs)} · ${speed}/min${c.reset}`;
    }

    const line = `${c.cyan}${c.bold}[${current}/${total}]${c.reset} ${bar} ${c.bold}${pct}%${c.reset} ${elapsedStr}${etaStr}  ${c.dim}${msg}${c.reset}`;
    drawProgress(line);
  },

  section: (msg: string) =>
    console.log(`\n${c.bold}${c.cyan}━━━ ${msg} ━━━${c.reset}\n`),
};

const stats = { success: 0, skipped: 0, failed: 0 };

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

function getAudioDuration(filePath: string): number {
  try {
    const proc = Bun.spawnSync([
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    return parseFloat(proc.stdout.toString().trim());
  } catch {
    return 0;
  }
}

function formatTime(ms: number): string {
  const date = new Date(ms);
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  const milliseconds = date.getUTCMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function jsonToVtt(subtitles: any[]): string {
  let vtt = "WEBVTT\n\n";
  subtitles.forEach((sub, index) => {
    vtt += `${index + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.part}\n\n`;
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
  text = text.replace(
    /^[ \t]*[-*+]\s*[\*_]*(Discussion HN|Article source)[\*_]*.*$/gm,
    "",
  );
  text = text.replace(/^#+\s+/gm, "");
  text = text.replace(/^[-*+]\s+/gm, "");
  text = text.replace(/^---$/gm, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{Pd}\n]/gu, " ");
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

  if (currentChunk.length > 0) chunks.push(currentChunk.trim());
  return chunks;
}

async function processFile(
  file: string,
  force: boolean,
  fileIndex: number,
  totalFiles: number,
) {
  const filename = path.basename(file, ".md");
  const audioPath = path.join(AUDIO_DIR, `${filename}.mp3`);
  const vttPath = path.join(AUDIO_DIR, `${filename}.vtt`);

  if (!force && fs.existsSync(audioPath) && fs.existsSync(vttPath)) {
    log.progress(
      fileIndex,
      totalFiles,
      `${filename} — Already generated, skipped.`,
    );
    stats.skipped++;
    return;
  }

  log.progress(fileIndex, totalFiles, `${filename}${force ? " (forced)" : ""}`);
  const startTime = Date.now();

  const tts = new EdgeTTS({
    voice: VOICE,
    timeout: 60000,
    saveSubtitles: true,
  });

  const content = fs.readFileSync(file, "utf-8");
  const parsed = fm(content);
  const title = (parsed.attributes as any).title || "";
  const textToRead = `${title}. \n\n${cleanMarkdown(parsed.body)}`;

  const chunks = chunkText(textToRead);

  let allSubtitles: any[] = [];
  let currentTimeOffset = 0;

  try {
    if (chunks.length === 1) {
      await tts.ttsPromise(chunks[0], audioPath);

      const jsonPath1 = audioPath.replace(/\.mp3$/, ".json");
      const jsonPath2 = audioPath + ".json";
      const jsonPath = fs.existsSync(jsonPath1)
        ? jsonPath1
        : fs.existsSync(jsonPath2)
          ? jsonPath2
          : null;

      if (jsonPath) {
        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
        fs.writeFileSync(vttPath, jsonToVtt(jsonContent));
        fs.unlinkSync(jsonPath);
      } else {
        log.warn(filename, "Subtitle JSON file not found.");
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
            log.warn(
              filename,
              `Attempt ${attempts}/3 failed for segment ${i + 1}.`,
            );
            await new Promise((r) =>
              setTimeout(r, 2000 + Math.random() * 1000),
            );
            if (attempts === 3) throw e;
          }
        }

        if (fs.existsSync(tempPath)) {
          const durationMs = getAudioDuration(tempPath) * 1000;
          fs.appendFileSync(audioPath, fs.readFileSync(tempPath));

          const tempJsonPath1 = tempPath.replace(/\.mp3$/, ".json");
          const tempJsonPath2 = tempPath + ".json";
          const tempJsonPath = fs.existsSync(tempJsonPath1)
            ? tempJsonPath1
            : fs.existsSync(tempJsonPath2)
              ? tempJsonPath2
              : null;

          if (tempJsonPath) {
            const jsonContent = JSON.parse(
              fs.readFileSync(tempJsonPath, "utf-8"),
            );
            allSubtitles.push(
              ...jsonContent.map((item: any) => ({
                ...item,
                start: item.start + currentTimeOffset,
                end: item.end + currentTimeOffset,
              })),
            );
            fs.unlinkSync(tempJsonPath);
          } else {
            log.warn(filename, `Subtitle JSON not found for segment ${i + 1}.`);
          }

          fs.unlinkSync(tempPath);
          currentTimeOffset += durationMs;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      if (allSubtitles.length > 0) {
        fs.writeFileSync(vttPath, jsonToVtt(allSubtitles));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    completionTimes.push(Date.now() - startTime);
    log.success(filename, `Generated in ${c.bold}${elapsed}s${c.reset}.`);
    stats.success++;
  } catch (err) {
    log.error(filename, "Generation failed.", err);
    stats.failed++;

    for (const p of [audioPath, vttPath]) {
      if (fs.existsSync(p))
        try {
          fs.unlinkSync(p);
        } catch {}
    }
  }
}

async function generateAudio() {
  const forceRegeneration = process.argv.includes("--force");
  const files = await glob(`${NEWS_DIR}/*.md`);

  log.section(
    `Audio generation — ${files.length} article(s)${forceRegeneration ? " · forced mode" : ""}`,
  );

  const CONCURRENCY_LIMIT = 30;
  const activePromises = new Set<Promise<void>>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (activePromises.size >= CONCURRENCY_LIMIT) {
      await Promise.race(activePromises);
    }
    const p = processFile(file, forceRegeneration, i + 1, files.length).then(
      () => activePromises.delete(p),
    );
    activePromises.add(p);
  }

  await Promise.all(activePromises);

  process.stdout.write("\n");
  log.section("Summary");

  const totalElapsed = Date.now() - globalStart;
  const avgMs =
    completionTimes.length > 0
      ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
      : 0;

  console.log(
    `  ${c.green}✔ Success  : ${stats.success}${c.reset}\n` +
      `  ${c.gray}– Skipped  : ${stats.skipped}${c.reset}\n` +
      `  ${c.red}✘ Failed   : ${stats.failed}${c.reset}\n` +
      `\n` +
      `  ${c.dim}Total time : ${c.reset}${c.bold}${formatDuration(totalElapsed)}${c.reset}\n` +
      (avgMs > 0
        ? `  ${c.dim}Avg/article: ${c.reset}${c.bold}${formatDuration(avgMs)}${c.reset}\n`
        : ""),
  );
}

generateAudio().catch(console.error);
