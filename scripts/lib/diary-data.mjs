const xEpochMilliseconds = 1_288_834_974_657n;

export const diarySource = Object.freeze({
  profileUrl: "https://x.com/sasakiuri",
  username: "sasakiuri",
});

export function createDiaryPost({ id, text }) {
  const publishedAt = publishedAtFromPostId(id);
  return Object.freeze({
    id,
    publishedAt,
    text: normalizePostText(text),
    url: `${diarySource.profileUrl}/status/${id}`,
  });
}

export function mergeDiaryPosts(currentData, fetchedPosts) {
  validateDiaryData(currentData);
  if (!Array.isArray(fetchedPosts) || fetchedPosts.length === 0) {
    throw new TypeError("Fetched diary posts must be a non-empty array.");
  }

  const byId = new Map(currentData.posts.map((post) => [post.id, post]));
  for (const post of fetchedPosts) byId.set(post.id, post);

  return validateDiaryData({
    posts: [...byId.values()].sort((left, right) => comparePostIdsDescending(left.id, right.id)),
    source: { ...diarySource },
    version: 1,
  });
}

export function publishedAtFromPostId(id) {
  if (typeof id !== "string" || !/^[1-9]\d{5,24}$/u.test(id)) {
    throw new TypeError("X post ID must contain 6 to 25 decimal digits.");
  }

  const timestamp = (BigInt(id) >> 22n) + xEpochMilliseconds;
  const date = new Date(Number(timestamp));
  if (!Number.isSafeInteger(Number(timestamp)) || Number.isNaN(date.valueOf())) {
    throw new TypeError(`X post ID has an invalid timestamp: ${id}`);
  }
  return date.toISOString();
}

export function validateDiaryData(value) {
  assertRecord(value, "diary data");
  assertExactKeys(value, ["posts", "source", "version"], "diary data");
  if (value.version !== 1) throw new TypeError("Diary data version must be 1.");

  assertRecord(value.source, "diary source");
  assertExactKeys(value.source, ["profileUrl", "username"], "diary source");
  if (value.source.profileUrl !== diarySource.profileUrl || value.source.username !== diarySource.username) {
    throw new TypeError("Diary source must be the configured public X profile.");
  }

  if (!Array.isArray(value.posts) || value.posts.length === 0) {
    throw new TypeError("Diary data must contain at least one post.");
  }

  const ids = new Set();
  let previousId;
  for (const [index, post] of value.posts.entries()) {
    assertRecord(post, `diary post ${index + 1}`);
    assertExactKeys(post, ["id", "publishedAt", "text", "url"], `diary post ${index + 1}`);
    const expected = createDiaryPost(post);
    for (const key of ["id", "publishedAt", "text", "url"]) {
      if (post[key] !== expected[key]) {
        throw new TypeError(`Diary post ${index + 1} has an invalid ${key}.`);
      }
    }
    if (ids.has(post.id)) throw new TypeError(`Diary post ID is duplicated: ${post.id}`);
    if (previousId !== undefined && comparePostIdsDescending(previousId, post.id) >= 0) {
      throw new TypeError("Diary posts must be sorted newest first.");
    }
    ids.add(post.id);
    previousId = post.id;
  }

  return deepFreeze(value);
}

function normalizePostText(value) {
  if (typeof value !== "string") throw new TypeError("Diary post text must be a string.");
  const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").replaceAll("\0", "").trim();
  if (normalized.length === 0) throw new TypeError("Diary post text must not be empty.");
  return normalized;
}

function comparePostIdsDescending(left, right) {
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  return leftId > rightId ? -1 : leftId < rightId ? 1 : 0;
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

function deepFreeze(value) {
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (typeof nested === "object" && nested !== null && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}
