import { test, type Page } from "@playwright/test";

export async function blockThirdParty(page: Page) {
  await page.route(/^https?:\/\/(www\.gstatic\.com|cloud\.umami\.is)\//, (route) =>
    route.abort(),
  );
}

export function extractSearchTerm(text: string | null) {
  const candidate =
    text
      ?.split(/\s+/)
      .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
      .find((word) => word.length >= 6) ?? "actualite";

  return candidate.toLowerCase();
}

test.beforeEach(async ({ page }) => {
  await blockThirdParty(page);
});
