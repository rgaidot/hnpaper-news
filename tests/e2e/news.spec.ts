import { expect, test } from "@playwright/test";
import "./helpers";
import { ArticlePage } from "./pages/ArticlePage";
import { NewsPage } from "./pages/NewsPage";

test("archives open an article and expose the return to home link", async ({
  page,
}) => {
  const newsPage = new NewsPage(page);
  const articlePage = new ArticlePage(page);
  await newsPage.goto();

  await expect(newsPage.archivesHeading).toBeVisible();

  const articlePath = await newsPage.getFirstArticlePath();

  expect(articlePath).toBeTruthy();

  await newsPage.firstArticleLink.click();
  await expect(page).toHaveURL(new RegExp(`${articlePath}$`));
  await expect(articlePage.article).toBeVisible();
  await expect(articlePage.homeLink).toBeVisible();
});

test("tag page is reachable from the archives", async ({ page }) => {
  const newsPage = new NewsPage(page);
  await newsPage.goto();

  const tagPath = await newsPage.getFirstTagPath();

  expect(tagPath).toBeTruthy();

  await newsPage.firstTagLink.click();
  await expect(page).toHaveURL(new RegExp(`${tagPath}$`));
  await expect(page.locator("main")).toContainText("Tag :");
  await expect(newsPage.firstNewsCardLink).toBeVisible();
});

test("archives pagination navigates to the next and previous pages", async ({
  page,
}) => {
  const newsPage = new NewsPage(page);
  await newsPage.goto();

  await expect(newsPage.nextPageLink).toBeVisible();
  await newsPage.nextPageLink.click();

  await expect(page).toHaveURL(/\/news\/2\/?$/);
  await expect(page.locator("main")).toContainText("Page 2");

  await expect(newsPage.previousPageLink).toBeVisible();
  await newsPage.previousPageLink.click();

  await expect(page).toHaveURL(/\/news\/?$/);
  await expect(page.locator("main")).toContainText("Page 1");
});

test("an intermediate article exposes previous and next links", async ({ page }) => {
  const newsPage = new NewsPage(page);
  const articlePage = new ArticlePage(page);
  await newsPage.goto();

  const articlePath = await newsPage.getMiddleArticlePath();

  expect(articlePath).toBeTruthy();

  await newsPage.middleArticleLink.click();
  await expect(page).toHaveURL(new RegExp(`${articlePath}$`));

  await expect(articlePage.previousArticleLink).toBeVisible();
  await expect(articlePage.nextArticleLink).toBeVisible();

  const previousHref = await articlePage.previousArticleLink.getAttribute("href");
  const nextHref = await articlePage.nextArticleLink.getAttribute("href");

  expect(previousHref).toMatch(/^\/news\//);
  expect(nextHref).toMatch(/^\/news\//);
});
