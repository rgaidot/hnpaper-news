import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "bun:fs";
import path from "bun:path";
import fm from "front-matter";
import { glob } from "glob";
import { EdgeTTS } from "node-edge-tts";

const NEWS_DIR = "data/news";
const AUDIO_DIR = "data/audio";
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

const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID || "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  bucketName: process.env.R2_BUCKET_NAME || "",
};

function getS3Client() {
  if (!r2Config.accountId || !r2Config.accessKeyId || !r2Config.secretAccessKey)
    return null;
  return new S3Client({
    region: "auto",
    endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
  });
}

async function listR2Objects(s3: S3Client): Promise<Record<string, number>> {
  let isTruncated = true;
  let continuationToken: string | undefined = undefined;
  const objects: Record<string, number> = {};

  try {
    while (isTruncated) {
      const command = new ListObjectsV2Command({
        Bucket: r2Config.bucketName,
        Prefix: "audio/",
        ContinuationToken: continuationToken,
      });
      const response = await s3.send(command);
      for (const item of response.Contents || []) {
        if (item.Key && item.Size !== undefined) {
          objects[item.Key.replace("audio/", "")] = item.Size;
        }
      }
      isTruncated = response.IsTruncated ?? false;
      continuationToken = response.NextContinuationToken;
    }
  } catch (err) {
    console.error("Failed to list objects from R2:", err);
  }
  return objects;
}

async function uploadToR2(
  s3: S3Client,
  filePath: string,
  key: string,
  contentType: string,
) {
  const command = new PutObjectCommand({
    Bucket: r2Config.bucketName,
    Key: `audio/${key}`,
    Body: fs.readFileSync(filePath),
    ContentType: contentType,
  });
  await s3.send(command);
}

const ESC = "\x1b";
const hideCursor = `${ESC}[?25l`;
const showCursor = `${ESC}[?25h`;

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m${rem}s` : `${m}m`;
}

function formatTimeForBar(ms: number): string {
  const date = new Date(ms);
  const hours = date.getUTCHours().toString().padStart(2, "0");
  const minutes = date.getUTCMinutes().toString().padStart(2, "0");
  const seconds = date.getUTCSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

class ProgressTUI {
  private activeTasks = new Map<string, { text: string; step: number; total: number }>();
  private completedFiles = 0;
  private totalFiles = 0;
  private linesRendered = 0;
  private interval: Timer | null = null;
  private startTime = Date.now();
  private completionTimes: number[] = [];
  private stopped = false;
  public stats = { success: 0, skipped: 0, failed: 0 };

  constructor() {}

  public init(total: number) {
    this.totalFiles = total;
    this.startTime = Date.now();
    process.stdout.write(hideCursor);
    process.on("SIGINT", () => this.cleanup());
    process.on("SIGTERM", () => this.cleanup());
    this.interval = setInterval(() => this.render(), 150);
  }

  private cleanup() {
    process.stdout.write(showCursor);
    if (this.interval) clearInterval(this.interval);
    process.exit();
  }

  public stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.interval) clearInterval(this.interval);
    this.clear();
    process.stdout.write(showCursor);
  }

  private clear() {
    if (this.linesRendered > 0) {
      process.stdout.write(`${ESC}[${this.linesRendered}A${ESC}[0J`);
      this.linesRendered = 0;
    }
  }

  public addSuccess(ms: number) {
    this.completionTimes.push(ms);
    this.stats.success++;
    this.completedFiles++;
    this.render();
  }

  public addSkipped() {
    this.stats.skipped++;
    this.completedFiles++;
    this.render();
  }

  public addFailed() {
    this.stats.failed++;
    this.completedFiles++;
    this.render();
  }

  public setTask(id: string, text: string, step = 0, total = 1) {
    this.activeTasks.set(id, { text, step, total });
    this.render();
  }

  public removeTask(id: string) {
    this.activeTasks.delete(id);
    this.render();
  }

  private println(msg: string) {
    this.clear();
    process.stdout.write(`${msg}\n`);
    this.render();
  }

  public info(tag: string, msg: string) {
    if (tag === "R2" || tag === "Init") {
      this.println(`ℹ ${msg}`);
    } else {
      this.println(`ℹ ${tag}: ${msg}`);
    }
  }

  public success(filename: string, msg: string) {
    this.println(`  ${c.green}✔${c.reset} ${c.bold}${filename}${c.reset}: ${msg}`);
  }

  public skippedLog(filename: string) {
    this.println(`  ${c.dim}-${c.reset} ${c.dim}${filename}${c.reset}: Already up to date`);
  }

  public warn(filename: string, msg: string) {
    this.println(`  ${c.yellow}⚠${c.reset} ${c.bold}${filename}${c.reset}: ${msg}`);
  }

  public error(filename: string, msg: string, err?: unknown) {
    this.println(`  ${c.red}✘${c.reset} ${c.bold}${filename}${c.reset}: ${msg}`);
    if (err) {
      this.println(`  ${c.gray}  └─ ${(err as Error).message ?? err}${c.reset}`);
    }
  }

  public section(msg: string) {
    this.println(`\n━━━ ${msg} ━━━\n`);
  }

  public getTotalElapsed() {
    return Date.now() - this.startTime;
  }

  public getAvgMs() {
    return this.completionTimes.length > 0
      ? this.completionTimes.reduce((a, b) => a + b, 0) /
          this.completionTimes.length
      : 0;
  }

  private render() {
    if (this.stopped && this.linesRendered === -1) return;

    this.clear();

    const lines: string[] = [];

    const maxTasks = 12;
    let count = 0;
    for (const [id, task] of Array.from(this.activeTasks.entries())) {
      if (count >= maxTasks) break;
      const pct = task.total > 0 ? Math.min(100, Math.round((task.step / task.total) * 100)) : 100;
      const filled = Math.floor(pct / 10); // 10 chars max
      const bar = `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
      // Mimic Rust indicatif article progress bar: `  [spinner] filename [██░░] X/Y | TTS segment X/Y`
      lines.push(
        `  ${c.yellow}⠁${c.reset} ${c.bold}${c.blue}${id}${c.reset} ${c.dim}${bar}${c.reset} ${task.step}/${task.total} | ${task.text}`
      );
      count++;
    }
    if (this.activeTasks.size > 0) lines.push("");

    const elapsed = Date.now() - this.startTime;
    let etaStr = "";
    if (this.completionTimes.length >= 2) {
      const avgMs =
        this.completionTimes.reduce((a, b) => a + b, 0) /
        this.completionTimes.length;
      const remaining = this.totalFiles - this.completedFiles;
      const etaMs = avgMs * remaining;
      etaStr = ` | ETA ${formatDuration(etaMs)}`;
    }

    const pct =
      this.totalFiles > 0
        ? Math.round((this.completedFiles / this.totalFiles) * 100)
        : 100;
    const filled = Math.floor(pct / 5); // 20 chars max
    const bar = `${"█".repeat(filled)}${"░".repeat(20 - filled)}`;

    if (this.totalFiles > 0) {
      // Mimic Rust indicatif global progress bar:
      // Overall Progress [00:00:00] ██████████ 1/121 (0%) | ✔ 1 – 0 ✘ 0 | ETA 00s
      lines.push(
        `⠁ Overall Progress [${formatTimeForBar(elapsed)}] ${bar} ${this.completedFiles}/${this.totalFiles} (${pct}%) | ✔ ${this.stats.success} – ${this.stats.skipped} ✘ ${this.stats.failed}${etaStr}`
      );
    }

    process.stdout.write(lines.join("\n") + "\n");
    
    let pLines = 0;
    const cols = process.stdout.columns || 80;
    for (const line of lines) {
      // eslint-disable-next-line no-control-regex
      const stripped = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
      pLines += Math.max(1, Math.ceil(stripped.length / cols));
    }
    this.linesRendered = pLines;

    if (this.stopped) {
      this.linesRendered = -1;
    }
  }
}

const tui = new ProgressTUI();

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
  text = text.replace(/[\u201C\u201D\u00AB\u00BB]/g, ""); // Strip smart double quotes and guillemets
  text = text.replace(/"/g, ""); // Strip straight double quotes
  text = text.replace(/&/g, " et "); // Translate ampersand to 'et' to avoid &amp;
  text = text.replace(/</g, ""); // Strip isolated < to avoid &lt;
  text = text.replace(/>/g, ""); // Strip isolated > to avoid &gt;
  text = text.replace(/[()\[\]{}]/g, ""); // Strip parentheses and brackets to prevent TTS offset bugs
  text = text.replace(/_/g, " "); // Replace underscores with spaces
  text = text.replace(/[\u2018\u2019]/g, "’"); // Standardize smart single quotes/apostrophes
  text = text.replace(/'/g, "’"); // Use typographic apostrophe to prevent &apos;
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

function computeHash(content: string): string {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(content);
  return hasher.digest("hex");
}

function chunkText(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let currentChunk = "";
  const sentences = text.split(/(?<=[.!?])(?=\s+)/);

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
  s3: S3Client | null,
  r2Objects: Record<string, number>,
  indexData: Record<string, { size: number; hash?: string }>,
) {
  const filename = path.basename(file, ".md");
  const audioPath = path.join(AUDIO_DIR, `${filename}.mp3`);
  const vttPath = path.join(AUDIO_DIR, `${filename}.vtt`);
  const mp3Key = `${filename}.mp3`;
  const vttKey = `${filename}.vtt`;

  const content = fs.readFileSync(file, "utf-8");
  const parsed = fm(content);
  const title = (parsed.attributes as any).title || "";
  const textToRead = `${title}. \n\n${cleanMarkdown(parsed.body)}`;

  const contentHash = computeHash(textToRead);
  const existsOnR2 =
    r2Objects[mp3Key] !== undefined && r2Objects[vttKey] !== undefined;
  const existsLocally = fs.existsSync(audioPath) && fs.existsSync(vttPath);

  const previousHash = indexData[filename]?.hash;
  const hasChanged = previousHash !== contentHash;

  if (!force && !hasChanged && (existsOnR2 || (!s3 && existsLocally))) {
    tui.addSkipped();
    tui.skippedLog(filename);

    // Add to index
    if (existsOnR2) {
      indexData[filename] = { size: r2Objects[mp3Key], hash: contentHash };
    } else if (existsLocally) {
      indexData[filename] = {
        size: fs.statSync(audioPath).size,
        hash: contentHash,
      };
    }
    return;
  }

  const chunks = chunkText(textToRead);
  const steps = chunks.length + (s3 ? 2 : 0);

  tui.setTask(filename, "preparing...", 0, steps);
  const startTime = Date.now();

  const tts = new EdgeTTS({
    voice: VOICE,
    timeout: 60000,
    saveSubtitles: true,
  });

  let allSubtitles: any[] = [];
  let currentTimeOffset = 0;

  try {
    if (chunks.length === 1) {
      tui.setTask(filename, "generating TTS", 0, steps);
      await tts.ttsPromise(chunks[0], audioPath);
      tui.setTask(filename, "generating TTS", 1, steps);

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
        tui.warn(filename, "Subtitle JSON file not found.");
      }
    } else {
      fs.writeFileSync(audioPath, Buffer.alloc(0));

      for (let i = 0; i < chunks.length; i++) {
        tui.setTask(filename, `TTS segment ${i + 1}/${chunks.length}`, i, steps);
        const tempPath = path.join(AUDIO_DIR, `${filename}_part${i}.mp3`);

        let attempts = 0;
        while (attempts < 3) {
          try {
            await tts.ttsPromise(chunks[i], tempPath);
            break;
          } catch (e) {
            attempts++;
            tui.warn(
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
            tui.warn(filename, `Subtitle JSON not found for segment ${i + 1}.`);
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

    // Upload to R2 if client exists
    if (s3) {
      tui.setTask(filename, "uploading mp3", chunks.length, steps);
      await uploadToR2(s3, audioPath, mp3Key, "audio/mpeg");
      tui.setTask(filename, "uploading vtt", chunks.length + 1, steps);
      await uploadToR2(s3, vttPath, vttKey, "text/vtt");
    }

    // Add to index
    indexData[filename] = {
      size: fs.statSync(audioPath).size,
      hash: contentHash,
    };

    // Clean up local files if uploaded
    if (s3) {
      if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      if (fs.existsSync(vttPath)) fs.unlinkSync(vttPath);
    }

    const elapsed = Date.now() - startTime;
    tui.success(filename, `Done in ${formatDuration(elapsed)}`);
    tui.addSuccess(elapsed);
    tui.removeTask(filename);
  } catch (err) {
    tui.error(filename, "Generation failed.", err);
    tui.addFailed();
    tui.removeTask(filename);

    // Clean up on failure
    for (const p of [audioPath, vttPath]) {
      if (fs.existsSync(p))
        try {
          fs.unlinkSync(p);
        } catch {}
    }
  }
}

async function generateAudio() {
  const forceRegeneration =
    process.argv.includes("--force") || process.argv.includes("-f");
  const argsFiles = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith("-"))
    .map((arg) =>
      arg.endsWith(".md") ? arg : `${NEWS_DIR}/${path.basename(arg, ".md")}.md`,
    );
  const files =
    argsFiles.length > 0 ? argsFiles : await glob(`${NEWS_DIR}/*.md`);
  const indexData: Record<string, { size: number; hash?: string }> = {};

  const indexPath = path.join(process.cwd(), "data", "audio-index.json");
  if (fs.existsSync(indexPath)) {
    try {
      Object.assign(indexData, JSON.parse(fs.readFileSync(indexPath, "utf-8")));
    } catch (err) {}
  }

  const s3 = getS3Client();
  let r2Objects: Record<string, number> = {};

  tui.section(
    `Audio generation — ${files.length} article(s)${forceRegeneration ? " · forced mode" : ""}`,
  );

  if (s3) {
    tui.info("R2", "Connecting to Cloudflare R2...");
    r2Objects = await listR2Objects(s3);
    tui.info("R2", `Found ${Object.keys(r2Objects).length} objects in bucket.`);
  } else {
    tui.warn(
      "R2",
      "Missing R2 credentials. Falling back to local audio generation.",
    );
  }

  tui.init(files.length);

  const CONCURRENCY_LIMIT = s3 ? 10 : 30; // Reduce concurrency if uploading
  const activePromises = new Set<Promise<void>>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (activePromises.size >= CONCURRENCY_LIMIT) {
      await Promise.race(activePromises);
    }
    const p = processFile(
      file,
      forceRegeneration,
      i + 1,
      files.length,
      s3,
      r2Objects,
      indexData,
    ).then(() => activePromises.delete(p));
    activePromises.add(p);
  }

  await Promise.all(activePromises);

  // Write audio-index.json
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

  // Upload index to R2 if client exists
  if (s3) {
    tui.info("R2", "Uploading audio-index.json to R2...");
    await uploadToR2(s3, indexPath, "audio-index.json", "application/json");
  }

  tui.stop();
  console.log(`\n━━━ Summary ━━━\n`);

  const totalElapsed = tui.getTotalElapsed();
  const avgMs = tui.getAvgMs();

  console.log(
    `  ✔ Success  : ${tui.stats.success}\n` +
    `  – Skipped  : ${tui.stats.skipped}\n` +
    `  ✘ Failed   : ${tui.stats.failed}\n` +
    `\n` +
    `  Total time : ${formatDuration(totalElapsed)}\n` +
    (avgMs > 0 ? `  Avg/article: ${formatDuration(avgMs)}\n` : "")
  );
}

generateAudio().catch(console.error);
