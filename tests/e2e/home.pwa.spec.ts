import { expect, test } from "@playwright/test";

test("publishes installable app assets and structured profile data", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");

  const structuredData = page.locator('script[type="application/ld+json"]');
  const profile = JSON.parse((await structuredData.textContent()) ?? "");
  expect(profile).toEqual(
    expect.objectContaining({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity: expect.objectContaining({
        "@type": "Person",
        name: "梶ヶ谷 宜之",
      }),
    }),
  );

  const manifest = await request.get("/manifest.webmanifest");
  const manifestBody = await manifest.json();
  expect(manifestBody.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ purpose: "any", sizes: "192x192", src: "/icon-192.png" }),
      expect.objectContaining({ purpose: "maskable", sizes: "512x512", src: "/icon-512.png" }),
    ]),
  );

  const [serviceWorker, appIcon, securityPolicy] = await Promise.all([
    request.get("/sw.js"),
    request.get("/icon-512.png"),
    request.get("/.well-known/security.txt"),
  ]);
  expect(serviceWorker.headers()["content-type"]).toContain("application/javascript");
  expect(await serviceWorker.text()).toContain('const cachePrefix = "sasakiuri-"');
  expect(appIcon.headers()["content-type"]).toContain("image/png");
  const securityPolicyBody = await securityPolicy.text();
  expect(securityPolicyBody).toContain(
    "Contact: https://github.com/sasakiuri/sasakiuri.github.io/security/advisories/new",
  );
  const expiry = securityPolicyBody.match(/^Expires: (.+)$/m);
  expect(expiry).not.toBeNull();
  expect(Date.parse(expiry?.[1] ?? "")).toBeGreaterThan(Date.now());

  const socialImageUrl = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(socialImageUrl).not.toBeNull();
  const parsedSocialImageUrl = new URL(socialImageUrl ?? "", "https://sasakiuri.github.io");
  const socialImage = await request.get(`${parsedSocialImageUrl.pathname}${parsedSocialImageUrl.search}`);
  expect(socialImage.headers()["content-type"]).toContain("image/png");
});

test("keeps the original home page available offline", async ({ browserName, context, page }) => {
  test.skip(browserName !== "chromium", "The deterministic offline contract is exercised once in Chromium.");

  await page.setViewportSize({ height: 720, width: 1280 });
  await page.goto("/", { waitUntil: "load" });
  await page.evaluate(async () => document.fonts.ready);
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) {
      return false;
    }

    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  });

  const onlineScreenshot = await page.screenshot({ animations: "disabled" });
  const browserCache = await context.newCDPSession(page);
  await browserCache.send("Network.enable");
  await browserCache.send("Network.clearBrowserCache");

  const staticAssetResponses: Array<{ readonly fromServiceWorker: boolean; readonly status: number }> = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith("/_next/static/")) {
      staticAssetResponses.push({
        fromServiceWorker: response.fromServiceWorker(),
        status: response.status(),
      });
    }
  });

  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: "load" });
    await page.evaluate(async () => document.fonts.ready);
    await expect(page.getByRole("heading", { level: 1, name: "ホームページ" })).toBeVisible();

    const offlineScreenshot = await page.screenshot({ animations: "disabled" });
    expect(offlineScreenshot.equals(onlineScreenshot)).toBe(true);
    expect(staticAssetResponses.length).toBeGreaterThan(0);
    expect(staticAssetResponses.every(({ fromServiceWorker, status }) => fromServiceWorker && status === 200)).toBe(
      true,
    );
    expect(pageErrors).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});
