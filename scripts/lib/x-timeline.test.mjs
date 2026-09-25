// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDiaryPost, publishedAtFromPostId } from "./diary-data.mjs";
import { extractXTimelinePage, fetchXTimelinePosts } from "./x-timeline.mjs";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));

const newestId = "2103293728005976484";
const missingId = "2096538729813008800";
const archivedId = "2093251072781590942";
const olderId = "2092877356218343626";

function status(id = newestId, overrides = {}) {
  return {
    type: "status",
    provider: "twitter",
    id,
    text: "一行目\n二行目 & 続き",
    author: { id: "897820919749500928", screen_name: "sasakiuri" },
    created_timestamp: Math.floor(Date.parse(publishedAtFromPostId(id)) / 1000),
    reposted_by: null,
    ...overrides,
  };
}

function page(results, cursor = null) {
  return { code: 200, results, cursor: { top: null, bottom: cursor } };
}

function response(value, options) {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, ...options });
}

const archived = [archivedId, olderId].map((id) => createDiaryPost(status(id)));

afterEach(() => vi.restoreAllMocks());

describe("FxEmbed timeline extraction", () => {
  it("keeps authored text only, rebuilds the source URL, and ignores quotes and reposts", () => {
    const foreign = status(missingId, { author: { id: "123456", screen_name: "someone" } });
    const input = page([
      status(newestId, { url: "https://example.com/ignored", quote: foreign }),
      foreign,
      status(olderId, { reposted_by: { id: "897820919749500928" } }),
    ]);
    expect(extractXTimelinePage(input).posts).toEqual([
      {
        id: newestId,
        publishedAt: "2026-09-25T01:21:16.721Z",
        text: "一行目\n二行目 & 続き",
        url: `https://x.com/sasakiuri/status/${newestId}`,
      },
    ]);
  });

  it.each(["photos", "videos"])("keeps media-only %s posts with the established placeholder", (kind) => {
    expect(extractXTimelinePage(page([status(newestId, { text: "", media: { [kind]: [{}] } })])).posts[0].text).toBe(
      "画像または動画を投稿しました。",
    );
  });

  it.each([
    ["invalid code", { code: 500 }],
    ["missing results", { results: null }],
    ["too many results", { results: Array.from({ length: 101 }, () => status()) }],
    ["missing cursor", { cursor: {} }],
    ["empty cursor", { cursor: { bottom: "" } }],
    ["oversized cursor", { cursor: { bottom: "a".repeat(4097) } }],
  ])("rejects a page with %s", (_label, overrides) => {
    expect(() => extractXTimelinePage({ ...page([status()]), ...overrides })).toThrow();
  });

  it.each([
    ["unexpected type", { type: "thread" }],
    ["wrong provider", { provider: "bluesky" }],
    ["missing author", { author: null }],
    ["wrong author ID", { author: { id: "123456", screen_name: "sasakiuri" } }],
    ["changed author handle", { author: { id: "897820919749500928", screen_name: "someone" } }],
    ["invalid ID", { id: "invalid" }],
    ["inconsistent timestamp", { created_timestamp: 0 }],
    ["missing timestamp", { created_timestamp: undefined }],
    ["missing text", { text: undefined }],
    ["empty text without media", { text: " " }],
  ])("rejects a status with %s", (_label, overrides) => {
    expect(() => extractXTimelinePage(page([status(newestId, overrides)]))).toThrow();
  });

  it("deduplicates equal posts but rejects conflicting text", () => {
    expect(extractXTimelinePage(page([status(), status()])).posts).toHaveLength(1);
    expect(() => extractXTimelinePage(page([status(), status(newestId, { text: "異なる本文" })]))).toThrow(
      /conflicting/u,
    );
  });
});

describe("FxEmbed timeline fetching", () => {
  it("fills gaps even when the latest post is already archived and a pinned old post comes first", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(page([status(olderId), status(newestId), status(missingId)], "next")))
      .mockResolvedValueOnce(response(page([status(archivedId), status(olderId)], "unused")));
    const posts = await fetchXTimelinePosts([...archived, createDiaryPost(status())], { fetchImpl });
    expect(new Set(posts.map(({ id }) => id))).toEqual(new Set([newestId, missingId, archivedId, olderId]));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0].href).toBe("https://api.fxtwitter.com/2/profile/sasakiuri/statuses?count=20");
    expect(fetchImpl.mock.calls[1][0].searchParams.get("cursor")).toBe("next");
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { accept: "application/json" } });
  });

  it("continues through repost-only pages and a lone archived pinned post", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(page([status(olderId)], "a")))
      .mockResolvedValueOnce(response(page([status(newestId, { reposted_by: {} })], "b")))
      .mockResolvedValueOnce(response(page([status(missingId)])));
    expect((await fetchXTimelinePosts(archived, { fetchImpl })).map(({ id }) => id)).toEqual([olderId, missingId]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("accepts a terminal empty page only after fetching authored posts", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(page([status()], "end")))
      .mockResolvedValueOnce(response(page([])));
    expect(await fetchXTimelinePosts(archived, { fetchImpl })).toHaveLength(1);
  });

  it.each([
    ["empty first page", page([])],
    ["no authored posts", page([status(newestId, { author: { id: "123456", screen_name: "someone" } })])],
    ["empty continuation", page([], "next")],
  ])("fails for %s", async (_label, body) => {
    await expect(
      fetchXTimelinePosts(archived, { fetchImpl: vi.fn().mockResolvedValue(response(body)) }),
    ).rejects.toThrow();
  });

  it("fails when cursors repeat or pages disagree about post text", async () => {
    const repeated = vi.fn().mockImplementation(async () => response(page([status()], "same")));
    await expect(fetchXTimelinePosts(archived, { fetchImpl: repeated })).rejects.toThrow(/repeated/u);
    const conflict = vi
      .fn()
      .mockResolvedValueOnce(response(page([status()], "next")))
      .mockResolvedValueOnce(response(page([status(newestId, { text: "異なる本文" })])));
    await expect(fetchXTimelinePosts(archived, { fetchImpl: conflict })).rejects.toThrow(/conflicting/u);
  });

  it("fails at the page limit instead of returning a partial update", async () => {
    let count = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => response(page([status()], `page-${++count}`)));
    await expect(fetchXTimelinePosts(archived, { fetchImpl })).rejects.toThrow(/within 10 pages/u);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it("does not return partial posts when a later page fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(page([status()], "next")))
      .mockResolvedValueOnce(response({ code: 403 }, { status: 403 }));
    await expect(fetchXTimelinePosts(archived, { fetchImpl })).rejects.toThrow(/HTTP 403/u);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([429, 503])("retries transient HTTP %s failures", async (httpStatus) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({}, { status: httpStatus }))
      .mockResolvedValueOnce(response(page([status()])));
    expect(await fetchXTimelinePosts(archived, { fetchImpl })).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("limits network and server retries to three attempts", async () => {
    const network = vi.fn().mockRejectedValue(new Error("network unavailable"));
    await expect(fetchXTimelinePosts(archived, { fetchImpl: network })).rejects.toThrow(/after 3 attempts/u);
    expect(network).toHaveBeenCalledTimes(3);
    const server = vi.fn().mockImplementation(async () => response({}, { status: 503 }));
    await expect(fetchXTimelinePosts(archived, { fetchImpl: server })).rejects.toThrow(/HTTP 503/u);
    expect(server).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["HTML response", () => new Response("<html></html>", { headers: { "content-type": "text/html" } })],
    ["invalid JSON", () => new Response("{", { headers: { "content-type": "application/json" } })],
    ["oversized body", () => response("a".repeat(5_000_000))],
  ])("rejects %s", async (_label, makeResponse) => {
    await expect(
      fetchXTimelinePosts(archived, { fetchImpl: vi.fn().mockResolvedValue(makeResponse()) }),
    ).rejects.toThrow();
  });
});
