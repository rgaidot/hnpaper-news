let bentoObserver: ResizeObserver | null = null;

function packBento() {
  const container = document.querySelector(".bento-grid") as HTMLElement;
  if (!container) return;

  const items = container.querySelectorAll(".bento-section");
  if (items.length === 0) return;

  const style = window.getComputedStyle(container);
  const rowHeight = parseInt(style.getPropertyValue("grid-auto-rows"), 10) || 1;
  let rowGap = parseFloat(style.getPropertyValue("row-gap"));
  if (isNaN(rowGap)) rowGap = 0;

  items.forEach((item: Element) => {
    const el = item as HTMLElement;
    const height = el.getBoundingClientRect().height;
    const rowSpan = Math.ceil((height + rowGap) / (rowHeight + rowGap));
    const newGridRowEnd = `span ${rowSpan}`;
    if (el.style.gridRowEnd !== newGridRowEnd) {
      el.style.gridRowEnd = newGridRowEnd;
    }
  });
}

function wrapBentoSections() {
  const container = document.querySelector(".bento-grid");
  if (!container) return;

  if (!container.querySelector(".bento-section")) {
    const children = Array.from(container.children);
    let currentSection = document.createElement("section");
    currentSection.className = "bento-section";

    const sections: HTMLElement[] = [];
    children.forEach((child) => {
      if (child.tagName === "HR") {
        if (currentSection.childNodes.length > 0) sections.push(currentSection);
        currentSection = document.createElement("section");
        currentSection.className = "bento-section";
      } else {
        currentSection.appendChild(child);
      }
    });

    if (currentSection.childNodes.length > 0) sections.push(currentSection);

    container.innerHTML = "";
    sections.forEach((section) => {
      container.appendChild(section);
    });

    window.dispatchEvent(new Event("bento-wrapped"));
  }

  if (!bentoObserver) {
    bentoObserver = new ResizeObserver(() => {
      requestAnimationFrame(packBento);
    });
  } else {
    bentoObserver.disconnect();
  }

  const sections = container.querySelectorAll(".bento-section");
  sections.forEach((section) => {
    bentoObserver!.observe(section);
  });
  bentoObserver.observe(container);

  packBento();

  requestAnimationFrame(() => {
    container.classList.add("bento-loaded");
  });
}

export function initBentoSections() {
  document.addEventListener("astro:page-load", wrapBentoSections);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wrapBentoSections);
  } else {
    wrapBentoSections();
  }
}
