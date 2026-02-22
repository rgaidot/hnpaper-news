/**
 * Cloudflare Worker — Edge TTS Proxy (TypeScript)
 *
 * Setup:
 *   bun add -d wrangler @cloudflare/workers-types
 *   bunx wrangler deploy
 */

import type {
  ExecutionContext,
  ExportedHandler,
  KVNamespace,
} from "@cloudflare/workers-types";

interface Env {
  API_KEY?: string;
  TTS_CACHE: KVNamespace;
}

interface TTSRequestBody {
  text: string;
  voice?: FrenchVoice;
  rate?: string;
}

type FrenchVoice =
  | "fr-FR-DeniseNeural"
  | "fr-FR-HenriNeural"
  | "fr-FR-EloiseNeural"
  | "fr-BE-CharlineNeural"
  | "fr-CA-SylvieNeural";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_MAJOR = "133";
const CHROMIUM_VERSION = "133.0.6943.98";
const DEFAULT_VOICE: FrenchVoice = "fr-FR-DeniseNeural";
// Réduit pour améliorer la réactivité (TTFB) lors du streaming
const MAX_CHUNK_SIZE = 2500;
const TIMEOUT_MS = 30_000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: CORS_HEADERS });

    const url = new URL(request.url);

    // 1. Création de la session TTS (Stockage du texte)
    // POST /tts
    if (url.pathname === "/tts" && request.method === "POST") {
      return handleTTSCreate(request, env, url.origin);
    }

    // 2. Stream audio (Lecture par Google Home)
    // GET /tts/:id
    const match = url.pathname.match(/^\/tts\/([a-zA-Z0-9\-]+)$/);
    if (match && request.method === "GET") {
      return handleTTSStream(match[1], env);
    }

    if (url.pathname === "/ping")
      return new Response("ok", { headers: CORS_HEADERS });

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
} satisfies ExportedHandler<Env>;

/**
 * Étape 1 : Le client envoie le texte.
 * On le sauvegarde dans KV et on retourne lURL publique du stream.
 */
async function handleTTSCreate(
  request: Request,
  env: Env,
  origin: string,
): Promise<Response> {
  // Vérif API Key si configurée
  if (
    env.API_KEY &&
    request.headers.get("Authorization") !== `Bearer ${env.API_KEY}`
  ) {
    return new Response("Unauthorized", { status: 401, headers: CORS_HEADERS });
  }

  let body: TTSRequestBody;
  try {
    body = await request.json<TTSRequestBody>();
  } catch {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const { text, voice = DEFAULT_VOICE, rate = "+0%" } = body;
  if (!text?.trim()) {
    return new Response("Missing text", { status: 400, headers: CORS_HEADERS });
  }

  // Générer un ID unique pour ce contenu
  const id = crypto.randomUUID();

  // Sauvegarder dans KV (expiration 1h)
  const data = JSON.stringify({ text, voice, rate });
  await env.TTS_CACHE.put(id, data, { expirationTtl: 3600 });

  // Retourner lURL que le Google Home devra appeler
  const streamUrl = `${origin}/tts/${id}`;

  return new Response(JSON.stringify({ streamUrl, id }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/**
 * Étape 2 : Le Google Home appelle cette URL.
 * On récupère le texte du KV et on stream l'audio (PCM encapsulé en WAV).
 */
async function handleTTSStream(id: string, env: Env): Promise<Response> {
  const dataRaw = await env.TTS_CACHE.get(id);
  if (!dataRaw) {
    return new Response("Expired or invalid TTS ID", {
      status: 404,
      headers: CORS_HEADERS,
    });
  }

  const { text, voice, rate } = JSON.parse(dataRaw) as TTSRequestBody;
  const chunks = splitText(text.trim(), MAX_CHUNK_SIZE);
  console.info(
    `[TTS Worker] Streaming ID ${id}: ${chunks.length} chunks (${text.length} chars)`,
  );

  const stream = makeAudioStream(
    chunks,
    voice || DEFAULT_VOICE,
    rate || "+0%",
  );

  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "audio/wav",
    },
  });
}

/**
 * Crée un ReadableStream qui génère l'audio séquentiellement pour chaque chunk de texte.
 */
function makeAudioStream(
  chunks: string[],
  voice: FrenchVoice,
  rate: string,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        // Écrire le header WAV au début du stream
        // On met une taille de fichier max (0xFFFFFFFF) pour indiquer un flux inconnu/long
        const header = getWavHeader(0xFFFFFFFF);
        controller.enqueue(header);

        for (const chunk of chunks) {
          // On attend la fin de chaque chunk avant de passer au suivant
          // pour garantir l'ordre séquentiel du flux audio.
          await synthesizeChunkToStream(chunk, voice, rate, controller);
        }
      } catch (err) {
        console.error("[TTS Worker] Stream error:", err);
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}

function getWavHeader(dataLength: number): Uint8Array {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 for Mono)
  view.setUint32(24, 24000, true); // SampleRate (24kHz)
  view.setUint32(28, 24000 * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true); // Subchunk2Size

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Connecte au WebSocket Edge TTS, envoie le texte, et pipe l'audio reçu
 * directement dans le controller du ReadableStream.
 */
async function synthesizeChunkToStream(
  text: string,
  voice: FrenchVoice,
  rate: string,
  controller: ReadableStreamDefaultController,
): Promise<void> {
  const secMsGec = await computeSecMsGec();
  const connectionId = crypto.randomUUID().replace(/-/g, "");

  const wssUrl =
    `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&ConnectionId=${connectionId}`;

  const resp = await fetch(wssUrl, {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent":
        `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36` +
        ` (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR}.0.0.0`,
      "Accept-Language": "fr-FR,fr;q=0.9",
    },
  });

  const ws: WebSocket = (resp as any).webSocket;
  if (!ws) {
    throw new Error(
      `WebSocket upgrade failed: ${resp.status} ${resp.statusText}`,
    );
  }

  const requestId = crypto.randomUUID().replace(/-/g, "");
  const timestamp = new Date().toISOString();

  ws.accept();

  return new Promise<void>((resolve, reject) => {
    // Timeout de sécurité pour ce chunk
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Timeout: TTS chunk generation took too long"));
    }, TIMEOUT_MS);

    ws.addEventListener("open", () => {
      ws.send(buildConfig(timestamp));
      ws.send(buildSsml(requestId, timestamp, text, voice, rate));
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } else if (event.data instanceof ArrayBuffer) {
        const audio = extractAudio(event.data);
        if (audio) {
          // Envoi immédiat des données audio au client (Google Home)
          controller.enqueue(new Uint8Array(audio));
        }
      }
    });

    ws.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket error to Edge TTS"));
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      clearTimeout(timeout);
      // Si la fermeture est normale (provoquée par turn.end), resolve a déjà été appelé
    });
  });
}

function buildConfig(timestamp: string): string {
  return (
    `X-Timestamp:${timestamp}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: false,
              wordBoundaryEnabled: false,
            },
            // On demande du PCM RAW 24kHz 16bit mono
            outputFormat: "raw-24khz-16bit-mono-pcm",
          },
        },
      },
    })
  );
}

function buildSsml(
  requestId: string,
  timestamp: string,
  text: string,
  voice: FrenchVoice,
  rate: string,
): string {
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${timestamp}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='fr-FR'>` +
    `<voice name='${voice}'><prosody rate='${rate}'>` +
    escapeXml(text) +
    `</prosody></voice></speak>`
  );
}

function extractAudio(data: ArrayBuffer): ArrayBuffer | null {
  const view = new Uint8Array(data);
  for (let i = 0; i < view.length - 3; i++) {
    if (
      view[i] === 13 &&
      view[i + 1] === 10 &&
      view[i + 2] === 13 &&
      view[i + 3] === 10
    ) {
      const end = i + 4;
      if (end < view.length) return data.slice(end);
    }
  }
  return null;
}

function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rem = text;
  while (rem.length > max) {
    let cut = rem.lastIndexOf(". ", max);
    if (cut === -1) cut = rem.lastIndexOf(" ", max);
    if (cut === -1) cut = max;
    chunks.push(rem.slice(0, cut + 1).trim());
    rem = rem.slice(cut + 1).trim();
  }
  if (rem) chunks.push(rem);
  return chunks;
}

function escapeXml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function computeSecMsGec(): Promise<string> {
  const EPOCH_OFFSET = 11644473600n;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const windowsTicks = (nowSeconds + EPOCH_OFFSET) * 10_000_000n;
  const FIVE_MINUTES = 3_000_000_000n;
  const rounded = (windowsTicks / FIVE_MINUTES) * FIVE_MINUTES;

  const input = `${rounded}${TRUSTED_CLIENT_TOKEN}`;
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}