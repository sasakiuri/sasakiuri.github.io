import { createDiaryPost, diarySource } from "./diary-data.mjs";

const browserExportKind = "x-browser-dom-v1";
const maximumExportPosts = 5_000;

export function validateDiaryBrowserExport(value) {
  assertRecord(value, "browser export");
  assertExactKeys(value, ["exportedAt", "posts", "source", "version"], "browser export");
  if (value.version !== 1) throw new TypeError("Browser export version must be 1.");
  assertIsoTimestamp(value.exportedAt, "browser export timestamp");

  assertRecord(value.source, "browser export source");
  assertExactKeys(value.source, ["kind", "username"], "browser export source");
  if (value.source.kind !== browserExportKind || value.source.username !== diarySource.username) {
    throw new TypeError("Browser export source does not match the configured X account.");
  }

  if (!Array.isArray(value.posts) || value.posts.length === 0 || value.posts.length > maximumExportPosts) {
    throw new TypeError(`Browser export must contain between 1 and ${maximumExportPosts} posts.`);
  }

  const ids = new Set();
  let previousId;
  const posts = value.posts.map((post, index) => {
    assertRecord(post, `browser export post ${index + 1}`);
    assertExactKeys(post, ["id", "text"], `browser export post ${index + 1}`);
    const normalized = createDiaryPost(post);
    if (normalized.text !== post.text) {
      throw new TypeError(`Browser export post ${index + 1} text is not normalized.`);
    }
    if (ids.has(normalized.id)) throw new TypeError(`Browser export post ID is duplicated: ${normalized.id}`);
    if (previousId !== undefined && BigInt(previousId) <= BigInt(normalized.id)) {
      throw new TypeError("Browser export posts must be sorted newest first.");
    }
    ids.add(normalized.id);
    previousId = normalized.id;
    return normalized;
  });

  return Object.freeze(posts);
}

export function combineDiaryBrowserExports(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("At least one browser export is required.");
  }

  const postsById = new Map();
  for (const value of values) {
    for (const post of validateDiaryBrowserExport(value)) {
      const existing = postsById.get(post.id);
      if (existing !== undefined && existing.text !== post.text) {
        throw new TypeError(`Browser exports contain conflicting text for post ${post.id}.`);
      }
      postsById.set(post.id, post);
    }
  }

  return Object.freeze([...postsById.values()].sort((left, right) => (BigInt(left.id) > BigInt(right.id) ? -1 : 1)));
}

function assertIsoTimestamp(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be an ISO timestamp.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new TypeError(`${label} must be an ISO timestamp.`);
  }
}

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new TypeError(`${label} has missing or unknown properties.`);
  }
}
