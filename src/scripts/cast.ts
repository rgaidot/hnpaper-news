/**
 * cast.ts — Google Cast Manager pour HNPaper
 *
 * Flux : text → Cloudflare Worker (Edge TTS) → MP3 → Chromecast → Google Home
 */

export type CastState =
  | "unavailable"  // Pas Chrome ou SDK non chargé
  | "idle"         // Prêt, pas de session
  | "loading"      // Génération audio en cours
  | "connecting"   // Connexion au Google Home
  | "playing"      // Lecture en cours
  | "paused"       // En pause
  | "error";       // Erreur

export type CastStateChangeCallback = (
  state: CastState,
  deviceName?: string
) => void;

export class CastManager {
  private workerUrl: string;
  private state: CastState = "unavailable";
  private onStateChange?: CastStateChangeCallback;

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl.replace(/\/$/, "");
  }

  // ── Init ────────────────────────────────────────────────────────────────

  init(onStateChange?: CastStateChangeCallback): void {
    this.onStateChange = onStateChange;

    // Cast SDK disponible uniquement dans Chrome
    if (!("chrome" in window)) {
      console.info("[Cast] Non disponible (pas Chrome)");
      this.setState("unavailable");
      return;
    }

    (window as any).__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) {
        this.setupContext();
      } else {
        console.warn("[Cast] SDK Cast non disponible");
        this.setState("unavailable");
      }
    };

    // Injection du SDK Cast (une seule fois)
    if (!document.querySelector('script[src*="cast_sender"]')) {
      const script = document.createElement("script");
      script.src =
        "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";
      document.head.appendChild(script);
    }
  }

  private setupContext(): void {
    const ctx = cast.framework.CastContext.getInstance();
    ctx.setOptions({
      receiverApplicationId:
        chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    ctx.addEventListener(
      cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
      (e: cast.framework.SessionStateEventData) => {
        const S = cast.framework.SessionState;
        switch (e.sessionState) {
          case S.SESSION_STARTED:
          case S.SESSION_RESUMED:
            this.setState("connecting");
            break;
          case S.SESSION_ENDED:
            this.setState("idle");
            break;
          case S.SESSION_START_FAILED:
            this.setState("idle");
            break;
        }
      }
    );

    this.setState("idle");
    console.info("[Cast] SDK initialisé ✓");
  }

  // ── API publique ─────────────────────────────────────────────────────────

  async speak(text: string, rate = "+0%"): Promise<void> {
    console.log("[Cast] speak() called with text length:", text.length);
    if (this.state === "unavailable") {
      throw new Error("Cast non disponible dans ce navigateur");
    }

    this.setState("loading");

    try {
      console.log("[Cast] Generating audio URL from worker:", this.workerUrl);
      const audioUrl = await this.generateAudioUrl(text, rate);
      console.log("[Cast] Audio URL generated:", audioUrl);

      this.setState("connecting");
      const session = await this.getOrRequestSession();
      console.log("[Cast] Session object:", session);
      console.log("[Cast] Session ID:", session.sessionId);
      console.log("[Cast] Session Status:", session.statusText);

      // Utiliser audio/wav (PCM encapsulé) pour une meilleure compatibilité streaming/concaténation
      const mediaInfo = new chrome.cast.media.MediaInfo(audioUrl, "audio/wav");
      mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED; // ou LIVE si on veut empêcher le seek
      const meta = new chrome.cast.media.GenericMediaMetadata();
      (meta as any).title = "HNPaper News";

      (meta as any).subtitle = text.slice(0, 100) + (text.length > 100 ? "…" : "");
      mediaInfo.metadata = meta;

      const loadRequest = new chrome.cast.media.LoadRequest(mediaInfo);
      loadRequest.autoplay = true;

      console.log("[Cast] Loading media...");
      
      // Timeout de 15s pour le chargement
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Load media timeout (15s)"));
        }, 15000);

        try {
          session.loadMedia(
            loadRequest,
            (media) => {
              clearTimeout(timeout);
              console.log("[Cast] Media loaded successfully", media);
              resolve();
            },
            (errorCode) => {
              clearTimeout(timeout);
              console.error("[Cast] Load media failed, code:", errorCode);
              reject(new Error(`Load failed: ${errorCode}`));
            }
          );
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      const deviceName = this.getDeviceName();
      this.setState("playing", deviceName);
      this.watchPlayback(session);
    } catch (err) {
      console.error("[Cast] Error in speak():", err);
      this.setState("error");
      throw err;
    }
  }

  togglePause(): void {
    const media = this.getMediaSession();
    if (!media) return;

    if (media.playerState === chrome.cast.media.PlayerState.PLAYING) {
      media.pause(
        new chrome.cast.media.PauseRequest(),
        () => this.setState("paused", this.getDeviceName()),
        null
      );
    } else {
      media.play(
        new chrome.cast.media.PlayRequest(),
        () => this.setState("playing", this.getDeviceName()),
        null
      );
    }
  }

  stop(): void {
    cast.framework.CastContext.getInstance().getCurrentSession()?.endSession(true);
    this.setState("idle");
  }

  getState(): CastState {
    return this.state;
  }

  isAvailable(): boolean {
    return this.state !== "unavailable";
  }

  // ── Privé ────────────────────────────────────────────────────────────────

  private async generateAudioUrl(text: string, rate: string): Promise<string> {
    const response = await fetch(`${this.workerUrl}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 50_000),
        voice: "fr-FR-DeniseNeural",
        rate,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Worker TTS ${response.status}: ${err}`);
    }

    const data = await response.json<{ streamUrl: string; id: string }>();
    return data.streamUrl;
  }

  private async getOrRequestSession(): Promise<cast.framework.CastSession> {
    const ctx = cast.framework.CastContext.getInstance();
    let session = ctx.getCurrentSession();
    if (!session) {
      await ctx.requestSession();
      session = ctx.getCurrentSession();
    }
    if (!session) {
      throw new Error("Impossible d'établir une session Cast");
    }
    return session;
  }

  private getMediaSession(): chrome.cast.media.Media | null {
    return (
      cast.framework.CastContext.getInstance()
        .getCurrentSession()
        ?.getMediaSession() ?? null
    );
  }

  private getDeviceName(): string {
    return (
      cast.framework.CastContext.getInstance()
        .getCurrentSession()
        ?.getCastDevice()
        ?.friendlyName ?? "Google Home"
    );
  }

  private watchPlayback(session: cast.framework.CastSession): void {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const media = session.getMediaSession();
      
      // Tolérance de 3 secondes au démarrage pour laisser le temps au média de charger
      if (!media && attempts < 4) return;

      if (!media) {
        console.warn("[Cast] No media session found after timeout");
        clearInterval(interval);
        this.setState("idle");
        return;
      }
      
      const ps = chrome.cast.media.PlayerState;
      // Tolérance aussi pour l'état IDLE au tout début (buffering)
      if (media.playerState === ps.IDLE && attempts < 4) return;

      if (media.playerState === ps.IDLE) {
        console.info("[Cast] PlayerState is IDLE, ending session");
        clearInterval(interval);
        this.setState("idle");
      } else if (media.playerState === ps.PAUSED) {
        this.setState("paused", this.getDeviceName());
      } else if (media.playerState === ps.PLAYING || media.playerState === ps.BUFFERING) {
        this.setState("playing", this.getDeviceName());
      }
    }, 1000);
  }

  private setState(state: CastState, deviceName?: string): void {
    this.state = state;
    this.onStateChange?.(state, deviceName);
  }
}
