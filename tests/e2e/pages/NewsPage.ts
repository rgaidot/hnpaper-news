import type { Locator, Page } from "@playwright/test";

export class NewsPage {
  constructor(private readonly page: Page) {}

  get archivesHeading(): Locator {
    return this.page.getByRole("heading", { name: "Archives" });
  }

  get firstArticleLink(): Locator {
    return this.page.locator('a[href^="/news/"]').first();
  }

  get middleArticleLink(): Locator {
    return this.page.locator('a[href^="/news/"]').nth(1);
  }

  get firstTagLink(): Locator {
    return this.page.locator('a[href^="/tags/"]').first();
  }

  get nextPageLink(): Locator {
    return this.page.getByRole("link", { name: /Suivant/ });
  }

  get previousPageLink(): Locator {
    return this.page.getByRole("link", { name: /Précédent/ });
  }

  get firstNewsCardLink(): Locator {
    return this.page.locator('a[href^="/news/"]').first();
  }

  async goto() {
    await this.page.goto("/news");
  }

  async getFirstArticlePath() {
    return this.firstArticleLink.getAttribute("href");
  }

  async getMiddleArticlePath() {
    return this.middleArticleLink.getAttribute("href");
  }

  async getFirstTagPath() {
    return this.firstTagLink.getAttribute("href");
  }
}
