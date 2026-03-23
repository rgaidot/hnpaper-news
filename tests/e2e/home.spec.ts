import { expect, test } from "@playwright/test";
import "./helpers";
import { HomePage } from "./pages/HomePage";

test("home page shows the main headline and primary links", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();

  await expect(homePage.siteTitle).toBeVisible();
  await expect(homePage.archivesLink).toBeVisible();
  await expect(homePage.mainArticle).toBeVisible();
  await expect(homePage.firstTagLink).toBeVisible();
});

test("search shows results and can be cleared", async ({ page }) => {
  const homePage = new HomePage(page);
  await homePage.goto();
  await homePage.searchUsingFirstArticleText();

  await expect(homePage.searchResults).toBeVisible();
  await expect(homePage.searchResults).not.toContainText("Recherche en cours...");
  await expect(homePage.searchResults.locator("a").first()).toBeVisible();
  await expect(homePage.clearSearchButton).toBeVisible();

  await homePage.clearSearchButton.click();

  await expect(homePage.searchInput).toHaveValue("");
  await expect(homePage.searchResults).toBeHidden();
});
