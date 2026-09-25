#!/usr/bin/env node

import { chromium } from "@playwright/test";

import { diarySource } from "./lib/diary-data.mjs";
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

process.stdout.write(`Read-only X diagnostics on ${process.platform}/${process.arch}, Node ${process.version}.\n`);
for (const url of targets) {
  try {
    const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const html = await response.text();
    report({
      transport: "fetch",
      requestedUrl: url,
      finalUrl: response.url,
      status: response.status,
      contentType: response.headers.get("content-type"),
      ...inspectHtml(html),
    });
  } catch (error) {
    report({ transport: "fetch", requestedUrl: url, error: error.message });
  }
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ locale: "ja-JP" });
  const response = await page.goto(diarySource.profileUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  let renderError;
  if (response?.ok()) {
    try {
      await page.locator("article").first().waitFor({ state: "attached", timeout: 15_000 });
    } catch (error) {
      renderError = error.message;
    }
  }
  report({
    transport: "chromium",
    requestedUrl: diarySource.profileUrl,
    finalUrl: page.url(),
    status: response?.status(),
    articles: await page.locator("article").count(),
    renderedPostLinks: await page.locator(`article a[href*="/${diarySource.username}/status/"]`).count(),
    renderError,
    ...inspectHtml(await page.content()),
  });
} catch (error) {
  report({ transport: "chromium", requestedUrl: diarySource.profileUrl, error: error.message });
} finally {
  await browser.close();
}

process.stdout.write("Diagnostic completed; inspect each result. No archive was written or published.\n");

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

function report(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
