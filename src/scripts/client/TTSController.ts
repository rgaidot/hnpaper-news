export type TTSState = "stopped" | "playing" | "paused" | "error";

export interface TTSOptions {
  container: HTMLElement;
  articleContentSelector: string;
  onStateChange?: (state: TTSState) => void;
}

export class TTSController {
  private container: HTMLElement;
  private articleContent: HTMLElement | null;
  private playPauseBtn: HTMLButtonElement | null;
  private stopBtn: HTMLButtonElement | null;
  private speedSelect: HTMLSelectElement | null;
  private statusEl: HTMLElement | null;
  private readingTimeEl: HTMLElement | null;

  private utterance: SpeechSynthesisUtterance | null = null;
  private state: TTSState = "stopped";
  private wakeLock: any = null;
  private silentAudio: HTMLAudioElement | null = null;
  private readonly SILENT_AUDIO_URL =
    "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjIwLjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMD//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAASAA8N8WAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF//OEZAAAAAA0gAAAAAAABAAAASAAADUAAAEAAAAAAAAAAABF";

  private wordMap: { start: number; end: number; element: HTMLElement }[] = [];
  private sentences: { text: string; start: number }[] = [];
  private fullText: string = "";
  private titleText: string = "";

  private currentSentenceIndex: number = 0;
  private currentCharIndex: number = 0;

  constructor(options: TTSOptions) {
    this.container = options.container;
    this.articleContent = document.querySelector(
      options.articleContentSelector,
    );

    this.playPauseBtn = this.container.querySelector(".play-pause-tts");
    this.stopBtn = this.container.querySelector(".stop-tts");
    this.speedSelect = this.container.querySelector(".tts-speed");
    this.statusEl = this.container.querySelector(".tts-status");
    this.readingTimeEl = this.container.querySelector(".tts-reading-time");

    this.titleText = (this.container.getAttribute("data-title") || "") + ". ";

    this.silentAudio = new Audio(this.SILENT_AUDIO_URL);
    this.silentAudio.loop = true;
    this.silentAudio.volume = 0.01;

    this.init();
  }

  private setupMediaSession() {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.titleText.replace(/\.\s*$/, ""),
        artist: "HNPaper News",
        album: "Actualités Tech",
        artwork: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      });

      navigator.mediaSession.setActionHandler("play", () => {
        this.resume();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        this.pause();
      });
      navigator.mediaSession.setActionHandler("stop", () => {
        this.stop();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        window.dispatchEvent(new Event("tts:cmd:nav-prev"));
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        window.dispatchEvent(new Event("tts:cmd:nav-next"));
      });
    }
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
    if (this.wakeLock !== null) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
      } catch (err) {
        console.warn("Wake Lock release error:", err);
      }
    }
  }

  private init() {
    if (!this.playPauseBtn || !this.stopBtn || !this.speedSelect) return;

    this.bindEvents();

    window.addEventListener("tts:cmd:play", () => this.play());
    window.addEventListener("tts:cmd:pause", () => this.pause());
    window.addEventListener("tts:cmd:toggle", () => this.toggle());
    window.addEventListener("tts:cmd:stop", () => this.stop());
    window.addEventListener("tts:cmd:play-section", (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.element) {
        this.playFromElement(customEvent.detail.element);
      }
    });

    if (this.articleContent) {
      this.articleContent.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("tts-word")) {
          this.playFromElement(target);
        }
      });
    }

    this.prepareContent();
  }

  private bindEvents() {
    this.playPauseBtn?.addEventListener("click", () => this.toggle());
    this.stopBtn?.addEventListener("click", () => this.stop());

    this.speedSelect?.addEventListener("change", () => {
      this.updateSpeed();
    });
  }

  public toggle() {
    if (this.state === "playing") {
      this.pause();
    } else if (this.state === "paused") {
      this.resume();
    } else {
      this.play();
    }
  }

  public play() {
    if (!window.speechSynthesis) {
      this.updateState("error");
      return;
    }

    if (this.sentences.length === 0) {
      this.prepareContent();
    }

    if (this.sentences.length === 0) return;

    this.updateState("playing");
    this.requestWakeLock();
    this.setupMediaSession();

    this.silentAudio
      ?.play()
      .catch((e) => console.warn("Silent audio play failed", e));

    this.speakSentence();
  }

  public pause() {
    if (this.state === "playing") {
      this.updateState("paused");
      this.releaseWakeLock();
      this.silentAudio?.pause();
      window.speechSynthesis.cancel();
    }
  }

  public resume() {
    if (this.state === "paused") {
      this.updateState("playing");
      this.requestWakeLock();
      this.silentAudio
        ?.play()
        .catch((e) => console.warn("Silent audio resume failed", e));
      this.speakSentence();
    }
  }

  public stop() {
    this.updateState("stopped");
    this.releaseWakeLock();

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

    if (match) {
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
  }

  private prepareContent() {
    if (!this.articleContent) return;

    if (!this.articleContent.querySelector(".tts-word")) {
      this.wrapWords();
    }

    this.buildWordMap();

    this.segmentSentences();
  }

  private wrapWords() {
    if (!this.articleContent) return;

    const ignorePatterns = [
      /^\s*Discussion HN\s*:/i,
      /^\s*Article source\s*:/i,
    ];

    const candidates = this.articleContent.querySelectorAll(
      "li, p, h1, h2, h3, h4, h5, h6",
    );
    candidates.forEach((el) => {
      if (ignorePatterns.some((p) => p.test(el.textContent || ""))) {
        el.classList.add("tts-ignore");
      }
    });

    const walker = document.createTreeWalker(
      this.articleContent,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.parentElement && node.parentElement.closest(".tts-ignore")) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const nodesToReplace: Text[] = [];
    while (walker.nextNode()) {
      nodesToReplace.push(walker.currentNode as Text);
    }

    nodesToReplace.forEach((node) => {
      const text = node.textContent || "";
      if (!text.trim()) return;

      const fragment = document.createDocumentFragment();
      const parts = text.split(/(\s+)/);

      parts.forEach((part) => {
        if (!part) return;
        if (part.match(/\s+/)) {
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

    const spans = this.articleContent.querySelectorAll(".tts-word");
    spans.forEach((span) => {
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

    let segments: string[] = [];
    if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
      const segmenter = new Intl.Segmenter("fr", { granularity: "sentence" });
      segments = Array.from(segmenter.segment(this.fullText)).map(
        (s) => s.segment,
      );
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

  private speakSentence() {
    if (this.currentSentenceIndex >= this.sentences.length) {
      this.stop();
      return;
    }

    const sentence = this.sentences[this.currentSentenceIndex];

    if (
      this.currentCharIndex < sentence.start ||
      this.currentCharIndex >= sentence.start + sentence.text.length
    ) {
      this.currentCharIndex = sentence.start;
    }

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
      if (event.name === "word") {
        const charIndex = event.charIndex + this.currentCharIndex;
        this.highlightWord(charIndex);
      }
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
      if (this.state === "playing" && e.error !== "interrupted") {
        this.stop();
      }
    };

    window.speechSynthesis.speak(this.utterance);
  }

  private highlightWord(charIndex: number) {
    if (charIndex < this.titleText.length) {
      this.clearHighlight();
      return;
    }

    const relativeIndex = charIndex - this.titleText.length;
    const match = this.wordMap.find(
      (w) => relativeIndex >= w.start - 1 && relativeIndex < w.end,
    );

    if (match) {
      this.clearHighlight();
      match.element.classList.add("tts-active");
      match.element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  private clearHighlight() {
    const active = this.articleContent?.querySelector(".tts-active");
    active?.classList.remove("tts-active");
  }

  private updateSpeed() {
    const newRate = parseFloat(this.speedSelect?.value || "1");

    if (this.readingTimeEl && this.readingTimeEl.dataset.baseTime) {
      const baseTime = parseFloat(this.readingTimeEl.dataset.baseTime);
      const newTime = Math.ceil(baseTime / newRate);
      this.readingTimeEl.textContent = `${newTime} min`;
    }

    window.dispatchEvent(
      new CustomEvent("tts:speed-changed", { detail: { speed: newRate } }),
    );

    if (this.state === "playing") {
      window.speechSynthesis.cancel();
      this.speakSentence();
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

    if (!this.playPauseBtn || !this.statusEl || !this.stopBtn) return;

    if (newState === "playing") {
      this.playPauseBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            `;
      this.stopBtn.classList.remove("hidden");
      this.statusEl.textContent = "Lecture en cours...";
    } else if (newState === "paused") {
      this.playPauseBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            `;
      this.stopBtn.classList.remove("hidden");
      this.statusEl.textContent = "En pause";
    } else if (newState === "stopped") {
      this.playPauseBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            `;
      this.stopBtn.classList.add("hidden");
      this.statusEl.textContent = "Prêt à lire";
    } else if (newState === "error") {
      this.statusEl.textContent = "Erreur TTS";
      this.stopBtn.classList.add("hidden");
    }
  }
}
