import { expect, test } from "@playwright/test";
import "./helpers";
import { NewsPage } from "./pages/NewsPage";
import { PlayerPage } from "./pages/PlayerPage";

test("full page player exposes the article audio element", async ({ page }) => {
  const newsPage = new NewsPage(page);
  const playerPage = new PlayerPage(page);
  await newsPage.goto();

  const articlePath = await newsPage.getFirstArticlePath();
  expect(articlePath).toBeTruthy();

  const slug = articlePath?.replace("/archives/", "");
  await playerPage.goto(slug!);

  await expect(playerPage.audioPlayer).toBeVisible();
  await expect(playerPage.audioPlayer).toHaveAttribute("controls", "");
});
