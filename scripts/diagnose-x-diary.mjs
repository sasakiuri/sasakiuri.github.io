#!/usr/bin/env node

import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

import { createDiaryPost, diarySource } from "./lib/diary-data.mjs";
import { extractXProfilePosts } from "./lib/x-profile.mjs";

// Use the updater's request headers so the runner comparison changes only its environment.
const headers = {
  accept: "text/html,application/xhtml+xml",
  "accept-language": "ja,en;q=0.8",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36 sasakiuri-diary/1.0",
};
const targets = [
  diarySource.profileUrl,
  `https://twitter.com/${diarySource.username}`,
  `https://syndication.twitter.com/srv/timeline-profile/screen-name/${diarySource.username}`,
];
const { values } = parseArgs({
  options: { headed: { type: "boolean", default: false }, transport: { type: "string", default: "all" } },
});
const transport = values.transport;
if (!["all", "fetch", "chromium"].includes(transport)) {
  throw new TypeError("Use --transport all, fetch, or chromium.");
}

process.stdout.write(`Read-only X diagnostics on ${process.platform}/${process.arch}, Node ${process.version}.\n`);
for (const url of transport === "chromium" ? [] : targets) {
  try {
    const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const html = await response.text();
    report({
      transport: "fetch",
      requestedUrl: url,
      finalUrl: withoutQuery(response.url),
      status: response.status,
      contentType: response.headers.get("content-type"),
      ...inspectHtml(html),
    });
  } catch (error) {
    report({ transport: "fetch", requestedUrl: url, error: error.message });
  }
}

if (transport !== "chromium") await inspectFxTimeline();
if (transport !== "fetch") await inspectBrowser();
process.stdout.write("Diagnostic completed; inspect each result. No archive was written or published.\n");

async function inspectBrowser() {
  const browser = await chromium.launch({ headless: !values.headed });
  try {
    const page = await browser.newPage({ locale: "ja-JP" });
    const documentStatuses = [];
    page.on("response", (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
        documentStatuses.push(response.status());
      }
    });
    const response = await page.goto(diarySource.profileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    let renderError;
    try {
      // An interstitial can return 403 before its JavaScript navigates to the profile.
      await page.locator("article").first().waitFor({ state: "attached", timeout: 30_000 });
    } catch (error) {
      renderError = error.message;
    }
    report({
      transport: values.headed ? "chromium-headed" : "chromium",
      requestedUrl: diarySource.profileUrl,
      finalUrl: withoutQuery(page.url()),
      initialStatus: response?.status(),
      documentStatuses,
      title: await page.title(),
      articles: await page.locator("article").count(),
      renderedPostLinks: await page.locator(`article a[href*="/${diarySource.username}/status/"]`).count(),
      renderError,
      ...inspectHtml(await page.content()),
    });
  } catch (error) {
    report({
      transport: values.headed ? "chromium-headed" : "chromium",
      requestedUrl: diarySource.profileUrl,
      error: error.message,
    });
  } finally {
    await browser.close();
  }
}

function inspectHtml(html) {
  const bytes = Buffer.byteLength(html);
  if (bytes > 5_000_000) return { bytes, extractionError: "HTML exceeds the 5 MB limit." };
  try {
    // Publish only validated IDs and timestamps, never raw HTML, response headers, or post text.
    const posts = extractXProfilePosts(html);
    return { bytes, posts: posts.map(({ id, publishedAt }) => ({ id, publishedAt })) };
  } catch (error) {
    // A widget or client-rendered page may need a different parser even when access succeeds.
    return { bytes, extractionError: error.message };
  }
}

async function inspectFxTimeline() {
  const requestedUrl = `https://api.fxtwitter.com/2/profile/${diarySource.username}/statuses?count=20`;
  try {
    const response = await fetch(requestedUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new TypeError(`FxEmbed returned HTTP ${response.status}.`);
    const body = await response.json();
    if (body.code !== 200 || !Array.isArray(body.results)) throw new TypeError("Unexpected FxEmbed timeline.");
    const authored = body.results.filter(
      (post) => post.author?.screen_name?.toLowerCase() === diarySource.username && post.type === "status",
    );
    const posts = authored.map((post) => {
      if (post.author.id !== "897820919749500928") throw new TypeError("Unexpected author ID.");
      const { id, publishedAt } = createDiaryPost(post);
      return { id, publishedAt };
    });
    if (posts.length === 0) throw new TypeError("FxEmbed returned no authored posts.");
    report({ transport: "FxEmbed", requestedUrl, status: response.status, posts });
  } catch (error) {
    report({ transport: "FxEmbed", requestedUrl, error: error.message });
  }
}

function report(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function withoutQuery(value) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}
