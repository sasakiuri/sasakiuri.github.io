// @vitest-environment node

import { expect, it } from "vitest";

import { verifyMutationReport } from "./run-mutation.mjs";

function report(mutants) {
  return { files: { "source.ts": { mutants } } };
}

it.each([0, -1, undefined, 1.5])("rejects a surviving mutant without an executed test: %s", (testsCompleted) => {
  expect(() => verifyMutationReport(report([{ id: "1", status: "Survived", testsCompleted, coveredBy: [] }]))).toThrow(
    "ran no tests",
  );
});

it("accepts a survivor evaluated by a test and distinguishes import errors", () => {
  expect(() =>
    verifyMutationReport(
      report([
        { id: "1", status: "Survived", testsCompleted: 1 },
        { id: "2", status: "Killed", testsCompleted: 1 },
        { id: "3", status: "RuntimeError", testsCompleted: 0 },
      ]),
    ),
  ).not.toThrow();
});

it.each([undefined, {}, { files: [] }, { files: { "source.ts": {} } }, { files: {} }, report([])])(
  "rejects a missing or empty mutation report: %j",
  (result) => {
    expect(() => verifyMutationReport(result)).toThrow();
  },
);
