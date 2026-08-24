import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("renders the original content and metadata", async ({ page }) => {
  await expect(page).toHaveTitle("梶ヶ谷 宜之 | ホームページ");
  await expect(page.getByRole("heading", { level: 1, name: "ホームページ" })).toBeVisible();
  await expect(page.getByRole("img", { name: "ハクビシン" })).toHaveAttribute(
    "src",
    "/ea98a6f9-e9a6-43ea-a6e3-464656155004.webp",
  );

  const twitter = page.getByRole("link", { name: "Twitter" });
  await expect(twitter).toHaveAttribute("href", "https://twitter.com/sasakiuri");
  await expect(twitter).toHaveAttribute("rel", "noreferrer noopener");
  await expect(twitter).toHaveAttribute("target", "_blank");
});

test("has no automatically detectable accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("exports crawler and application metadata", async ({ request }) => {
  const [manifest, robots, sitemap] = await Promise.all([
    request.get("/manifest.webmanifest"),
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);

  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toEqual(
    expect.objectContaining({
      lang: "ja",
      start_url: "/",
      theme_color: "#ffffff",
    }),
  );
  expect(await robots.text()).toContain("Sitemap: https://sasakiuri.github.io/sitemap.xml");
  expect(await sitemap.text()).toContain("<loc>https://sasakiuri.github.io</loc>");
});
