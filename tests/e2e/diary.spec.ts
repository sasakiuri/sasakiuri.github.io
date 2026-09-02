import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

interface DiaryFixture {
  readonly posts: readonly { readonly id: string; readonly publishedAt: string; readonly text: string }[];
}

interface DiarySearchIndex {
  readonly posts: readonly { readonly id: string; readonly publishedAt: string; readonly text: string }[];
  readonly version: number;
}

const diaryData = JSON.parse(
  readFileSync(new URL("../../src/content/diary.json", import.meta.url), "utf8"),
) as DiaryFixture;
const yearFormatter = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric" });
const diaryArchiveYears = [
  ...new Set(diaryData.posts.map(({ publishedAt }) => yearFormatter.format(new Date(publishedAt)))),
].sort((left, right) => right.localeCompare(left));
const latestDiaryPostCount = 50;

test.beforeEach(async ({ page }) => {
  await page.goto("/sasakuri/diary/");
});

test("publishes the archived entries as a static diary", async ({ page, request }) => {
  await expect(page).toHaveTitle("ささきうりの日記");
  await expect(page.getByRole("heading", { level: 1, name: "日記" })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(Math.min(latestDiaryPostCount, diaryData.posts.length));
  await expect(page.getByText("ひさしぶりに弾作ろうとしたらタンブラーの中身を全部床にぶちまけた")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "年別の日記" }).getByRole("link")).toHaveCount(
    diaryArchiveYears.length,
  );
  await expect(page.getByRole("link", { name: /X/u })).toHaveCount(0);
  await expect(page.getByText("Xに書いたことを")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Atomフィード" })).toHaveAttribute("href", "/sasakuri/diary/feed.xml");
  await expect(page.getByRole("link", { name: "検索結果へ移動" })).toHaveAttribute("href", "#diary-results");
  await expect(page.getByRole("link", { name: "ページ上部へ戻る" })).toHaveAttribute("href", "#page-top");
  await expect(page.getByRole("link", { name: "テキスト版を保存" })).toHaveAttribute("download", "sasakiuri-diary.txt");
  await expect(page.getByRole("link", { name: "JSON版を保存" })).toHaveAttribute("download", "sasakiuri-diary.json");
  await expect(page.getByRole("article").getByRole("link")).toHaveCount(
    Math.min(latestDiaryPostCount, diaryData.posts.length),
  );
  await expect(page.locator('head link[rel="alternate"][type="application/atom+xml"]')).toHaveAttribute(
    "href",
    "https://slithy.net/sasakuri/diary/feed.xml",
  );

  const response = await request.get("/sasakuri/diary/");
  expect(response.ok()).toBe(true);
  expect(await response.text()).not.toContain("https://x.com");
});

test("searches every entry incrementally with fuzzy terms and selectable pagination", async ({ page }) => {
  const searchbox = page.getByRole("searchbox", { name: "検索" });
  const pageSize = page.getByRole("combobox", { name: "表示件数" });
  const year = page.getByRole("combobox", { name: "年" });
  const sort = page.getByRole("combobox", { name: "並び順" });
  const dateFrom = page.getByLabel("開始");
  const dateTo = page.getByLabel("終了");
  const reset = page.getByRole("button", { name: "検索条件を解除" });
  const status = page.getByRole("status");

  await expect(searchbox).toBeEnabled();
  await expect(status).toHaveText(`${diaryData.posts.length}件`);
  await expect(pageSize).toHaveValue("50");
  await expect(pageSize.locator("option")).toHaveText(["10件", "25件", "50件", "100件"]);
  await expect(year.locator("option")).toHaveText(["すべて", ...diaryArchiveYears.map((value) => `${value}年`)]);
  await expect(sort.locator("option")).toHaveText(["関連順", "新しい順", "古い順"]);
  await expect(page.getByText("検索方法")).toBeVisible();
  await expect(page.getByText("空白で複数語を絞り込めます。多少の入力違いにも一致します。")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "検索候補" })).toHaveCount(0);
  await expect(reset).toBeDisabled();

  const latestDate = diaryDate(diaryData.posts[0]?.publishedAt ?? "");
  const postsOnLatestDate = diaryData.posts.filter(({ publishedAt }) => diaryDate(publishedAt) === latestDate);
  await dateFrom.fill(latestDate);
  await dateTo.fill(latestDate);
  await expect(status).toHaveText(`${postsOnLatestDate.length}件`);
  await expect(dateFrom).toHaveAttribute("max", latestDate);
  await expect(dateTo).toHaveAttribute("min", latestDate);
  await expect
    .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
    .toEqual({ from: latestDate, to: latestDate });
  await reset.click();
  await expect(dateFrom).toHaveValue("");
  await expect(dateTo).toHaveValue("");
  await expect(status).toHaveText(`${diaryData.posts.length}件`);
  await expect(reset).toBeDisabled();

  await pageSize.selectOption("10");
  await expect(page.getByRole("article")).toHaveCount(10);
  await expect.poll(() => new URL(page.url()).searchParams.get("size")).toBe("10");

  const topPagination = page.getByRole("navigation", { name: "検索結果のページ（上）" });
  await topPagination.getByRole("button", { name: "次へ" }).click();
  await expect(topPagination.getByRole("combobox", { name: "ページ" })).toHaveValue("2");
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe("2");

  await searchbox.fill("タンプラー");
  await expect(status).toHaveText("1件見つかりました。");
  const suggestions = page.getByRole("region", { name: "検索候補" });
  const suggestionList = suggestions.getByRole("listbox", { name: "検索候補" });
  await expect(suggestionList.getByRole("option")).toHaveText(["タンブラー", "タンブラーの", "タンブラーの中身"]);
  await expect(suggestions).not.toContainText("ひさしぶりに弾作ろうとしたら");
  expect(await searchbox.evaluate((element) => element.nextElementSibling?.id)).toBe("diary-suggestions");
  await expect(suggestions.getByRole("heading")).toHaveCount(0);
  await searchbox.press("ArrowDown");
  await expect(suggestionList).toBeFocused();
  await suggestionList.press("Escape");
  await expect(suggestions).toHaveCount(0);
  await expect(searchbox).toBeFocused();
  await year.focus();
  await searchbox.focus();
  await expect(suggestionList).toBeVisible();
  await searchbox.press("ArrowDown");
  await suggestionList.press("Enter");
  await expect(searchbox).toHaveValue("タンブラー");
  await expect(searchbox).toBeFocused();
  await expect(page.getByRole("article").locator("mark", { hasText: "タンブラー" })).toBeVisible();

  await searchbox.fill("タンプラー 床にぶちまけた");
  await expect(status).toHaveText("1件見つかりました。");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article").getByText(/タンブラーの中身を全部床にぶちまけた/u)).toBeVisible();
  await expect(page.getByRole("article").locator("mark", { hasText: "床にぶちまけた" })).toBeVisible();
  await expect(topPagination).toHaveCount(0);

  await searchbox.fill('"タンブラー" OR "狩猟免許"');
  const eitherTermPosts = diaryData.posts.filter(
    ({ text }) => text.includes("タンブラー") || text.includes("狩猟免許"),
  );
  await expect(status).toHaveText(`${eitherTermPosts.length}件見つかりました。`);
  await expect(page.getByRole("article")).toHaveCount(eitherTermPosts.length);
  await expect(page.getByRole("region", { name: "検索候補" })).toHaveCount(0);
  await expect(page.getByRole("article").locator("mark", { hasText: "タンブラー" })).toBeVisible();

  await searchbox.fill('"狩猟免許" -ジェット');
  const excludedPosts = diaryData.posts.filter(({ text }) => text.includes("狩猟免許") && !text.includes("ジェット"));
  await expect(status).toHaveText(`${excludedPosts.length}件見つかりました。`);
  await expect(page.getByRole("article")).toHaveCount(excludedPosts.length);
  await expect(page.getByText(/ジェットストリームアタック/u)).toHaveCount(0);

  await searchbox.fill("2024");
  const postsFrom2024 = diaryData.posts.filter(
    ({ publishedAt }) => yearFormatter.format(new Date(publishedAt)) === "2024",
  );
  await expect(status).toHaveText(`${postsFrom2024.length}件見つかりました。`);
  await expect(page.getByRole("article")).toHaveCount(10);

  await searchbox.fill("");
  await year.selectOption("2024");
  await expect(status).toHaveText(`${postsFrom2024.length}件`);
  await sort.selectOption("oldest");
  const oldest2024 = postsFrom2024.at(-1);
  if (oldest2024 === undefined) throw new TypeError("The 2024 diary fixture must not be empty.");
  await expect(page.getByRole("article").first().locator("time")).toHaveAttribute("datetime", oldest2024.publishedAt);
  await expect
    .poll(() => Object.fromEntries(new URL(page.url()).searchParams))
    .toEqual({
      year: "2024",
      sort: "oldest",
      size: "10",
    });

  await page.reload();
  await expect(searchbox).toBeEnabled();
  await expect(year).toHaveValue("2024");
  await expect(sort).toHaveValue("oldest");
  await expect(pageSize).toHaveValue("10");
  await page.goBack();
  await expect(sort).toHaveValue("relevance");
  await page.goForward();
  await expect(sort).toHaveValue("oldest");
});

test("retries the full search index without losing the static fallback", async ({ page }) => {
  await expect(page.getByRole("status")).toHaveText(`${diaryData.posts.length}件`);
  let attempts = 0;
  await page.route("**/sasakuri/diary/search-index.json*", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ body: "{}", contentType: "application/json", status: 503 });
      return;
    }
    await route.continue();
  });
  await page.reload();

  await expect(page.getByRole("status")).toHaveText("検索データを読み込めませんでした。年別の日記は利用できます。");
  await expect(page.getByRole("article")).toHaveCount(Math.min(latestDiaryPostCount, diaryData.posts.length));
  await expect(page.getByRole("searchbox", { name: "検索" })).toBeDisabled();

  await page.getByRole("button", { name: "検索データを再読み込み" }).click();
  await expect(page.getByRole("status")).toHaveText(`${diaryData.posts.length}件`);
  await expect(page.getByRole("searchbox", { name: "検索" })).toBeEnabled();
  expect(attempts).toBe(2);
});

test("publishes a minimal same-origin index for full-diary search", async ({ request }) => {
  const response = await request.get("/sasakuri/diary/search-index.json");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");

  const index = (await response.json()) as DiarySearchIndex;
  expect(index.version).toBe(1);
  expect(index.posts).toHaveLength(diaryData.posts.length);
  expect(Object.keys(index.posts[0] ?? {}).sort()).toEqual(["id", "publishedAt", "text"]);
  expect(JSON.stringify(index)).not.toContain("https://x.com");
});

test("publishes a bounded Atom feed with local archive links", async ({ request }) => {
  const response = await request.get("/sasakuri/diary/feed.xml");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(/application\/(?:atom\+)?xml/u);

  const feed = await response.text();
  expect(feed.match(/<entry>/gu)).toHaveLength(Math.min(50, diaryData.posts.length));
  expect(feed).toMatch(/https:\/\/slithy\.net\/sasakuri\/diary\/\d{4}\/#entry-\d+/u);
  expect(feed).not.toContain("https://x.com");
});

test("publishes a plain-text archive without source links", async ({ request }) => {
  const response = await request.get("/sasakuri/diary/archive.txt");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/plain");

  const archive = await response.text();
  expect(archive).toContain("ささきうりの日記");
  expect(archive).toContain(`${diaryData.posts.length}件`);
  expect(archive).toContain(diaryData.posts[0]?.text);
  expect(archive).not.toContain("https://x.com");
});

test("publishes every collected entry in a canonical yearly archive", async ({ page }) => {
  let publishedPosts = 0;

  for (const year of diaryArchiveYears) {
    const posts = diaryData.posts.filter(({ publishedAt }) => yearFormatter.format(new Date(publishedAt)) === year);
    const archivePath = `/sasakuri/diary/${year}/`;

    await page.goto(archivePath);
    await expect(page).toHaveTitle(`${year}年の日記`);
    await expect(page.getByRole("heading", { level: 1, name: `${year}年の日記` })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(posts.length);
    await expect(page.getByRole("link", { exact: true, name: `${year}年` })).toHaveAttribute("aria-current", "page");
    const monthLinks = diaryMonths(posts);
    const monthNavigation = page.getByRole("navigation", { name: "月別目次" });
    await expect(monthNavigation.getByRole("link")).toHaveCount(monthLinks.length);
    for (const { entryId, label } of monthLinks) {
      await expect(monthNavigation.getByRole("link", { exact: true, name: label })).toHaveAttribute(
        "href",
        `#entry-${entryId}`,
      );
    }
    await expect(page.getByRole("article").getByRole("link")).toHaveCount(posts.length);
    await expect(page.getByRole("article").getByRole("link").first()).toHaveAttribute(
      "href",
      `${archivePath}#entry-${posts[0]?.id}`,
    );
    await expect(page.getByRole("link", { name: "日記本文へ移動" })).toHaveAttribute("href", "#diary-results");
    await expect(page.getByRole("link", { name: "ページ上部へ戻る" })).toHaveAttribute("href", "#page-top");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://slithy.net${archivePath}`);
    await expect(page.getByRole("link", { name: /X/u })).toHaveCount(0);
    publishedPosts += posts.length;
  }

  expect(publishedPosts).toBe(diaryData.posts.length);
});

test("uses the shared native theme without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ height: 640, width: 320 });

  const result = await page.locator("body").evaluate((body) => {
    const style = getComputedStyle(body);
    const viewportRight = document.documentElement.clientWidth;
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      overflowingElements: [...body.querySelectorAll("*")]
        .filter((element) => element.getBoundingClientRect().right > viewportRight)
        .map((element) => element.outerHTML.slice(0, 120)),
    };
  });

  expect(result).toEqual({
    backgroundColor: "rgb(240, 238, 230)",
    color: "rgb(20, 20, 19)",
    hasHorizontalOverflow: false,
    overflowingElements: [],
  });
});

test("uses a readable measure and responsive left margin", async ({ page }) => {
  const cases = [
    { marginLeft: 308, padding: 0, width: 1440 },
    { marginLeft: 243, padding: 0, width: 1280 },
    { marginLeft: 223, padding: 0, width: 1024 },
    { marginLeft: 177, padding: 0, width: 768 },
    { marginLeft: 0, padding: 8, width: 767 },
  ] as const;

  for (const viewport of cases) {
    await page.setViewportSize({ height: 640, width: viewport.width });
    const layout = await page.locator("body").evaluate((body) => {
      const style = getComputedStyle(body);
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
      body.append(probe);
      probe.textContent = "日".repeat(100);
      const japaneseCharacterWidth = probe.getBoundingClientRect().width / 100;
      probe.textContent = "0".repeat(100);
      const latinCharacterWidth = probe.getBoundingClientRect().width / 100;
      probe.remove();
      return {
        contentWidth:
          body.getBoundingClientRect().width -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight),
        japaneseCharacters: Number.parseFloat(style.maxWidth) / japaneseCharacterWidth,
        latinCharacters: Number.parseFloat(style.maxWidth) / latinCharacterWidth,
        marginLeft: Number.parseFloat(style.marginLeft),
        marginRight: Number.parseFloat(style.marginRight),
        maximumWidth: Number.parseFloat(style.maxWidth),
        paddingLeft: Number.parseFloat(style.paddingLeft),
        paddingRight: Number.parseFloat(style.paddingRight),
      };
    });

    expect(layout.marginLeft).toBe(viewport.marginLeft);
    expect(layout.marginRight).toBe(0);
    expect(layout.paddingLeft).toBe(viewport.padding);
    expect(layout.paddingRight).toBe(viewport.padding);
    expect(layout.maximumWidth).toBeGreaterThan(0);
    expect(layout.contentWidth).toBeLessThanOrEqual(layout.maximumWidth);
    expect(layout.japaneseCharacters).toBeGreaterThanOrEqual(36);
    expect(layout.japaneseCharacters).toBeLessThanOrEqual(37);
    expect(layout.latinCharacters).toBeLessThanOrEqual(75);
  }
});

test("has no automatically detectable accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});

function diaryDate(publishedAt: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date(publishedAt));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function diaryMonths(posts: DiaryFixture["posts"]): readonly { readonly entryId: string; readonly label: string }[] {
  const months = new Map<string, { readonly entryId: string; readonly label: string }>();
  for (const post of posts) {
    const key = diaryDate(post.publishedAt).slice(0, 7);
    if (!months.has(key)) months.set(key, { entryId: post.id, label: `${Number(key.slice(5))}月` });
  }
  return [...months.values()];
}
