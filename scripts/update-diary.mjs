#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import { diarySource, mergeDiaryPosts, validateDiaryData } from "./lib/diary-data.mjs";
import { extractXProfilePosts } from "./lib/x-profile.mjs";

const dataUrl = new URL("../src/content/diary.json", import.meta.url);
const currentSource = await readFile(dataUrl, "utf8");
const currentData = validateDiaryData(JSON.parse(currentSource));
const html = await fetchProfileWithRetry();
const fetchedPosts = extractXProfilePosts(html);
const nextData = mergeDiaryPosts(currentData, fetchedPosts);
const nextSource = `${JSON.stringify(nextData, null, 2)}\n`;

if (nextSource === currentSource) {
  process.stdout.write(`Diary is current with ${nextData.posts.length} archived posts.\n`);
} else {
  await writeFile(dataUrl, nextSource);
  const currentIds = new Set(currentData.posts.map(({ id }) => id));
  const additions = fetchedPosts.filter(({ id }) => !currentIds.has(id)).length;
  process.stdout.write(`Updated diary with ${additions} new posts; ${nextData.posts.length} posts are archived.\n`);
}

async function fetchProfileWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(diarySource.profileUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "ja,en;q=0.8",
          "user-agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36 sasakiuri-diary/1.0",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.toLowerCase().includes("text/html")) {
        throw new TypeError(`X returned HTTP ${response.status} with ${contentType || "no content type"}.`);
      }
      const html = await response.text();
      if (html.length > 5_000_000) throw new TypeError("X profile HTML exceeds the 5 MB safety limit.");
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new TypeError(`Unable to fetch ${diarySource.profileUrl} after 3 attempts.`, { cause: lastError });
}
