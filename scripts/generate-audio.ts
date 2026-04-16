import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "bun:fs";
import path from "bun:path";
import fm from "front-matter";
import { glob } from "glob";

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

async function downloadFromR2(s3: S3Client, key: string, outputPath: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: r2Config.bucketName,
      Key: `audio/${key}`,
    });
    const response = await s3.send(command);
    if (response.Body) {
      const arr = await response.Body.transformToByteArray();
      fs.writeFileSync(outputPath, arr);
      return true;
    }
  } catch (err) {
    // If it's a 404, we don't care much, it just means the file doesn't exist yet
    if ((err as any).name !== "NoSuchKey") {
      console.error(`Failed to download ${key} from R2:`, err);
    }
  }
  return false;
}

function cleanMarkdown(markdown: string): string {
  let text = markdown;

  // 1. Handle common HTML entities BEFORE touching '&'
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&amp;/g, " et ");
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&lt;/g, "");
  text = text.replace(/&gt;/g, "");

  // 2. Remove typographic and straight double quotes
  text = text.replace(/[\u201C\u201D\u00AB\u00BB]/g, "");
  text = text.replace(/"/g, "");

  // 3. Replace remaining '&' with "et"
  text = text.replace(/&/g, " et ");

  // 4. Clean problematic characters for edge-tts
  text = text.replace(/\(/g, "");
  text = text.replace(/\)/g, "");
  text = text.replace(/\[/g, "");
  text = text.replace(/\]/g, "");
  text = text.replace(/\{/g, "");
  text = text.replace(/\}/g, "");
  text = text.replace(/_/g, " ");

  // Standardize smart single quotes/apostrophes
  text = text.replace(/[\u2018\u2019]/g, "’");
  text = text.replace(/'/g, "’");

  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "");
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

  // Remove double spaces
  while (text.includes("  ")) {
    text = text.replace(/  /g, " ");
  }

  return text.trim();
}

function computeHash(content: string): string {
  const hasher = new Bun.CryptoHasher("md5");
  hasher.update(content);
  return hasher.digest("hex");
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
  const s3 = getS3Client();

  if (s3) {
    console.log(`ℹ R2: Connecting to Cloudflare R2...`);
    console.log(`ℹ R2: Downloading audio-index.json...`);
    await downloadFromR2(s3, "audio-index.json", indexPath);
  }

  if (fs.existsSync(indexPath)) {
    try {
      Object.assign(indexData, JSON.parse(fs.readFileSync(indexPath, "utf-8")));
    } catch (err) {}
  }

  let r2Objects: Record<string, number> = {};

  console.log(
    `\n━━━ Audio generation — ${files.length} article(s)${forceRegeneration ? " · forced mode" : ""} ━━━\n`,
  );

  if (s3) {
    r2Objects = await listR2Objects(s3);
    console.log(
      `ℹ R2: Found ${Object.keys(r2Objects).length} objects in bucket.`,
    );
  } else {
    console.log(
      `${c.yellow}⚠ R2: Missing R2 credentials. Falling back to local audio generation.${c.reset}`,
    );
  }

  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }

  const filesToProcess: string[] = [];

  for (const file of files) {
    const filename = path.basename(file, ".md");
    const mp3Key = `${filename}.mp3`;
    const vttKey = `${filename}.vtt`;

    const content = fs.readFileSync(file, "utf-8");
    const parsed = fm(content);
    const title = (parsed.attributes as any).title || "";
    const textToRead = `${title}. \n\n${cleanMarkdown(parsed.body)}`;
    const contentHash = computeHash(textToRead);

    const existsOnR2 =
      r2Objects[mp3Key] !== undefined && r2Objects[vttKey] !== undefined;
    const existsLocally =
      fs.existsSync(path.join(AUDIO_DIR, mp3Key)) &&
      fs.existsSync(path.join(AUDIO_DIR, vttKey));
    const previousHash = indexData[filename]?.hash;
    const hasChanged = previousHash !== contentHash;

    if (
      !forceRegeneration &&
      !hasChanged &&
      (existsOnR2 || (!s3 && existsLocally))
    ) {
      console.log(
        `  ${c.dim}-${c.reset} ${c.dim}${filename}${c.reset}: Already up to date`,
      );
      if (existsOnR2) {
        indexData[filename] = { size: r2Objects[mp3Key], hash: contentHash };
      } else if (existsLocally) {
        indexData[filename] = {
          size: fs.statSync(path.join(AUDIO_DIR, mp3Key)).size,
          hash: contentHash,
        };
      }
      continue;
    }

    // Mark for processing
    filesToProcess.push(file);
    // Temporarily store the hash
    indexData[filename] = { size: 0, hash: contentHash };
  }

  let voxifyFailed = false;

  if (filesToProcess.length > 0) {
    console.log(
      `\nℹ Processing ${filesToProcess.length} file(s) with voxify...`,
    );

    // Make sure voxify is built
    const voxifyPath = path.join(process.cwd(), "bin", "voxify");
    if (!fs.existsSync(voxifyPath)) {
      console.error(
        `${c.red}✘ voxify binary not found in bin/voxify${c.reset}`,
      );
      process.exit(1);
    }

    const voxifyArgs = [
      voxifyPath,
      ...filesToProcess,
      "--output",
      AUDIO_DIR,
      "--voice",
      VOICE,
      "--parallel",
      s3 ? "10" : "30",
    ];

    const proc = Bun.spawnSync(voxifyArgs, {
      stdout: "inherit",
      stderr: "inherit",
    });

    // Even if voxify failed, some files might have been generated
    // Let's update indexData for what we have
    for (const file of filesToProcess) {
      const filename = path.basename(file, ".md");
      const audioPath = path.join(AUDIO_DIR, `${filename}.mp3`);
      const vttPath = path.join(AUDIO_DIR, `${filename}.vtt`);

      if (fs.existsSync(audioPath) && fs.existsSync(vttPath)) {
        const audioSize = fs.statSync(audioPath).size;
        indexData[filename].size = audioSize;

        if (s3) {
          console.log(`  ${c.cyan}↑${c.reset} Uploading ${filename} to R2...`);
          try {
            await uploadToR2(s3, audioPath, `${filename}.mp3`, "audio/mpeg");
            await uploadToR2(s3, vttPath, `${filename}.vtt`, "text/vtt");

            // Clean up local files if uploaded
            fs.unlinkSync(audioPath);
            fs.unlinkSync(vttPath);
          } catch (err) {
            console.error(`Failed to upload ${filename} to R2:`, err);
          }
        }
        dataDir;
      }
    }

    if (proc.exitCode !== 0) {
      console.error(`${c.red}✘ voxify execution failed${c.reset}`);
      voxifyFailed = true;
    }
  }

  // Write audio-index.json
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

  // Upload index to R2 if client exists
  if (s3) {
    console.log(`\nℹ R2: Uploading audio-index.json to R2...`);
    await uploadToR2(s3, indexPath, "audio-index.json", "application/json");
  }

  if (voxifyFailed) {
    process.exit(1);
  }

  console.log(`\n  ${c.green}✔${c.reset} Done.\n`);
}

generateAudio().catch(console.error);
