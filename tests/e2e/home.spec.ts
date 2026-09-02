import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/sasakiuri/");
});

test("renders the original content and metadata", async ({ page }) => {
  await expect(page).toHaveTitle("梶ヶ谷 宜之 | ホームページ");
  await expect(page.getByRole("heading", { level: 1, name: "ホームページ" })).toBeVisible();
  await expect(page.getByRole("img", { name: "ハクビシン" })).toHaveAttribute(
    "src",
    "/sasakiuri/ea98a6f9-e9a6-43ea-a6e3-464656155004.webp",
  );
  const heroLabel = page.locator("ruby.hero-label");
  await expect(heroLabel).toHaveCSS("font-size", "48px");
  await expect(heroLabel).toHaveCSS("font-weight", "700");
  await expect(heroLabel.locator("rt")).toHaveCSS("font-size", "24px");
  await expect(page.getByRole("heading", { name: "自己紹介" })).toHaveCount(0);

  const writing = page.getByRole("region", { name: "文章" });
  await expect(writing.getByRole("link", { name: "日記" })).toHaveAttribute("href", "/sasakuri/diary/");
  await expect(writing.getByRole("article")).toHaveCount(0);

  const works = page.getByRole("region", { name: "作ったもの" });
  const github = works.getByRole("link", { name: "GitHub" });
  await expect(github).toHaveAttribute("href", "https://github.com/sasakiuri");
  await expect(github).toHaveAttribute("rel", "noreferrer noopener");
  await expect(github).toHaveAttribute("target", "_blank");

  const socials = page.getByRole("navigation", { name: "SNS" });
  await expect(socials).toBeVisible();
  await expect(socials.getByRole("listitem")).toHaveCount(2);
  await expect(socials.getByRole("link", { name: /日記/u })).toHaveCount(0);

  const twitter = socials.getByRole("link", { name: "Twitter" });
  await expect(twitter).toHaveAttribute("href", "https://twitter.com/sasakiuri");
  await expect(twitter).toHaveAttribute("rel", "noreferrer noopener");
  await expect(twitter).toHaveAttribute("target", "_blank");

  await expect(socials.getByRole("link", { name: "GitHub" })).toHaveCount(0);
});

test("uses the shared native theme without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ height: 640, width: 320 });

  const result = await page.locator("body").evaluate((body) => {
    const style = getComputedStyle(body);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  expect(result).toEqual({
    backgroundColor: "rgb(240, 238, 230)",
    color: "rgb(20, 20, 19)",
    hasHorizontalOverflow: false,
  });
});

test("uses the same readable content measure as the diary", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 1280 });

  const layout = await page.locator("body").evaluate((body) => {
    const style = getComputedStyle(body);
    return {
      marginLeft: style.marginLeft,
      maximumWidth: Number.parseFloat(style.maxWidth),
      width: body.getBoundingClientRect().width,
    };
  });

  expect(layout.marginLeft).toBe("243px");
  expect(layout.maximumWidth).toBeGreaterThan(0);
  expect(layout.width).toBeLessThanOrEqual(layout.maximumWidth);
});

test("has no automatically detectable accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

test("exports crawler and application metadata", async ({ request }) => {
  const [manifest, robots, sitemap] = await Promise.all([
    request.get("/sasakiuri/manifest.webmanifest"),
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);

  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toEqual(
    expect.objectContaining({
      lang: "ja",
      scope: "/sasakiuri/",
      start_url: "/sasakiuri/",
      theme_color: "#f0eee6",
    }),
  );
  expect(await robots.text()).toContain("Sitemap: https://slithy.net/sitemap.xml");
  expect(await sitemap.text()).toContain("<loc>https://slithy.net/</loc>");
  expect(await sitemap.text()).toContain("<loc>https://slithy.net/sasakiuri/</loc>");
  expect(await sitemap.text()).toContain("<loc>https://slithy.net/sasakuri/diary/</loc>");
});
