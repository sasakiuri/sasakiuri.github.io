import { setTimeout as delay } from "node:timers/promises";

import { createDiaryPost, diarySource } from "./diary-data.mjs";

const timelineUrl = `https://api.fxtwitter.com/2/profile/${diarySource.username}/statuses`;
const authorId = "897820919749500928";
const maxPages = 10;
const mediaOnlyText = "画像または動画を投稿しました。";

export function extractXTimelinePage(value) {
  if (value?.code !== 200 || !Array.isArray(value.results) || value.results.length > 100) {
    throw new TypeError("FxEmbed returned an invalid timeline page.");
  }
  const cursor = value.cursor?.bottom;
  if (cursor !== null && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > 4096)) {
    throw new TypeError("FxEmbed returned an invalid pagination cursor.");
  }

  const posts = new Map();
  for (const status of value.results) {
    if (
      status?.type !== "status" ||
      status.provider !== "twitter" ||
      typeof status.author?.id !== "string" ||
      typeof status.author.screen_name !== "string"
    ) {
      throw new TypeError("FxEmbed returned an invalid X status or author.");
    }
    const matchesId = status.author.id === authorId;
    const matchesHandle = status.author.screen_name.toLowerCase() === diarySource.username;
    if (matchesId !== matchesHandle) throw new TypeError("FxEmbed returned a mismatched diary author.");
    // Reposts and nested quotes must never become another person's diary entry.
    if (!matchesId || status.reposted_by != null) continue;

    if (typeof status.text !== "string") throw new TypeError("FxEmbed returned invalid post text.");
    const hasMedia = [status.media?.photos, status.media?.videos].some(
      (items) => Array.isArray(items) && items.length > 0,
    );
    const text = status.text.trim() === "" && hasMedia ? mediaOnlyText : status.text;
    const post = createDiaryPost({ id: status.id, text });
    if (status.created_timestamp !== Math.floor(Date.parse(post.publishedAt) / 1000)) {
      throw new TypeError("FxEmbed post timestamp does not match its X post ID.");
    }
    addPost(posts, post);
  }
  return { posts: [...posts.values()], cursor, resultCount: value.results.length };
}

export async function fetchXTimelinePosts(currentPosts, { fetchImpl = fetch } = {}) {
  const archivedIds = new Set(currentPosts.map(({ id }) => id));
  const posts = new Map();
  const cursors = new Set();
  let cursor;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const url = new URL(timelineUrl);
    url.searchParams.set("count", "20");
    if (cursor !== undefined) url.searchParams.set("cursor", cursor);
    const page = extractXTimelinePage(await fetchPage(url, fetchImpl));

    if (pageNumber === 1 && page.resultCount === 0) {
      throw new TypeError("FxEmbed returned an empty first timeline page.");
    }
    if (page.resultCount === 0 && page.cursor !== null) {
      throw new TypeError("FxEmbed returned an empty page with a continuation cursor.");
    }
    for (const post of page.posts) addPost(posts, post);

    // Read a whole archived page, not just one old/pinned post among new entries.
    const reachedArchive =
      page.posts.length >= 2 &&
      page.posts.length === page.resultCount &&
      page.posts.every(({ id }) => archivedIds.has(id));
    if (page.cursor === null || reachedArchive) {
      if (posts.size === 0) throw new TypeError("FxEmbed returned no authored diary posts.");
      return [...posts.values()];
    }
    if (cursors.has(page.cursor)) throw new TypeError("FxEmbed repeated a pagination cursor.");
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  throw new TypeError(`FxEmbed did not reach the archive within ${maxPages} pages; no update was saved.`);
}

function addPost(posts, post) {
  if (posts.has(post.id) && posts.get(post.id).text !== post.text) {
    throw new TypeError(`FxEmbed returned conflicting text for X post ${post.id}.`);
  }
  posts.set(post.id, post);
}

async function fetchPage(url, fetchImpl) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    let source;
    try {
      response = await fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": "sasakiuri-diary/1.0" },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      source = await response.text();
    } catch (error) {
      if (attempt === 3)
        throw new TypeError("Unable to fetch the FxEmbed timeline after 3 attempts.", { cause: error });
      await delay(attempt * 1000);
      continue;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await delay(attempt * 1000);
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new TypeError(`FxEmbed returned HTTP ${response.status} without a successful JSON timeline.`);
    }
    if (Buffer.byteLength(source, "utf8") > 5_000_000) {
      throw new TypeError("FxEmbed timeline exceeds the 5 MB safety limit.");
    }
    return JSON.parse(source);
  }
}
