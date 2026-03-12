let masonryObserver: ResizeObserver | null = null;

function packMasonry() {
  const container = document.querySelector(".masonry-grid") as HTMLElement;
  if (!container) return;

  const items = container.querySelectorAll(".masonry-section");
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

function wrapMasonrySections() {
  const container = document.querySelector(".masonry-grid");
  if (!container) return;

  if (!container.querySelector(".masonry-section")) {
    const children = Array.from(container.children);
    let currentSection = document.createElement("section");
    currentSection.className = "masonry-section";

    const sections: HTMLElement[] = [];
    children.forEach((child) => {
      if (child.tagName === "HR") {
        if (currentSection.childNodes.length > 0) sections.push(currentSection);
        currentSection = document.createElement("section");
        currentSection.className = "masonry-section";
      } else {
        currentSection.appendChild(child);
      }
    });

    if (currentSection.childNodes.length > 0) sections.push(currentSection);

    container.innerHTML = "";
    sections.forEach((section) => {
      container.appendChild(section);
    });

    window.dispatchEvent(new Event("masonry-wrapped"));
  }

  if (!masonryObserver) {
    masonryObserver = new ResizeObserver(() => {
      requestAnimationFrame(packMasonry);
    });
  } else {
    masonryObserver.disconnect();
  }

  const sections = container.querySelectorAll(".masonry-section");
  sections.forEach((section) => {
    masonryObserver!.observe(section);
  });
  masonryObserver.observe(container);

  packMasonry();

  requestAnimationFrame(() => {
    container.classList.add("masonry-loaded");
  });
}

export function initMasonrySections() {
  document.addEventListener("astro:page-load", wrapMasonrySections);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wrapMasonrySections);
  } else {
    wrapMasonrySections();
  }
}
