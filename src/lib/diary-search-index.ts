import type { DiarySearchIndex, DiarySearchPost } from "@/content/diary-types";

const maximumSearchPosts = 5_000;

export function validateDiarySearchIndex(value: unknown, expectedPosts: number): DiarySearchIndex {
  assertRecord(value, "diary search index");
  assertExactKeys(value, ["posts", "version"], "diary search index");
  const { posts: candidates, version } = value;
  if (version !== 1) throw new TypeError("Diary search index version must be 1.");
  if (
    !Number.isInteger(expectedPosts) ||
    expectedPosts < 1 ||
    expectedPosts > maximumSearchPosts ||
    !Array.isArray(candidates) ||
    candidates.length !== expectedPosts
  ) {
    throw new TypeError("Diary search index has an unexpected post count.");
  }

  let previousId: string | undefined;
  const ids = new Set<string>();
  const posts = candidates.map((candidate, index) => {
    assertRecord(candidate, `diary search post ${index + 1}`);
    assertExactKeys(candidate, ["id", "publishedAt", "text"], `diary search post ${index + 1}`);
    const { id, publishedAt, text } = candidate;
    if (typeof id !== "string" || !/^[1-9]\d{5,24}$/u.test(id)) {
      throw new TypeError(`Diary search post ${index + 1} has an invalid ID.`);
    }
    if (ids.has(id)) throw new TypeError(`Diary search post ID is duplicated: ${id}`);
    if (previousId !== undefined && BigInt(previousId) <= BigInt(id)) {
      throw new TypeError("Diary search posts must be sorted newest first.");
    }
    assertIsoTimestamp(publishedAt, `diary search post ${index + 1} timestamp`);
    if (typeof text !== "string" || text.trim() === "" || text.trim() !== text) {
      throw new TypeError(`Diary search post ${index + 1} has invalid text.`);
    }

    const post: DiarySearchPost = Object.freeze({
      id,
      publishedAt,
      text,
    });
    ids.add(post.id);
    previousId = post.id;
    return post;
  });

  return Object.freeze({ posts: Object.freeze(posts), version: 1 });
}

function assertIsoTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`${label} must be an ISO timestamp.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be an ISO timestamp.`);
  }
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new TypeError(`${label} has missing or unknown properties.`);
  }
}
