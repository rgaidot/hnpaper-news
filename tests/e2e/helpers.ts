import { test, type Page } from "@playwright/test";

export async function blockThirdParty(page: Page) {
  await page.route(
    /^https?:\/\/(www\.gstatic\.com|us(-assets)?\.i\.posthog\.com|eu(-assets)?\.i\.posthog\.com|app\.posthog\.com)\//,
    (route) =>
    route.abort(),
  );
}

export function extractSearchTerm(text: string | null) {
  const normalizeAccents = (str: string) =>
    str
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");

  const candidate =
    text
      ?.split(/\s+/)
      .map((word) =>
        normalizeAccents(word).replace(/[^\p{L}\p{N}]/gu, "")
      )
      .find((word) => word.length >= 6) ?? "actualite";

  return candidate.toLowerCase();
}

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
});
