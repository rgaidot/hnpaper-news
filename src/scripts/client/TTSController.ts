export type TTSState = "stopped" | "playing" | "paused" | "error";

export interface TTSOptions {
  container: HTMLElement;
  articleContentSelector: string;
  onStateChange?: (state: TTSState) => void;
}

interface VTTCue {
  start: number;
  end: number;
  text: string;
}

export class TTSController {
  private container: HTMLElement;
  private articleContent: HTMLElement | null;
  private playPauseBtn: HTMLButtonElement | null;
  private stopBtn: HTMLButtonElement | null;
  private castBtns: HTMLButtonElement[] = [];
  private speedSelect: HTMLSelectElement | null;
  private readingTimeEl: HTMLElement | null;

  private utterance: SpeechSynthesisUtterance | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private vttCues: VTTCue[] = [];

  private state: TTSState = "stopped";
  private wakeLock: any = null;
  private silentAudio: HTMLAudioElement | null = null;
  private readonly SILENT_AUDIO_URL =
    "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAA8N8WAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF";

  private wordMap: { start: number; end: number; element: HTMLElement }[] = [];

  // cueIndex → indices into wordMap (one cue may cover N words: e.g. "15 travailleurs")
  private cueToWordIndices: Map<number, number[]> = new Map();

  // Last active cue index — prevents clearHighlight during micro-gaps between cues
  private lastActiveCueIndex: number = -1;

  private sentences: { text: string; start: number }[] = [];
  private fullText: string = "";
  private titleText: string = "";
  private slug: string = "";

  private currentSentenceIndex: number = 0;
  private currentCharIndex: number = 0;

  private castContext: any = null;
  private castSession: any = null;
  private remotePlayer: any = null;
  private remotePlayerController: any = null;

  constructor(options: TTSOptions) {
    this.container = options.container;
    this.articleContent = document.querySelector(
      options.articleContentSelector,
    );

    this.playPauseBtn = this.container.querySelector(".play-pause-tts");
    this.stopBtn = this.container.querySelector(".stop-tts");

    const localCastBtn = this.container.querySelector(
      ".cast-tts",
    ) as HTMLButtonElement | null;
    const globalCastBtn = document.getElementById(
      "cast-button",
    ) as HTMLButtonElement | null;
    if (localCastBtn) this.castBtns.push(localCastBtn);
    if (globalCastBtn && !this.castBtns.includes(globalCastBtn))
      this.castBtns.push(globalCastBtn);

    this.speedSelect = this.container.querySelector(".tts-speed");
    this.readingTimeEl = this.container.querySelector(".tts-reading-time");
    this.titleText = (this.container.getAttribute("data-title") || "") + ". ";
    this.slug = this.container.getAttribute("data-slug") || "";

    this.audioElement = document.getElementById(
      "audio-player",
    ) as HTMLAudioElement;

    if (!this.audioElement) {
      this.silentAudio = document.createElement("audio");
      this.silentAudio.src = this.SILENT_AUDIO_URL;
      this.silentAudio.volume = 0.001;
      this.silentAudio.setAttribute("playsinline", "");
      document.body.appendChild(this.silentAudio);
    }

    this.init();
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  private init() {
    if (!this.playPauseBtn || !this.stopBtn || !this.speedSelect) return;

    this.bindEvents();
    this.initializeCast();

    if (this.audioElement) {
      this.bindAudioEvents();
      this.prepareContent(); // synchronous — DOM is already ready
      this.loadVTT(); // async — calls buildCueMappingByText() when done
    } else {
      this.prepareContent();
    }

    window.addEventListener("google-cast-available", () =>
      this.initializeCast(),
    );
    window.addEventListener("tts:cmd:play", () => this.play());
    window.addEventListener("tts:cmd:pause", () => this.pause());
    window.addEventListener("tts:cmd:toggle", () => this.toggle());
    window.addEventListener("tts:cmd:stop", () => this.stop());
    window.addEventListener("tts:cmd:play-section", (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail?.element) this.playFromElement(ce.detail.element);
    });

    this.articleContent?.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("tts-word")) this.playFromElement(target);
    });
  }

  // ── VTT ───────────────────────────────────────────────────────────────────

  private loadVTT() {
    fetch(`/audio/${this.slug}.vtt`)
      .then((res) => res.text())
      .then((text) => {
        this.parseVTT(text);
        this.buildCueMappingByText();
      })
      .catch((err) => console.error("[TTS] Failed to load VTT", err));
  }

  private parseVTT(vttText: string) {
    const lines = vttText.split("\n");
    const cues: VTTCue[] = [];
    let currentCue: Partial<VTTCue> | null = null;
    const timeRegex = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line === "WEBVTT" || line === "") continue;
      if (/^\d+$/.test(line)) continue; // skip cue sequence numbers

      if (line.includes("-->")) {
        const [startStr, endStr] = line.split("-->").map((s) => s.trim());
        const parseTime = (str: string) => {
          const m = str.match(timeRegex);
          if (!m) return 0;
          return (
            parseInt(m[1]) * 3600 +
            parseInt(m[2]) * 60 +
            parseInt(m[3]) +
            parseInt(m[4]) / 1000
          );
        };
        currentCue = { start: parseTime(startStr), end: parseTime(endStr) };
      } else if (currentCue && currentCue.text === undefined) {
        currentCue.text = line;
        cues.push(currentCue as VTTCue);
        currentCue = null;
      }
    }
    this.vttCues = cues;
  }

  /**
   * Normalizes a word for comparison: lowercase, no punctuation,
   * no Unicode quotes, no typographic apostrophes.
   */
  private normalizeWord(w: string): string {
    return w
      .toLowerCase()
      .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035']/g, "") // typographic apostrophes
      .replace(/[\u201c\u201d\u00ab\u00bb"]/g, "") // quotation marks
      .replace(/[.,!?;:\-\(\)\[\]{}]/g, "") // common punctuation
      .replace(/\u2026/g, "") // ellipsis …
      .trim();
  }

  /**
   * Aligns VTT cues onto DOM spans by text comparison.
   *
   * Bidirectional sliding-window algorithm (LOOKAHEAD):
   * - If the current words match → link them and advance both cursors.
   * - Otherwise, look LOOKAHEAD tokens ahead in each sequence to find
   *   which side has a spurious token (isolated punctuation, merged number,
   *   etc.) and advance only that cursor.
   * - Result: resilient against isolated desynchronizations.
   */
  private buildCueMappingByText() {
    this.cueToWordIndices.clear();
    if (this.vttCues.length === 0 || this.wordMap.length === 0) return;

    const LOOKAHEAD = 4;

    // ── 1. Flatten all words from all cues ────────────────────────────────
    const cueWords: { cueIdx: number; word: string; norm: string }[] = [];
    for (let i = 0; i < this.vttCues.length; i++) {
      for (const w of this.vttCues[i].text
        .trim()
        .split(/\s+/)
        .filter(Boolean)) {
        cueWords.push({ cueIdx: i, word: w, norm: this.normalizeWord(w) });
      }
    }

    // ── 2. Build the normalized wordMap sequence ──────────────────────────
    const mapWords = this.wordMap.map((entry, idx) => ({
      idx,
      norm: this.normalizeWord(entry.element.textContent || ""),
    }));

    // ── 3. Find the starting point: locate wordMap[0] in cueWords
    //       (skips title cues that precede the article body)
    let cueWordCursor = 0;
    const firstNorm = mapWords[0].norm;

    while (cueWordCursor < cueWords.length) {
      if (cueWords[cueWordCursor].norm === firstNorm) break;
      cueWordCursor++;
    }

    if (cueWordCursor >= cueWords.length) {
      console.warn(
        "[TTS] buildCueMappingByText: could not find content start in VTT.",
      );
      return;
    }

    // ── 4. Sequential alignment with lookahead ────────────────────────────
    let mapCursor = 0;

    while (cueWordCursor < cueWords.length && mapCursor < mapWords.length) {
      const cNorm = cueWords[cueWordCursor].norm;
      const mNorm = mapWords[mapCursor].norm;

      if (cNorm === mNorm) {
        // Perfect match — link cue to wordMap entry
        const cueIdx = cueWords[cueWordCursor].cueIdx;
        if (!this.cueToWordIndices.has(cueIdx))
          this.cueToWordIndices.set(cueIdx, []);
        this.cueToWordIndices.get(cueIdx)!.push(mapWords[mapCursor].idx);
        cueWordCursor++;
        mapCursor++;
      } else {
        // Mismatch — look ahead to find which side has a spurious token
        let advanceCue = false;
        let advanceMap = false;

        for (let d = 1; d <= LOOKAHEAD; d++) {
          // VTT has an extra token → advance cueWordCursor
          if (
            cueWordCursor + d < cueWords.length &&
            cueWords[cueWordCursor + d].norm === mNorm
          ) {
            advanceCue = true;
            break;
          }
          // DOM has an extra token → advance mapCursor
          if (
            mapCursor + d < mapWords.length &&
            mapWords[mapCursor + d].norm === cNorm
          ) {
            advanceMap = true;
            break;
          }
        }

        if (advanceCue) {
          cueWordCursor++; // skip spurious VTT token
        } else if (advanceMap) {
          mapCursor++; // skip spurious DOM token
        } else {
          // No match found within the window — desync too large, advance both
          cueWordCursor++;
          mapCursor++;
        }
      }
    }

    const mapped = this.cueToWordIndices.size;
    console.debug(
      `[TTS] CueMapping: ${mapped} cues mapped out of ${this.vttCues.length}, ` +
        `${mapCursor}/${mapWords.length} DOM words covered`,
    );
  }

  // ── Audio events ──────────────────────────────────────────────────────────

  private bindAudioEvents() {
    if (!this.audioElement) return;

    this.audioElement.addEventListener("play", () =>
      this.updateState("playing"),
    );
    this.audioElement.addEventListener("pause", () =>
      this.updateState("paused"),
    );
    this.audioElement.addEventListener("ended", () => this.stop());
    this.audioElement.addEventListener("error", () =>
      this.updateState("error"),
    );

    this.audioElement.addEventListener("timeupdate", () => {
      if (this.vttCues.length === 0) return;

      const t = this.audioElement!.currentTime;

      // Binary search — faster than findIndex on hundreds of cues
      const found = this.findCueAtTime(t);

      // If no active cue (gap between words), do NOT touch the highlight.
      // The last highlighted word stays visible until the next cue fires.
      if (found === -1 || found === this.lastActiveCueIndex) return;

      this.lastActiveCueIndex = found;

      const indices = this.cueToWordIndices.get(found);
      if (indices?.length) {
        this.highlightElements(indices.map((i) => this.wordMap[i].element));
      }
      // If the cue belongs to the title (not in cueToWordIndices), do nothing
    });
  }

  /**
   * Binary search for the active cue at a given playback time.
   * Returns -1 if no cue covers the current time.
   */
  private findCueAtTime(t: number): number {
    let lo = 0;
    let hi = this.vttCues.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cue = this.vttCues[mid];
      if (t < cue.start) {
        hi = mid - 1;
      } else if (t > cue.end) {
        lo = mid + 1;
      } else {
        return mid;
      }
    }
    return -1;
  }

  // ── Cast ──────────────────────────────────────────────────────────────────

  private initializeCast() {
    const cast = (window as any).cast;
    const chrome = (window as any).chrome;
    if (!cast || !cast.framework || this.castContext) return;

    try {
      this.castContext = cast.framework.CastContext.getInstance();
      this.castContext.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });

      this.castBtns.forEach((btn) => {
        btn.classList.remove("hidden");
        btn.addEventListener("click", () => {
          this.castContext.requestSession().then(
            (s: any) => console.log("Cast session ok", s),
            (e: any) => console.error("Cast session failed", e),
          );
        });
      });

      this.remotePlayer = new cast.framework.RemotePlayer();
      this.remotePlayerController = new cast.framework.RemotePlayerController(
        this.remotePlayer,
      );

      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        () => {
          if (this.remotePlayer.isConnected) {
            this.castSession = this.castContext.getCurrentSession();
            this.audioElement?.pause();
            this.stop();
            this.loadRemoteMedia();
            this.updateState("playing");
            this.castBtns.forEach((b) => b.classList.add("text-blue-500"));
          } else {
            this.castSession = null;
            this.updateState("stopped");
            this.castBtns.forEach((b) => b.classList.remove("text-blue-500"));
          }
        },
      );

      this.remotePlayerController.addEventListener(
        cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
        () => {
          const ps = this.remotePlayer.playerState;
          if (ps === chrome.cast.media.PlayerState.PLAYING)
            this.updateState("playing");
          else if (ps === chrome.cast.media.PlayerState.PAUSED)
            this.updateState("paused");
          else if (ps === chrome.cast.media.PlayerState.IDLE)
            this.updateState("stopped");
        },
      );
    } catch (e) {
      console.error("Cast init error", e);
    }
  }

  private loadRemoteMedia() {
    if (!this.castSession || !this.slug) return;
    const chrome = (window as any).chrome;
    const origin = window.location.origin;

    const mediaInfo = new chrome.cast.media.MediaInfo(
      `${origin}/audio/${this.slug}.mp3`,
      "audio/mpeg",
    );
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = this.titleText.replace(/\.\s*$/, "");
    mediaInfo.metadata.artist = "HNPaper News";
    mediaInfo.metadata.images = [
      new chrome.cast.Image(`${origin}/pwa-512x512.png`),
    ];

    const track = new chrome.cast.media.Track(
      1,
      chrome.cast.media.TrackType.TEXT,
    );
    track.trackContentId = `${origin}/audio/${this.slug}.vtt`;
    track.trackContentType = "text/vtt";
    track.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
    track.name = "French";
    track.language = "fr-FR";
    track.customData = null;
    mediaInfo.tracks = [track];

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.activeTrackIds = [1];
    this.castSession.loadMedia(request).then(
      () => {},
      (e: any) => console.error("[TTS] Remote media error:", e),
    );
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  private bindEvents() {
    this.playPauseBtn?.addEventListener("click", () => this.toggle());
    this.stopBtn?.addEventListener("click", () => this.stop());
    this.speedSelect?.addEventListener("change", () => this.updateSpeed());
  }

  public toggle() {
    if (this.state === "playing") this.pause();
    else if (this.state === "paused") this.resume();
    else this.play();
  }

  public play() {
    if (this.remotePlayer?.isConnected) {
      if (
        this.remotePlayer.playerState ===
        (window as any).chrome.cast.media.PlayerState.IDLE
      )
        this.loadRemoteMedia();
      else this.remotePlayerController.playOrPause();
      return;
    }

    if (this.audioElement) {
      this.updateState("playing");
      this.requestWakeLock();
      this.setupMediaSession();
      this.audioElement
        .play()
        .catch((e) => console.error("Audio play failed", e));
      return;
    }

    if (!window.speechSynthesis) {
      this.updateState("error");
      return;
    }
    if (this.sentences.length === 0) this.prepareContent();
    if (this.sentences.length === 0) return;

    this.updateState("playing");
    this.requestWakeLock();
    this.setupMediaSession();
    if (this.silentAudio) {
      this.silentAudio.currentTime = 0;
      this.silentAudio
        .play()
        .catch((e) => console.warn("Silent audio failed", e));
    }
    this.speakSentence();
  }

  public pause() {
    if (this.remotePlayer?.isConnected) {
      this.remotePlayerController.playOrPause();
      return;
    }
    if (this.audioElement) {
      this.audioElement.pause();
      this.updateState("paused");
      this.releaseWakeLock();
      return;
    }
    if (this.state === "playing") {
      this.updateState("paused");
      this.releaseWakeLock();
      if (this.silentAudio) {
        this.silentAudio.pause();
        this.silentAudio.currentTime = 0;
      }
      window.speechSynthesis.cancel();
    }
  }

  public resume() {
    if (this.remotePlayer?.isConnected) {
      this.remotePlayerController.playOrPause();
      return;
    }
    if (this.audioElement) {
      this.updateState("playing");
      this.requestWakeLock();
      this.audioElement.play();
      return;
    }
    if (this.state === "paused") {
      this.updateState("playing");
      this.requestWakeLock();
      if (this.silentAudio) {
        this.silentAudio.currentTime = 0;
        this.silentAudio
          .play()
          .catch((e) => console.warn("Silent audio failed", e));
      }
      this.speakSentence();
    }
  }

  public stop() {
    if (this.remotePlayer?.isConnected) {
      this.remotePlayerController.stop();
      return;
    }

    this.updateState("stopped");
    this.releaseWakeLock();
    this.lastActiveCueIndex = -1;

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
    }
    if (this.silentAudio) {
      this.silentAudio.pause();
      this.silentAudio.currentTime = 0;
    }

    window.speechSynthesis.cancel();
    this.clearHighlight();
    this.currentSentenceIndex = 0;
    this.currentCharIndex = 0;
  }

  private playFromElement(element: HTMLElement) {
    if (this.sentences.length === 0) this.prepareContent();

    const match = this.wordMap.find(
      (w) => w.element === element || element.contains(w.element),
    );
    if (!match) return;

    if (this.audioElement) {
      const mapIndex = this.wordMap.indexOf(match);

      // Reverse lookup: find the cue that contains this wordMap index
      let targetCueIndex = -1;
      for (const [cueIdx, indices] of this.cueToWordIndices.entries()) {
        if (indices.includes(mapIndex)) {
          targetCueIndex = cueIdx;
          break;
        }
      }

      // Fallback: if mapping missed this word, search by text comparison
      if (targetCueIndex === -1) {
        const clickedNorm = this.normalizeWord(element.textContent || "");
        targetCueIndex = this.vttCues.findIndex((cue) =>
          cue.text
            .trim()
            .split(/\s+/)
            .some((w) => this.normalizeWord(w) === clickedNorm),
        );
        console.warn(
          `[TTS] Fallback seek for "${element.textContent}" → cue #${targetCueIndex}`,
        );
      }

      if (targetCueIndex !== -1) {
        this.lastActiveCueIndex = -1; // force highlight refresh
        this.audioElement.currentTime = this.vttCues[targetCueIndex].start;
        this.audioElement.play();
        this.updateState("playing");
      }
      return;
    }

    // Fallback: speech synthesis path
    const globalIndex = this.titleText.length + match.start;
    const sIdx = this.sentences.findIndex(
      (s) => globalIndex >= s.start && globalIndex < s.start + s.text.length,
    );
    if (sIdx !== -1) {
      this.currentSentenceIndex = sIdx;
      this.currentCharIndex = globalIndex;
      window.speechSynthesis.cancel();
      this.updateState("playing");
      this.speakSentence();
    }
  }

  // ── Content preparation ───────────────────────────────────────────────────

  private prepareContent() {
    if (!this.articleContent) return;
    if (!this.articleContent.querySelector(".tts-word")) this.wrapWords();
    this.buildWordMap();
    this.segmentSentences();
    // If VTT was already loaded before prepareContent (rare), rebuild the mapping
    if (this.vttCues.length > 0) this.buildCueMappingByText();
  }

  private wrapWords() {
    if (!this.articleContent) return;

    const ignorePatterns = [
      /^\s*Discussion HN\s*:/i,
      /^\s*Article source\s*:/i,
    ];
    this.articleContent
      .querySelectorAll("li, p, h1, h2, h3, h4, h5, h6")
      .forEach((el) => {
        if (ignorePatterns.some((p) => p.test(el.textContent || "")))
          el.classList.add("tts-ignore");
      });
    this.articleContent
      .querySelectorAll("pre")
      .forEach((el) => el.classList.add("tts-ignore"));

    const walker = document.createTreeWalker(
      this.articleContent,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) =>
          node.parentElement?.closest(".tts-ignore")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      },
    );

    const nodesToReplace: Text[] = [];
    while (walker.nextNode()) nodesToReplace.push(walker.currentNode as Text);

    nodesToReplace.forEach((node) => {
      const text = node.textContent || "";
      if (!text.trim()) return;
      const fragment = document.createDocumentFragment();
      text.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/\s+/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
        } else {
          const span = document.createElement("span");
          span.textContent = part;
          span.className = "tts-word";
          fragment.appendChild(span);
        }
      });
      node.parentNode?.replaceChild(fragment, node);
    });
  }

  private buildWordMap() {
    if (!this.articleContent) return;
    this.wordMap = [];
    let runningText = "";
    this.articleContent.querySelectorAll(".tts-word").forEach((span) => {
      if (span.closest(".tts-ignore")) return;
      const word = span.textContent || "";
      this.wordMap.push({
        start: runningText.length,
        end: runningText.length + word.length,
        element: span as HTMLElement,
      });
      runningText += word + " ";
    });
    this.fullText = this.titleText + runningText;
  }

  private segmentSentences() {
    if (!this.fullText) return;
    let segments: string[];
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const seg = new Intl.Segmenter("fr", { granularity: "sentence" });
      segments = Array.from(seg.segment(this.fullText)).map((s) => s.segment);
    } else {
      segments = this.fullText.match(/[\s\S]*?[.!?]+(?:\s+|$)|[\s\S]+$/g) || [
        this.fullText,
      ];
    }
    let cursor = 0;
    this.sentences = segments.map((t) => {
      const entry = { text: t, start: cursor };
      cursor += t.length;
      return entry;
    });
  }

  // ── Speech synthesis fallback ─────────────────────────────────────────────

  private speakSentence() {
    if (this.currentSentenceIndex >= this.sentences.length) {
      this.stop();
      return;
    }

    const sentence = this.sentences[this.currentSentenceIndex];
    if (
      this.currentCharIndex < sentence.start ||
      this.currentCharIndex >= sentence.start + sentence.text.length
    )
      this.currentCharIndex = sentence.start;

    const localOffset = Math.max(0, this.currentCharIndex - sentence.start);
    const textToSpeak = sentence.text.substring(localOffset);
    if (!textToSpeak.trim()) {
      this.currentSentenceIndex++;
      this.currentCharIndex = 0;
      this.speakSentence();
      return;
    }

    this.utterance = new SpeechSynthesisUtterance(textToSpeak);
    this.utterance.lang = "fr-FR";
    this.utterance.rate = parseFloat(this.speedSelect?.value || "1");

    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(
      (v) => v.lang.startsWith("fr") && !v.name.includes("Compact"),
    );
    if (frVoice) this.utterance.voice = frVoice;

    this.utterance.onboundary = (event) => {
      if (event.name === "word")
        this.highlightWord(event.charIndex + this.currentCharIndex);
    };
    this.utterance.onend = () => {
      if (this.state === "playing") {
        this.currentSentenceIndex++;
        this.currentCharIndex = 0;
        this.speakSentence();
      }
    };
    this.utterance.onerror = (e) => {
      console.error("TTS Error", e);
      if (this.state === "playing" && e.error !== "interrupted") this.stop();
    };

    window.speechSynthesis.speak(this.utterance);
  }

  private highlightWord(charIndex: number) {
    if (charIndex < this.titleText.length) return;
    const rel = charIndex - this.titleText.length;
    const match = this.wordMap.find((w) => rel >= w.start - 1 && rel < w.end);
    if (match) this.highlightElements([match.element]);
  }

  // ── Highlight ─────────────────────────────────────────────────────────────

  /**
   * Highlights all provided elements simultaneously.
   * Handles multi-word cues (e.g. "15" and "travailleurs" light up together).
   * Auto-scrolls to the first element if it is outside the viewport.
   */
  private highlightElements(elements: HTMLElement[]) {
    this.clearHighlight();
    elements.forEach((el) => el.classList.add("tts-active"));

    const first = elements[0];
    if (first) {
      const rect = first.getBoundingClientRect();
      if (rect.top < 60 || rect.bottom > window.innerHeight - 60) {
        first.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }

  private clearHighlight() {
    this.articleContent
      ?.querySelectorAll(".tts-active")
      .forEach((el) => el.classList.remove("tts-active"));
  }

  // ── Speed & state ─────────────────────────────────────────────────────────

  private updateSpeed() {
    const newRate = parseFloat(this.speedSelect?.value || "1");
    if (this.readingTimeEl?.dataset.baseTime) {
      this.readingTimeEl.textContent = `${Math.ceil(
        parseFloat(this.readingTimeEl.dataset.baseTime) / newRate,
      )} min`;
    }
    window.dispatchEvent(
      new CustomEvent("tts:speed-changed", { detail: { speed: newRate } }),
    );
    if (this.audioElement) this.audioElement.playbackRate = newRate;
    if (this.state === "playing" && !this.audioElement) {
      window.speechSynthesis.cancel();
      this.speakSentence();
    }
  }

  private setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.titleText.replace(/\.\s*$/, ""),
      artist: "HNPaper News",
      album: "Tech News",
      artwork: [
        { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    navigator.mediaSession.setActionHandler("play", () => this.resume());
    navigator.mediaSession.setActionHandler("pause", () => this.pause());
    navigator.mediaSession.setActionHandler("stop", () => this.stop());
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      window.dispatchEvent(new Event("tts:cmd:nav-prev")),
    );
    navigator.mediaSession.setActionHandler("nexttrack", () =>
      window.dispatchEvent(new Event("tts:cmd:nav-next")),
    );
  }

  private async requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request("screen");
      } catch (err) {
        console.warn("Wake Lock error:", err);
      }
    }
  }

  private async releaseWakeLock() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {
        console.warn("Wake Lock release error:", err);
      }
    }
  }

  private updateState(newState: TTSState) {
    this.state = newState;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState =
        newState === "playing"
          ? "playing"
          : newState === "paused"
            ? "paused"
            : "none";
    }

    window.dispatchEvent(
      new CustomEvent("tts:state-changed", { detail: { state: newState } }),
    );
    if (!this.playPauseBtn || !this.stopBtn) return;

    if (newState === "playing") {
      this.playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-label="Pause" title="Pause">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
      this.stopBtn.classList.remove("hidden");
    } else if (newState === "paused") {
      this.playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-label="Resume" title="Resume">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
      this.stopBtn.classList.remove("hidden");
    } else if (newState === "stopped") {
      this.playPauseBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-label="Play" title="Play">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>`;
      this.stopBtn.classList.add("hidden");
    } else if (newState === "error") {
      this.stopBtn.classList.add("hidden");
    }
  }
}
