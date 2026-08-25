import { expect, test } from "@playwright/test";

test("publishes complete canonical and social metadata", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://sasakiuri.github.io/");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", "ホームページです。");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "梶ヶ谷 宜之 | ホームページ");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "https://sasakiuri.github.io/");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
    "content",
    /^SASAKI URI — 梶ヶ谷 宜之のホームページ/,
  );
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute(
    "content",
    /^SASAKI URI — 梶ヶ谷 宜之のホームページ/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
});

test("does not execute third-party requests or emit browser errors", async ({ page }) => {
  const browserErrors: string[] = [];
  const thirdPartyRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== "http://127.0.0.1:4173") {
      thirdPartyRequests.push(url.href);
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(browserErrors).toEqual([]);
  expect(thirdPartyRequests).toEqual([]);
});

test("stays within deterministic browser delivery budgets", async ({ page }) => {
  const scriptBodies: Array<Promise<Buffer>> = [];

  page.on("response", (response) => {
    if (response.request().resourceType() === "script") {
      scriptBodies.push(response.body());
    }
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const scripts = await Promise.all(scriptBodies);
  const totalJavaScriptBytes = scripts.reduce((total, body) => total + body.byteLength, 0);
  const navigation = await page.evaluate(() => {
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];

    return {
      domContentLoaded: entry?.domContentLoadedEventEnd ?? Number.POSITIVE_INFINITY,
      load: entry?.loadEventEnd ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(totalJavaScriptBytes).toBeLessThan(700_000);
  expect(navigation.domContentLoaded).toBeLessThan(3_000);
  expect(navigation.load).toBeLessThan(5_000);
});
