// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { checkDependencyExceptionDeadlines } from "./check-dependency-exceptions.mjs";

const exceptions = new Map([["GHSA-example", { expires: "2026-11-03" }]]);
const deadline = Date.parse("2026-11-03T23:59:59.999Z");
const week = 7 * 24 * 60 * 60 * 1000;
const execute = promisify(execFile);

it.each([
  [deadline - week - 1, "accepted"],
  [deadline - week, "due"],
  [deadline, "due"],
  [deadline + 1, "expired"],
])("reports the deadline state at %s as %s", (now, status) => {
  expect(checkDependencyExceptionDeadlines({ exceptions, now })).toEqual([
    { advisory: "GHSA-example", expires: "2026-11-03", status },
  ]);
});

it.each(["not-a-date", "2026-02-30", "2026-11-03T00:00:00Z", undefined])(
  "rejects an invalid deadline instead of reporting success: %s",
  (expires) => {
    expect(() =>
      checkDependencyExceptionDeadlines({ exceptions: new Map([["GHSA-example", { expires }]]), now: deadline }),
    ).toThrow("invalid deadline");
  },
);

it("rejects an invalid clock instead of reporting success", () => {
  expect(() => checkDependencyExceptionDeadlines({ exceptions, now: Number.NaN })).toThrow("valid current time");
});

it("passes when no exceptions remain", () => {
  expect(checkDependencyExceptionDeadlines({ exceptions: new Map(), now: deadline })).toEqual([]);
});

it("checks the same policy used by the dependency audit", () => {
  expect(checkDependencyExceptionDeadlines({ now: Date.parse("2026-11-04T00:00:00Z") })).toEqual([
    { advisory: "GHSA-mrhx-c7xc-m3w5", expires: "2026-11-03", status: "expired" },
  ]);
});

it.each([
  ["2026-10-24T00:00:00Z", "accepted", 0],
  ["2026-10-28T00:00:00Z", "due", 1],
  ["2026-11-04T00:00:00Z", "expired", 1],
])("reports the policy to Actions and exits appropriately at %s", async (date, status, code) => {
  const directory = await mkdtemp(path.join(tmpdir(), "exception-deadline-test-"));
  try {
    const clock = path.join(directory, "clock.mjs");
    const summary = path.join(directory, "summary.md");
    await writeFile(clock, `Date.now = () => ${Date.parse(date)};`);
    let result;
    try {
      result = await execute(
        process.execPath,
        ["--import", clock, new URL("./check-dependency-exceptions.mjs", import.meta.url).pathname],
        { env: { ...process.env, GITHUB_STEP_SUMMARY: summary } },
      );
    } catch (error) {
      result = error;
    }
    expect(result.code ?? 0).toBe(code);
    expect(JSON.parse(result.stdout).exceptions[0].status).toBe(status);
    expect(await readFile(summary, "utf8")).toContain(`GHSA-mrhx-c7xc-m3w5: ${status}; expires 2026-11-03`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
