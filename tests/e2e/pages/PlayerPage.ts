import type { Locator, Page } from "@playwright/test";

export class PlayerPage {
  constructor(private readonly page: Page) {}

  get audioPlayer(): Locator {
    return this.page.locator("audio#audio-player");
  }

  async goto(slug: string) {
    await this.page.goto(`/player/${slug}`);
  }
}
