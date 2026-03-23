import type { Locator, Page } from "@playwright/test";

export class ArticlePage {
  constructor(private readonly page: Page) {}

  get article(): Locator {
    return this.page.locator("main article");
  }

  get homeLink(): Locator {
    return this.page.getByRole("link", { name: "Retour à la Une" });
  }

  get previousArticleLink(): Locator {
    return this.page.getByRole("link", { name: "Précédent" });
  }

  get nextArticleLink(): Locator {
    return this.page.getByRole("link", { name: "Suivant" });
  }

  async goto(path: string) {
    await this.page.goto(path);
  }
}
