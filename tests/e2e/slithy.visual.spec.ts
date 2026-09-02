import { expect, test } from "@playwright/test";

const viewport = { height: 720, width: 1_280 } as const;
const maximumLinuxRasterizationDifference = 4 / (viewport.height * viewport.width);

test("matches the archived SLITHY.NET design", async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.goto("/");

  await expect(page).toHaveScreenshot("slithy-desktop.png", {
    maxDiffPixelRatio: maximumLinuxRasterizationDifference,
  });
});
