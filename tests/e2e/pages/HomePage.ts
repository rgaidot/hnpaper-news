import type { Locator, Page } from "@playwright/test";
import { extractSearchTerm } from "../helpers";

export class HomePage {
  constructor(private readonly page: Page) {}

  get siteTitle(): Locator {
    return this.page.getByRole("heading", { name: "The HNPaper" });
  }

  get archivesLink(): Locator {
    return this.page.getByRole("link", { name: "Archives" });
  }

  get mainArticle(): Locator {
    return this.page.locator("main article");
  }

  get firstTagLink(): Locator {
    return this.page.locator('a[href^="/tags/"]').first();
  }

  get searchInput(): Locator {
    return this.page.locator("#pagefind-search");
  }

  get clearSearchButton(): Locator {
    return this.page.locator("#clear-search-btn");
  }

  get searchResults(): Locator {
    return this.page.locator("#pagefind-search-results");
  }

  async goto() {
    await this.page.goto("/");
  }

  async searchUsingFirstArticleText() {
    const articleText = await this.page.locator("main article p").first().textContent();
    const query = extractSearchTerm(articleText);
    await this.searchInput.fill(query);
    return query;
  }
}
