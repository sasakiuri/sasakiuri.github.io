import { expect, type Page, test } from "@playwright/test";

async function waitForStablePage(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => document.fonts.ready);
}

test("desktop design is unchanged", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await waitForStablePage(page);

  await expect(page).toHaveScreenshot("home-desktop.png");
});

test("mobile design is unchanged", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await waitForStablePage(page);

  await expect(page).toHaveScreenshot("home-mobile.png");
});
