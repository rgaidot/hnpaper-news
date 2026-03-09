interface Section {
  element: HTMLElement;
}

export class ArticleNavigation {
  private sections: Section[] = [];
  private activeIndex: number = 0;
  private navContainer: HTMLElement | null;
  private prevBtn: HTMLButtonElement | null;
  private nextBtn: HTMLButtonElement | null;
  private scrollTopBtn: HTMLButtonElement | null;
  private playBtn: HTMLButtonElement | null;
  private currentSpan: HTMLElement | null;
  private totalSpan: HTMLElement | null;
  private playIcon: HTMLElement | null;
  private pauseIcon: HTMLElement | null;
  private speedBtn: HTMLElement | null;
  private isNavigating = false;
  private navigateTimeout: number | null = null;
  private observer: IntersectionObserver | null = null;
  private abortController: AbortController;

  constructor() {
    if ((window as any)._articleNavigationInstance) {
      (window as any)._articleNavigationInstance.destroy();
    }
    (window as any)._articleNavigationInstance = this;
    this.abortController = new AbortController();

    this.navContainer = document.getElementById("article-nav");
    this.prevBtn = document.getElementById(
      "prev-section-btn",
    ) as HTMLButtonElement;
    this.nextBtn = document.getElementById(
      "next-section-btn",
    ) as HTMLButtonElement;
    this.scrollTopBtn = document.getElementById(
      "scroll-to-top-btn",
    ) as HTMLButtonElement;
    this.playBtn = document.getElementById(
      "play-section-btn",
    ) as HTMLButtonElement;
    this.currentSpan = document.getElementById("current-section");
    this.totalSpan = document.getElementById("total-sections");
    this.playIcon = document.getElementById("play-icon");
    this.pauseIcon = document.getElementById("pause-icon");
    this.speedBtn = document.getElementById("floating-speed-btn");

    this.init();
  }

  private init() {
    if (!this.navContainer) return;

    this.scanSections();
    this.bindEvents();
    this.setupScrollSpy();
    this.handleInitialHash();
  }

  private scanSections() {
    const article =
      document.querySelector(".bento-grid") ||
      (document.querySelector(".prose") as HTMLElement);
    if (!article) return;

    this.sections = [];

    // Check for bento sections first
    const bentoSections = Array.from(
      article.querySelectorAll(".bento-section"),
    ) as HTMLElement[];

    if (bentoSections.length > 0) {
      bentoSections.forEach((section, index) => {
        this.sections.push({
          element: section,
        });
      });
    } else {
      // Fallback for non-bento or before-wrap state
      const hrs = Array.from(article.querySelectorAll("hr"));

      if (article.firstElementChild) {
        this.sections.push({
          element: article.firstElementChild as HTMLElement,
        });
      }

      hrs.forEach((hr) => {
        let nextEl = hr.nextElementSibling;
        while (nextEl && nextEl.tagName === "HR") {
          nextEl = nextEl.nextElementSibling;
        }
        if (nextEl) {
          this.sections.push({
            element: nextEl as HTMLElement,
          });
        }
      });
    }

    this.sections.forEach((section, index) => {
      if (!section.element) return;
      const sectionId = `section-${index + 1}`;
      section.element.id = sectionId;
      this.createAnchor(section.element, sectionId, index + 1);
    });

    if (this.totalSpan)
      this.totalSpan.textContent = this.sections.length.toString();

    if (this.sections.length > 1) {
      this.navContainer?.classList.remove("opacity-0");
      this.navContainer?.classList.add("opacity-100");
    }
  }

  private createAnchor(element: HTMLElement, id: string, labelIndex: number) {
    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }

    let targetForNumber = element;
    if (element.classList.contains("bento-section")) {
      targetForNumber =
        (element.querySelector("p, h2, h3, h4, h5, h6") as HTMLElement) ||
        element;
    }

    const numberSpan = document.createElement("span");
    numberSpan.className =
      "font-bold text-5xl text-stone-400/80 mr-3 select-none tts-ignore float-left leading-none mt-1 mb-1 font-serif";
    numberSpan.textContent = `${labelIndex}.`;
    targetForNumber.insertBefore(numberSpan, targetForNumber.firstChild);

    const anchorBtn = document.createElement("button");
    anchorBtn.className =
      "group absolute top-4 right-4 md:-ml-6 md:top-auto md:right-auto md:left-0 md:mt-2 p-1 text-stone-300 hover:text-stone-900 transition-colors hidden sm:inline-flex items-center justify-center cursor-pointer";
    anchorBtn.setAttribute("aria-label", `Lien vers la section ${labelIndex}`);
    anchorBtn.title = "Copier le lien de cette section";
    anchorBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
        `;

    anchorBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const url = new URL(window.location.href);
      url.hash = `#${id}`;
      navigator.clipboard.writeText(url.toString()).then(() => {
        const originalHTML = anchorBtn.innerHTML;
        anchorBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                `;
        setTimeout(() => {
          anchorBtn.innerHTML = originalHTML;
        }, 2000);
      });
    });

    element.insertBefore(anchorBtn, element.firstChild);
  }

  private bindEvents() {
    const signal = { signal: this.abortController.signal };

    this.prevBtn?.addEventListener("click", () => this.navigate(-1));
    this.nextBtn?.addEventListener("click", () => this.navigate(1));
    this.scrollTopBtn?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    this.playBtn?.addEventListener("click", () => {
      const isPlaying = !this.pauseIcon?.classList.contains("hidden");
      if (isPlaying) {
        window.dispatchEvent(new Event("tts:cmd:toggle"));
      } else {
        const currentSectionEl = this.sections[this.activeIndex]?.element;
        if (currentSectionEl) {
          window.dispatchEvent(
            new CustomEvent("tts:cmd:play-section", {
              detail: { element: currentSectionEl },
            }),
          );
        }
      }
    });

    window.addEventListener("tts:cmd:nav-next", () => this.navigate(1), signal);
    window.addEventListener("tts:cmd:nav-prev", () => this.navigate(-1), signal);

    window.addEventListener("tts:speed-changed", (e: Event) => {
      const ce = e as CustomEvent;
      if (this.speedBtn && ce.detail) {
        this.speedBtn.textContent = `${ce.detail.speed}x`;
      }
    }, signal);

    this.speedBtn?.addEventListener("click", (e) => {
      e.stopPropagation();

      const select = document.querySelector(".tts-speed") as HTMLSelectElement;
      if (select) {
        let nextIndex = select.selectedIndex + 1;
        if (nextIndex >= select.options.length) {
          nextIndex = 0;
        }
        select.selectedIndex = nextIndex;
        select.dispatchEvent(new Event("change"));
      }
    });

    window.addEventListener("tts:state-changed", (e: Event) => {
      const ce = e as CustomEvent;
      const state = ce.detail.state;
      if (state === "playing") {
        this.playIcon?.classList.add("hidden");
        this.pauseIcon?.classList.remove("hidden");
      } else {
        this.playIcon?.classList.remove("hidden");
        this.pauseIcon?.classList.add("hidden");
      }
    }, signal);

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      if (e.key === "ArrowLeft") {
        this.navigate(-1);
      } else if (e.key === "ArrowRight") {
        this.navigate(1);
      } else if (e.code === "Space") {
        e.preventDefault();
        window.dispatchEvent(new Event("tts:cmd:toggle"));
      }
    }, signal);

    document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("tts-word")) {
        const sectionEl = target.closest('[id^="section-"]');
        if (sectionEl && sectionEl.id) {
          const match = sectionEl.id.match(/^section-(\d+)$/);
          if (match) {
            const index = parseInt(match[1], 10) - 1;
            this.updateActiveIndex(index);
            history.pushState(null, '', `#${sectionEl.id}`);
          }
        }
      }
    }, signal);
  }

  private updateActiveIndex(newIndex: number) {
    if (newIndex !== this.activeIndex) {
      this.activeIndex = newIndex;
      if (this.currentSpan) {
        this.currentSpan.textContent = (this.activeIndex + 1).toString();
      }
      if (this.prevBtn) this.prevBtn.disabled = this.activeIndex <= 0;
      if (this.nextBtn) this.nextBtn.disabled = this.activeIndex >= this.sections.length - 1;
    }
  }

  private navigate(dir: number) {
    const targetIndex = this.activeIndex + dir;

    if (targetIndex >= 0 && targetIndex < this.sections.length) {
      // Bloquer temporairement le scroll spy pendant la navigation fluide
      this.isNavigating = true;
      if (this.navigateTimeout) clearTimeout(this.navigateTimeout);
      this.navigateTimeout = window.setTimeout(() => {
        this.isNavigating = false;
      }, 1000) as unknown as number;

      this.updateActiveIndex(targetIndex);
      this.scrollToSection(targetIndex);

      const isPlaying = !this.pauseIcon?.classList.contains("hidden");
      if (isPlaying) {
        const sectionEl = this.sections[targetIndex].element;
        window.dispatchEvent(
          new CustomEvent("tts:cmd:play-section", {
            detail: { element: sectionEl },
          }),
        );
      }
    }
  }

  private setupScrollSpy() {
    const options = {
      root: null,
      rootMargin: "-10% 0px -80% 0px",
      threshold: 0
    };

    let visibleSections: number[] = [];

    this.observer = new IntersectionObserver((entries) => {
      if (this.isNavigating) return;

      entries.forEach(entry => {
        const idMatch = entry.target.id.match(/^section-(\d+)$/);
        if (idMatch) {
          const index = parseInt(idMatch[1], 10) - 1;
          if (entry.isIntersecting) {
            if (!visibleSections.includes(index)) {
              visibleSections.push(index);
            }
          } else {
            visibleSections = visibleSections.filter(i => i !== index);
          }
        }
      });

      if (visibleSections.length > 0) {
        visibleSections.sort((a, b) => a - b);
        this.updateActiveIndex(visibleSections[0]);
      }
    }, options);

    this.sections.forEach(section => {
      if (section.element) {
        this.observer?.observe(section.element);
      }
    });
  }

  private scrollToSection(index: number) {
    if (index < 0 || index >= this.sections.length) return;
    const targetId = `section-${index + 1}`;
    const target = document.getElementById(targetId);
    
    if (target) {
      const headerOffset = 60;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
      
      history.pushState(null, '', `#${targetId}`);
    }
  }

  private handleInitialHash() {
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const match = hash.match(/^section-(\d+)$/);
      if (match) {
        const index = parseInt(match[1], 10) - 1;
        setTimeout(() => this.scrollToSection(index), 100);
      }
    }
  }

  public destroy() {
    this.abortController.abort();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.navigateTimeout) {
      clearTimeout(this.navigateTimeout);
    }
  }
}
