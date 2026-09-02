import { describe, expect, it } from "vitest";

import { combineDiaryBrowserExports, validateDiaryBrowserExport } from "./diary-browser-export.mjs";

const newer = { id: "2093251072781590942", text: "新しい投稿" };
const older = { id: "2088523830969143604", text: "古い投稿" };

describe("browser diary export", () => {
  it("validates a minimal, sanitized export", () => {
    const posts = validateDiaryBrowserExport(exportPayload([newer, older]));

    expect(posts).toHaveLength(2);
    expect(posts[0]).toEqual(
      expect.objectContaining({
        id: newer.id,
        publishedAt: "2026-08-28T08:15:21.132Z",
        text: newer.text,
      }),
    );
    expect(Object.isFrozen(posts)).toBe(true);
    expect(Object.isFrozen(posts[0])).toBe(true);
  });

  it("combines overlapping exports without duplicating posts", () => {
    const combined = combineDiaryBrowserExports([exportPayload([newer]), exportPayload([newer, older])]);

    expect(combined.map(({ id }) => id)).toEqual([newer.id, older.id]);
    expect(Object.isFrozen(combined)).toBe(true);
  });

  it.each([
    ["an empty export list", () => combineDiaryBrowserExports([]), /At least one/u],
    [
      "unknown top-level data",
      () => validateDiaryBrowserExport({ ...exportPayload([newer]), cookie: "must not be accepted" }),
      /unknown properties/u,
    ],
    [
      "the wrong source",
      () => validateDiaryBrowserExport({ ...exportPayload([newer]), source: { kind: "other", username: "other" } }),
      /configured X account/u,
    ],
    [
      "a malformed timestamp",
      () => validateDiaryBrowserExport({ ...exportPayload([newer]), exportedAt: "today" }),
      /ISO timestamp/u,
    ],
    ["no posts", () => validateDiaryBrowserExport(exportPayload([])), /between 1 and/u],
    [
      "non-normalized text",
      () => validateDiaryBrowserExport(exportPayload([{ ...newer, text: ` ${newer.text} ` }])),
      /not normalized/u,
    ],
    ["duplicate IDs", () => validateDiaryBrowserExport(exportPayload([newer, newer])), /duplicated/u],
    ["oldest-first data", () => validateDiaryBrowserExport(exportPayload([older, newer])), /newest first/u],
    [
      "conflicting exports",
      () => combineDiaryBrowserExports([exportPayload([newer]), exportPayload([{ ...newer, text: "異なる本文" }])]),
      /conflicting text/u,
    ],
  ])("rejects %s", (_label, operation, message) => {
    expect(operation).toThrow(message);
  });
});

function exportPayload(posts) {
  return {
    exportedAt: "2026-09-02T04:00:00.000Z",
    posts,
    source: { kind: "x-browser-dom-v1", username: "sasakiuri" },
    version: 1,
  };
}
