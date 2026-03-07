function wrapBentoSections() {
  const container = document.querySelector(".bento-grid");
  if (!container) return;

  if (container.querySelector(".bento-section")) return;

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

export function initBentoSections() {
  document.addEventListener("astro:page-load", wrapBentoSections);

  if (document.readyState === "complete") {
    wrapBentoSections();
  } else {
    document.addEventListener("DOMContentLoaded", wrapBentoSections);
  }
}
