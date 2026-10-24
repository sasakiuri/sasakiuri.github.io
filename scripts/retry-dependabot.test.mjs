// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, it, vi } from "vitest";

import { apiRoot, repository, requiredWorkflows } from "./lib/dependabot.mjs";
import { retryDependabotChecks } from "./retry-dependabot.mjs";

const sha = "a".repeat(40);
const now = Date.parse("2026-10-24T09:00:00Z");
const pull = {
  number: 42,
  state: "open",
  draft: false,
  mergeable: true,
  user: { login: "dependabot[bot]" },
  base: { ref: "1.x", repo: { id: 1234, full_name: repository } },
  head: { ref: "dependabot/npm_and_yarn/security-updates", sha, repo: { id: 1234, full_name: repository } },
};
const runs = requiredWorkflows.map((workflow, index) => ({
  id: 100 + index,
  path: workflow,
  event: "pull_request",
  head_sha: sha,
  head_repository: { full_name: repository },
  pull_requests: [{ number: pull.number, base: pull.base, head: pull.head }],
  status: "completed",
  conclusion: index === 0 ? "failure" : "success",
  run_attempt: 1,
  created_at: "2026-10-23T06:00:00Z",
  updated_at: "2026-10-23T07:00:00Z",
}));
const entry = { pull: 42, workflow: requiredWorkflows[0], run: 100 };

function setup({
  candidates = [pull],
  currentPull = pull,
  beforeRetryPull = currentPull,
  workflowRuns = runs,
  refreshedRuns = workflowRuns,
  detail,
} = {}) {
  let pullReads = 0;
  let runReads = 0;
  const request = vi.fn(async (route, options = {}) => {
    if (route.endsWith("/git/ref/heads/1.x"))
      return { ref: "refs/heads/1.x", object: { type: "commit", sha: "b".repeat(40) } };
    if (route.includes("/compare/")) return { merge_base_commit: { sha: "b".repeat(40) } };
    if (route.includes("/pulls?")) return [[], candidates];
    if (route.endsWith("/pulls/42")) return pullReads++ === 0 ? currentPull : beforeRetryPull;
    if (route.includes("/actions/runs?")) {
      expect(route).toContain(`head_sha=${sha}`);
      expect(options.paginate).toBe(true);
      const records = runReads++ === 0 ? workflowRuns : refreshedRuns;
      return [{ workflow_runs: records.slice(0, 1) }, { workflow_runs: records.slice(1) }];
    }
    if (route.endsWith("/rerun")) return null;
    const match = /\/actions\/runs\/(\d+)$/u.exec(route);
    if (match) return detail ?? workflowRuns.find(({ id }) => id === Number(match[1]));
    throw new Error(`Unexpected request: ${route}`);
  });
  return {
    request,
    mutations: () => request.mock.calls.filter(([, options]) => options?.method !== undefined),
  };
}

it("rechecks identity and retries the whole workflow exactly at the 26-hour boundary", async () => {
  const { request, mutations } = setup();
  expect(await retryDependabotChecks(request, { now })).toEqual({
    ready: [entry],
    retried: [entry],
    waiting: [],
    blocked: [],
    errors: [],
  });
  expect(mutations()).toEqual([[`${apiRoot}/actions/runs/100/rerun`, { method: "POST" }]]);
  expect(request.mock.calls.filter(([route]) => route.endsWith("/pulls/42"))).toHaveLength(3);
  expect(request.mock.calls.filter(([route]) => route.includes("/actions/runs?"))).toHaveLength(2);
});

it("performs the same eligibility checks in a dry run without mutations", async () => {
  const { request, mutations } = setup();
  const result = await retryDependabotChecks(request, { now, dryRun: true });
  expect(result.ready).toEqual([entry]);
  expect(result.retried).toEqual([]);
  expect(mutations()).toEqual([]);
});

it("waits until the full release-age buffer has elapsed", async () => {
  const { request, mutations } = setup();
  expect((await retryDependabotChecks(request, { now: now - 1 })).waiting).toEqual([
    { ...entry, reason: "retry delay" },
  ]);
  expect(mutations()).toEqual([]);
});

it.each([1, 2, 3, 4])("limits the original workflow to three total attempts: %s", async (run_attempt) => {
  const { request, mutations } = setup({ workflowRuns: [{ ...runs[0], run_attempt }, ...runs.slice(1)] });
  const result = await retryDependabotChecks(request, { now });
  expect(result.retried).toHaveLength(run_attempt < 3 ? 1 : 0);
  expect(mutations()).toHaveLength(run_attempt < 3 ? 1 : 0);
  if (run_attempt >= 3) expect(result.blocked).toEqual([{ ...entry, reason: "attempt limit reached" }]);
});

it.each([
  { user: { login: "someone-else" } },
  { state: "closed" },
  { draft: true },
  { number: "42" },
  { base: { ...pull.base, ref: "main" } },
  { base: { ...pull.base, repo: { id: 1234, full_name: "another/repository" } } },
  { head: { ...pull.head, repo: { id: 9999, full_name: "another/repository" } } },
  { head: { ...pull.head, ref: "a-human-branch" } },
  { head: { ...pull.head, ref: undefined } },
  { head: { ...pull.head, sha: "invalid" } },
  { head: { ...pull.head, repo: { full_name: repository } } },
])("never retries an ineligible candidate: %j", async (change) => {
  const { request, mutations } = setup({ candidates: [{ ...pull, ...change }] });
  expect(await retryDependabotChecks(request, { now })).toEqual({
    ready: [],
    retried: [],
    waiting: [],
    blocked: [],
    errors: [],
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(mutations()).toEqual([]);
});

it("rechecks eligibility after listing PRs", async () => {
  const { request, mutations } = setup({ currentPull: { ...pull, state: "closed" } });
  expect((await retryDependabotChecks(request, { now })).retried).toEqual([]);
  expect(request).toHaveBeenCalledTimes(2);
  expect(mutations()).toEqual([]);
});

it("reports merge conflicts without spending retry attempts", async () => {
  const { request, mutations } = setup({ currentPull: { ...pull, mergeable: false } });
  expect((await retryDependabotChecks(request, { now })).blocked).toEqual([{ pull: 42, reason: "merge conflict" }]);
  expect(mutations()).toEqual([]);
});

it("waits while GitHub computes mergeability", async () => {
  const { request, mutations } = setup({ currentPull: { ...pull, mergeable: null } });
  expect((await retryDependabotChecks(request, { now })).waiting).toEqual([
    { pull: 42, reason: "mergeability not computed" },
  ]);
  expect(mutations()).toEqual([]);
});

it("waits if GitHub's completion timestamp is ahead of the runner clock", async () => {
  const { request, mutations } = setup({
    workflowRuns: [{ ...runs[0], updated_at: new Date(now + 1000).toISOString() }, ...runs.slice(1)],
  });
  expect((await retryDependabotChecks(request, { now })).waiting).toEqual([
    { ...entry, reason: "runner clock behind GitHub" },
  ]);
  expect(mutations()).toEqual([]);
});

it.each([
  [now - 1000, "waiting"],
  [now - 26 * 60 * 60 * 1000, "blocked"],
])("escalates a missing required workflow after the release wait: %s", async (updated, state) => {
  const { request, mutations } = setup({
    currentPull: { ...pull, updated_at: new Date(updated).toISOString() },
    workflowRuns: runs.slice(1),
  });
  const result = await retryDependabotChecks(request, { now });
  expect(result[state]).toHaveLength(1);
  expect(result[state][0].reason).toContain(state === "waiting" ? "not completed" : "required workflow missing");
  expect(mutations()).toEqual([]);
});

it("blocks retries against changed dependency or workflow code on the base", async () => {
  const { request, mutations } = setup();
  const original = request.getMockImplementation();
  request.mockImplementation((route, options) =>
    route.includes("/compare/") ? { merge_base_commit: { sha: "c".repeat(40) } } : original(route, options),
  );
  expect((await retryDependabotChecks(request, { now })).blocked).toEqual([
    { ...entry, reason: "base changed; Dependabot rebase required" },
  ]);
  expect(mutations()).toEqual([]);
});

it("checks the live base again immediately before requesting a retry", async () => {
  const { request, mutations } = setup();
  const original = request.getMockImplementation();
  let reads = 0;
  request.mockImplementation((route, options) => {
    if (route.endsWith("/git/ref/heads/1.x") && reads++ > 0) {
      return { ref: "refs/heads/1.x", object: { type: "commit", sha: "d".repeat(40) } };
    }
    return original(route, options);
  });
  expect((await retryDependabotChecks(request, { now })).waiting).toEqual([
    { ...entry, reason: "pull request or base changed" },
  ]);
  expect(mutations()).toEqual([]);
});

it("continues inspecting other PRs after an API error", async () => {
  const { request } = setup({ candidates: [pull, { ...pull, number: 43 }] });
  const original = request.getMockImplementation();
  request.mockImplementation((route, options) => {
    if (route.endsWith("/pulls/42")) throw new Error("503");
    if (route.endsWith("/pulls/43")) return { ...pull, number: 43, mergeable: false };
    return original(route, options);
  });
  const result = await retryDependabotChecks(request, { now });
  expect(result.errors).toEqual([{ pull: 42, reason: "GitHub pull request inspection failed" }]);
  expect(result.blocked).toEqual([{ pull: 43, reason: "merge conflict" }]);
});

it("continues other workflows after a failed POST and re-derives state on the next sweep", async () => {
  const { request } = setup({ workflowRuns: runs.map((run) => ({ ...run, conclusion: "failure" })) });
  const original = request.getMockImplementation();
  let fail = true;
  request.mockImplementation((route, options) => {
    if (route.endsWith("/100/rerun") && fail) throw new Error("503");
    return original(route, options);
  });
  const result = await retryDependabotChecks(request, { now });
  expect(result.retried.map(({ run }) => run)).toEqual([101, 102]);
  expect(result.errors).toEqual([{ ...entry, reason: "GitHub rerun request failed" }]);
  fail = false;
  expect((await retryDependabotChecks(request, { now })).retried.map(({ run }) => run)).toEqual([100, 101, 102]);
});

it.each(["cancelled", "skipped", "action_required", "neutral", "stale"])(
  "preserves the non-retryable workflow conclusion: %s",
  async (conclusion) => {
    const { request, mutations } = setup({ workflowRuns: [{ ...runs[0], conclusion }, ...runs.slice(1)] });
    expect((await retryDependabotChecks(request, { now })).blocked).toEqual([
      { ...entry, reason: "manual action required" },
    ]);
    expect(mutations()).toEqual([]);
  },
);

it.each(["queued", "in_progress", "waiting"])("does not retry an active workflow: %s", async (status) => {
  const { request, mutations } = setup({ workflowRuns: [{ ...runs[0], status }, ...runs.slice(1)] });
  expect((await retryDependabotChecks(request, { now })).waiting).toEqual([
    { ...entry, reason: "workflow not completed" },
  ]);
  expect(mutations()).toEqual([]);
});

it("can recover a timed-out workflow after the same delay", async () => {
  const { request } = setup({ workflowRuns: [{ ...runs[0], conclusion: "timed_out" }, ...runs.slice(1)] });
  expect((await retryDependabotChecks(request, { now })).retried).toEqual([entry]);
});

it.each([
  { run_attempt: undefined },
  { run_attempt: 0 },
  { run_attempt: "1" },
  { created_at: "invalid" },
  { updated_at: undefined },
  { created_at: "2026-10-24T00:00:00Z" },
])("rejects incomplete or inconsistent retry metadata: %j", async (change) => {
  const { request, mutations } = setup({ workflowRuns: [{ ...runs[0], ...change }, ...runs.slice(1)] });
  expect((await retryDependabotChecks(request, { now })).blocked).toEqual([
    { ...entry, reason: "invalid retry metadata" },
  ]);
  expect(mutations()).toEqual([]);
});

it("does not request reruns after GitHub's 30-day limit", async () => {
  const created_at = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { request, mutations } = setup({ workflowRuns: [{ ...runs[0], created_at }, ...runs.slice(1)] });
  expect((await retryDependabotChecks(request, { now })).blocked).toEqual([
    { ...entry, reason: "run is at least 30 days old" },
  ]);
  expect(mutations()).toEqual([]);
});

it.each([
  { id: "100" },
  { path: ".github/workflows/unrelated.yml" },
  { event: "push" },
  { head_sha: "b".repeat(40) },
  { head_repository: { full_name: "another/repository" } },
  { pull_requests: [] },
  { pull_requests: [{ number: 999 }] },
  { pull_requests: [{ number: 42 }] },
  { pull_requests: [{ number: 42, base: { ...pull.base, ref: "another-branch" }, head: pull.head }] },
  { pull_requests: [{ number: 42, base: pull.base, head: { ...pull.head, sha: "b".repeat(40) } }] },
  { pull_requests: [{ number: 42, base: pull.base, head: { ...pull.head, repo: { id: 9999 } } }] },
])("rejects unrelated or malformed workflow associations: %j", async (change) => {
  const { request, mutations } = setup({ workflowRuns: [{ ...runs[0], ...change }, ...runs.slice(1)] });
  expect((await retryDependabotChecks(request, { now })).retried).toEqual([]);
  expect(mutations()).toEqual([]);
});

it("does not retry an older failure when a newer run is pending", async () => {
  const { request, mutations } = setup({ workflowRuns: [...runs, { ...runs[0], id: 200, status: "queued" }] });
  expect((await retryDependabotChecks(request, { now })).retried).toEqual([]);
  expect(mutations()).toEqual([]);
});

it.each([{ state: "closed" }, { mergeable: false }, { head: { ...pull.head, sha: "b".repeat(40) } }])(
  "stops if the PR changes before the mutation: %j",
  async (change) => {
    const { request, mutations } = setup({ beforeRetryPull: { ...pull, ...change } });
    expect((await retryDependabotChecks(request, { now })).waiting).toEqual([
      { ...entry, reason: "pull request changed" },
    ]);
    expect(mutations()).toEqual([]);
  },
);

it.each([
  { id: 200 },
  { run_attempt: 2 },
  { updated_at: "2026-10-23T08:00:00Z" },
  { conclusion: "success" },
  { status: "queued" },
])("stops if a newer workflow state appears before mutation: %j", async (change) => {
  const { request, mutations } = setup({ refreshedRuns: [{ ...runs[0], ...change }, ...runs.slice(1)] });
  expect((await retryDependabotChecks(request, { now })).waiting).toEqual([{ ...entry, reason: "workflow changed" }]);
  expect(mutations()).toEqual([]);
});

it.each([
  { id: 999 },
  { head_sha: "b".repeat(40) },
  { path: requiredWorkflows[1] },
  { run_attempt: 3 },
  { updated_at: "2026-10-23T08:00:00Z" },
  { status: "in_progress" },
  { conclusion: "success" },
])("rechecks the individual run immediately before retrying: %j", async (change) => {
  const { request, mutations } = setup({ detail: { ...runs[0], ...change } });
  expect((await retryDependabotChecks(request, { now })).waiting).toEqual([{ ...entry, reason: "workflow changed" }]);
  expect(mutations()).toEqual([]);
});

it("surfaces API failures instead of hiding unsuccessful retry requests", async () => {
  const { request } = setup();
  const original = request.getMockImplementation();
  request.mockImplementation((route, options) => {
    if (options?.method === "POST") throw new Error("GitHub rejected the rerun");
    return original(route, options);
  });
  const result = await retryDependabotChecks(request, { now });
  expect(result.retried).toEqual([]);
  expect(result.errors).toEqual([{ ...entry, reason: "GitHub rerun request failed" }]);
});

it("rejects an invalid clock before accessing GitHub", async () => {
  const { request } = setup();
  await expect(retryDependabotChecks(request, { now: Number.NaN })).rejects.toThrow("valid current time");
  expect(request).not.toHaveBeenCalled();
});

it("writes the Actions summary and exits unsuccessfully after a per-PR API error", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dependabot-retry-test-"));
  try {
    const summary = path.join(directory, "summary.md");
    await writeFile(
      path.join(directory, "gh"),
      `#!${process.execPath}\nif (process.argv[5].includes('/pulls?')) process.stdout.write(${JSON.stringify(JSON.stringify([pull]))}); else process.exitCode = 1;\n`,
      { mode: 0o755 },
    );
    let result;
    try {
      result = await promisify(execFile)(
        process.execPath,
        [new URL("./retry-dependabot.mjs", import.meta.url).pathname],
        {
          env: {
            ...process.env,
            PATH: `${directory}${path.delimiter}${process.env.PATH}`,
            GITHUB_STEP_SUMMARY: summary,
          },
        },
      );
    } catch (error) {
      result = error;
    }
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).errors).toEqual([{ pull: 42, reason: "GitHub pull request inspection failed" }]);
    expect(await readFile(summary, "utf8")).toContain("errors: [PR #42]");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
