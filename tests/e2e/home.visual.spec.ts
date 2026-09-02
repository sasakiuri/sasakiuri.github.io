import { expect, type Page, test } from "@playwright/test";

// The design intentionally uses each browser's native fonts, whose glyph metrics vary across Linux distributions.
const maximumNativeFontDifference = 0.09;

async function waitForStablePage(page: Page) {
  await page.goto("/sasakiuri/");
  await page.evaluate(async () => document.fonts.ready);
}

test("desktop uses the narrow native design", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });
  await waitForStablePage(page);

  await expect(page).toHaveScreenshot("home-desktop.png", {
    maxDiffPixelRatio: maximumNativeFontDifference,
  });
});

test("mobile uses the narrow native design", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await waitForStablePage(page);

  await expect(page).toHaveScreenshot("home-mobile.png", {
    maxDiffPixelRatio: maximumNativeFontDifference,
  });
});
