import { describe, expect, it } from "vitest";

import { defaultDiaryUrlState, parseDiaryUrlState, serializeDiaryUrlState } from "./diary-url-state";

const years = ["2026", "2025", "2024"];

describe("diary URL state", () => {
  it("uses compact defaults", () => {
    expect(parseDiaryUrlState("", years)).toEqual(defaultDiaryUrlState);
    expect(serializeDiaryUrlState(defaultDiaryUrlState)).toBe("");
  });

  it("round-trips every supported setting in a stable order", () => {
    const state = {
      dateFrom: "2025-01-02",
      dateTo: "2025-12-30",
      page: 3,
      pageSize: 25 as const,
      query: "狩猟 免許",
      sort: "oldest" as const,
      year: "2025",
    };
    const search = serializeDiaryUrlState(state);

    expect(search).toBe(
      "?q=%E7%8B%A9%E7%8C%9F+%E5%85%8D%E8%A8%B1&year=2025&from=2025-01-02&to=2025-12-30&sort=oldest&size=25&page=3",
    );
    expect(parseDiaryUrlState(search, years)).toEqual(state);
  });

  it("rejects unknown and out-of-range values", () => {
    expect(parseDiaryUrlState("?year=2020&sort=random&size=12&page=-1", years)).toEqual(defaultDiaryUrlState);
    expect(parseDiaryUrlState("?size=NaN&page=10001", years)).toEqual(defaultDiaryUrlState);
    expect(parseDiaryUrlState("?from=2025-02-30&to=yesterday", years)).toEqual(defaultDiaryUrlState);
    expect(parseDiaryUrlState("?from=2025-12-01&to=2025-01-01", years)).toEqual(defaultDiaryUrlState);
  });

  it("bounds an imported query and ignores unknown parameters", () => {
    const state = parseDiaryUrlState(`?q=${"a".repeat(120)}&unknown=value`, years);

    expect(state.query).toHaveLength(100);
    expect(serializeDiaryUrlState(state)).toBe(`?q=${"a".repeat(100)}`);
  });
});
