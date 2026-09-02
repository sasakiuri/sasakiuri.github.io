import { expect, type Page, test } from "@playwright/test";

async function openDiary(page: Page) {
  await page.goto("/sasakuri/diary/");
  await expect(page.getByRole("searchbox", { name: "検索" })).toBeEnabled();
}

test("desktop uses the narrow native design", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await openDiary(page);

  await expect(page).toHaveScreenshot("diary-desktop.png");
});

test("mobile uses the narrow native design", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await openDiary(page);

  await expect(page).toHaveScreenshot("diary-mobile.png");
});

test("search suggestions use the browser-default design", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await openDiary(page);
  await page.getByRole("searchbox", { name: "検索" }).fill("タンプラー");
  await expect(page.getByRole("region", { name: "検索候補" })).toBeVisible();

  await expect(page).toHaveScreenshot("diary-suggestions-mobile.png");
});
