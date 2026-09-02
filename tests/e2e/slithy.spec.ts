import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("restores the archived SLITHY.NET home page", async ({ page, request }) => {
  await expect(page).toHaveTitle("SLITHY.NET");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "SLITHY.NET explains the meaning of “slithy”—a word with two meanings packed into one.",
  );
  await expect(page.getByRole("heading", { level: 1, name: "SLITHY.NET" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "WHAT IS SLITHY?" })).toBeVisible();
  await expect(page.getByText(/there are two meanings packed up into one word/u)).toBeVisible();
  await expect(page.getByText("Tue Dec 25 02:43:23 UTC 2012")).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.ico");

  const favicon = await request.get("/favicon.ico");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image/x-icon");
  expect((await favicon.body()).byteLength).toBe(1_150);
});

test("has no automatically detectable accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("restores only SLITHY.NET without Wayback UI or requests", async ({ page }) => {
  const thirdPartyRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== "http://127.0.0.1:4173") {
      thirdPartyRequests.push(url.href);
    }
  });

  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.locator('a[href*="web.archive.org"]')).toHaveCount(0);
  expect(thirdPartyRequests).toEqual([]);
});
