import { expect, test } from "@playwright/test";

test("matches the archived SLITHY.NET design", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1_280 });
  await page.goto("/");

  await expect(page).toHaveScreenshot("slithy-desktop.png");
});
