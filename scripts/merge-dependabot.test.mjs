// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect, it, vi } from "vitest";

import { mergeDependabotUpdates } from "./merge-dependabot.mjs";

const repository = "sasakiuri/sasakiuri.github.io";
const apiRoot = `repos/${repository}`;
const sha = "a".repeat(40);
const pull = {
  number: 42,
  state: "open",
  draft: false,
  commits: 1,
  mergeable: true,
  user: { login: "dependabot[bot]", id: 49699333, type: "Bot" },
  base: { ref: "1.x", repo: { id: 1234, full_name: repository } },
  head: { ref: "dependabot/npm_and_yarn/next", sha, repo: { id: 1234, full_name: repository } },
};
const runs = ["pipeline", "security", "pr-title"].map((workflow, index) => ({
  id: index + 1,
  path: `.github/workflows/${workflow}.yml`,
  event: "pull_request",
  actor: pull.user,
  head_sha: sha,
  head_repository: { full_name: repository },
  pull_requests: [{ number: pull.number, base: pull.base, head: pull.head }],
  status: "completed",
  conclusion: "success",
}));

function setup({
  candidates = [[pull]],
  currentPull = pull,
  workflowRuns = runs,
  mergeResult = { merged: true, sha },
} = {}) {
  const request = vi.fn(async (route, options = {}) => {
    if (route.endsWith("/git/ref/heads/1.x"))
      return { ref: "refs/heads/1.x", object: { type: "commit", sha: "b".repeat(40) } };
    if (route.includes("/compare/")) return { merge_base_commit: { sha: "b".repeat(40) } };
    if (route.includes("/commits?"))
      return [[{ sha, author: pull.user, commit: { verification: { verified: true, reason: "valid" } } }]];
    if (route.includes("/pulls?")) return candidates;
    if (route.endsWith(`/pulls/${pull.number}`)) return currentPull;
    if (route.includes("/actions/runs?")) {
      expect(route).toContain(`head_sha=${currentPull.head.sha}`);
      expect(options.paginate).toBe(true);
      return [{ workflow_runs: workflowRuns.slice(0, 1) }, { workflow_runs: workflowRuns.slice(1) }];
    }
    if (route.endsWith("/merge")) return mergeResult;
    if (route.endsWith("/dispatches")) return null;
    throw new Error(`Unexpected GitHub request: ${route}`);
  });
  return { request, mutations: () => request.mock.calls.filter(([, options]) => options?.method !== undefined) };
}

it("merges a verified update with its exact SHA and starts verified deployment", async () => {
  const { request, mutations } = setup({ candidates: [[], [pull]] });
  expect(await mergeDependabotUpdates(request)).toEqual({
    merged: [42],
    ready: [42],
    waiting: [],
    blocked: [],
    errors: [],
  });
  expect(mutations()).toEqual([
    [`${apiRoot}/pulls/42/merge`, { method: "PUT", fields: { merge_method: "rebase", sha } }],
    [`${apiRoot}/dispatches`, { method: "POST", fields: { event_type: "dependabot-updated" } }],
  ]);
});

it("reports ready updates in a dry run without merging or deploying", async () => {
  const { request, mutations } = setup();
  expect(await mergeDependabotUpdates(request, { dryRun: true })).toEqual({
    merged: [],
    ready: [42],
    waiting: [],
    blocked: [],
    errors: [],
  });
  expect(mutations()).toEqual([]);
});

it.each([
  { user: { login: "another-user" } },
  { draft: true },
  { state: "closed" },
  { number: "42" },
  { base: { ...pull.base, ref: "another-branch" } },
  { base: { ...pull.base, repo: { full_name: "another/repository" } } },
  { head: { ...pull.head, repo: { full_name: "another/repository" } } },
  { head: { ...pull.head, ref: "another-branch" } },
  { head: { ...pull.head, sha: "invalid" } },
])("ignores an ineligible pull request: %j", async (change) => {
  const { request, mutations } = setup({ candidates: [[{ ...pull, ...change }]] });
  expect(await mergeDependabotUpdates(request)).toEqual({
    merged: [],
    ready: [],
    waiting: [],
    blocked: [],
    errors: [],
  });
  expect(request).toHaveBeenCalledTimes(1);
  expect(mutations()).toEqual([]);
});

it("rechecks the PR's eligibility instead of trusting the initial list", async () => {
  const { request, mutations } = setup({ currentPull: { ...pull, state: "closed" } });
  expect(await mergeDependabotUpdates(request)).toEqual({
    merged: [],
    ready: [],
    waiting: [],
    blocked: [],
    errors: [],
  });
  expect(mutations()).toEqual([]);
});

it.each([
  { conclusion: "failure" },
  { conclusion: "skipped" },
  { conclusion: "cancelled" },
  { conclusion: null, status: "queued" },
  { status: "in_progress" },
  { head_sha: "b".repeat(40) },
  { event: "push" },
  { head_repository: { full_name: "another/repository" } },
  { pull_requests: [{ number: 99 }] },
  { pull_requests: [{ number: pull.number, base: { ...pull.base, ref: "another-branch" }, head: pull.head }] },
  { pull_requests: [{ number: pull.number, base: pull.base, head: { ...pull.head, repo: { id: 9999 } } }] },
  { pull_requests: [{ number: pull.number, base: pull.base, head: { ...pull.head, sha: "b".repeat(40) } }] },
  { path: ".github/workflows/unrelated.yml", name: "Verify and deploy" },
])("waits when a required workflow is unsuccessful or unrelated: %j", async (change) => {
  const { request, mutations } = setup({ workflowRuns: [{ ...runs[0], ...change }, ...runs.slice(1)] });
  expect(await mergeDependabotUpdates(request)).toEqual({
    merged: [],
    ready: [],
    waiting: [42],
    blocked: [],
    errors: [],
  });
  expect(mutations()).toEqual([]);
});

it("waits if any required workflow has never run", async () => {
  const { request, mutations } = setup({ workflowRuns: runs.slice(1) });
  expect((await mergeDependabotUpdates(request)).waiting).toEqual([42]);
  expect(mutations()).toEqual([]);
});

it("does not use an earlier success while a newer run is pending", async () => {
  const { request, mutations } = setup({
    workflowRuns: [{ ...runs[0], id: 100, status: "queued", conclusion: null }, ...runs],
  });
  expect((await mergeDependabotUpdates(request)).waiting).toEqual([42]);
  expect(mutations()).toEqual([]);
});

it("accepts a newer successful run after an earlier failure", async () => {
  const { request } = setup({
    workflowRuns: [{ ...runs[0], conclusion: "failure" }, ...runs.slice(1), { ...runs[0], id: 100 }],
  });
  expect((await mergeDependabotUpdates(request)).merged).toEqual([42]);
});

it("does not deploy if GitHub refuses the merge", async () => {
  const { request, mutations } = setup({ mergeResult: { merged: false, message: "Head changed" } });
  expect((await mergeDependabotUpdates(request)).errors).toEqual([
    { pull: 42, reason: "GitHub merge request was not accepted" },
  ]);
  expect(mutations()).toHaveLength(1);
});

it("surfaces a deployment dispatch failure after a successful merge", async () => {
  const { request, mutations } = setup();
  const original = request.getMockImplementation();
  request.mockImplementation((route, options) => {
    if (route.endsWith("/dispatches")) throw new Error("Deployment dispatch failed");
    return original(route, options);
  });
  expect((await mergeDependabotUpdates(request)).errors[0].reason).toContain("merged, but dispatch failed");
  expect(mutations()).toHaveLength(2);
});

it("propagates API errors without merging or deploying", async () => {
  const { request, mutations } = setup();
  request.mockRejectedValueOnce(new Error("GitHub unavailable"));
  await expect(mergeDependabotUpdates(request)).rejects.toThrow("GitHub unavailable");
  expect(mutations()).toEqual([]);
});

it.each([false, null, undefined])("requires computed mergeability before merging: %s", async (mergeable) => {
  const { request, mutations } = setup({ currentPull: { ...pull, mergeable } });
  expect((await mergeDependabotUpdates(request)).waiting).toEqual([42]);
  expect(mutations()).toEqual([]);
});

it("does not trust mutable run or PR base metadata to authorize a stale base", async () => {
  const { request, mutations } = setup();
  const original = request.getMockImplementation();
  request.mockImplementation((route, options) =>
    route.includes("/compare/") ? { merge_base_commit: { sha: "c".repeat(40) } } : original(route, options),
  );
  expect((await mergeDependabotUpdates(request)).blocked).toEqual([
    { pull: 42, reason: "base changed; Dependabot rebase required" },
  ]);
  expect(mutations()).toEqual([]);
});

it.each(["pull", "base", "attempt"])("rechecks %s state immediately before merging", async (change) => {
  const { request, mutations } = setup();
  const original = request.getMockImplementation();
  let pullReads = 0;
  let refReads = 0;
  let runReads = 0;
  request.mockImplementation((route, options) => {
    if (route.endsWith("/pulls/42") && pullReads++ > 0 && change === "pull") return { ...pull, state: "closed" };
    if (route.endsWith("/git/ref/heads/1.x") && refReads++ > 0 && change === "base") {
      return { ref: "refs/heads/1.x", object: { type: "commit", sha: "d".repeat(40) } };
    }
    if (route.includes("/actions/runs?") && runReads++ > 0 && change === "attempt") {
      return [{ workflow_runs: [{ ...runs[0], status: "queued", run_attempt: 2 }, ...runs.slice(1)] }];
    }
    return original(route, options);
  });
  expect((await mergeDependabotUpdates(request)).waiting).toEqual([42]);
  expect(mutations()).toEqual([]);
});

it.each(["success", "failure"])(
  "does not hide a newer human-triggered run behind a bot success: %s",
  async (conclusion) => {
    const { request, mutations } = setup({
      workflowRuns: [...runs, { ...runs[0], id: 100, actor: { login: "another-user" }, conclusion }],
    });
    expect((await mergeDependabotUpdates(request)).blocked).toEqual([
      { pull: 42, reason: "workflow actor requires manual review" },
    ]);
    expect(mutations()).toEqual([]);
  },
);

it("allows a maintainer to rerun the original Dependabot event", async () => {
  const { request } = setup({
    workflowRuns: runs.map((run) => ({ ...run, triggering_actor: { login: "another-user" } })),
  });
  expect((await mergeDependabotUpdates(request)).merged).toEqual([42]);
});

it("blocks a modified branch with unsigned or non-bot commits", async () => {
  const { request, mutations } = setup();
  const original = request.getMockImplementation();
  request.mockImplementation((route, options) =>
    route.includes("/commits?") ? [[{ sha, author: { login: "another-user" } }]] : original(route, options),
  );
  expect((await mergeDependabotUpdates(request)).blocked).toEqual([
    { pull: 42, reason: "commit provenance requires manual review" },
  ]);
  expect(mutations()).toEqual([]);
});

it("continues the sweep after one merge endpoint fails", async () => {
  const { request } = setup({ candidates: [[pull, { ...pull, number: 43 }]] });
  const original = request.getMockImplementation();
  request.mockImplementation((route, options) => {
    if (route.endsWith("/42/merge")) throw new Error("405");
    if (route.endsWith("/pulls/43")) return { ...pull, number: 43, mergeable: null };
    return original(route, options);
  });
  const result = await mergeDependabotUpdates(request);
  expect(result.errors).toEqual([{ pull: 42, reason: "GitHub pull request inspection or merge failed" }]);
  expect(result.waiting).toEqual([43]);
});

it("reports a green PR blocked by base drift to Actions and exits unsuccessfully", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dependabot-merge-test-"));
  try {
    const summary = path.join(directory, "summary.md");
    const fixtures = JSON.stringify({ pull, runs, sha });
    await writeFile(
      path.join(directory, "gh"),
      `#!${process.execPath}
      const {pull,runs,sha} = ${fixtures};
      const route = process.argv[5];
      let value;
      if (route.includes('/pulls?')) value = [pull];
      else if (route.endsWith('/pulls/42')) value = pull;
      else if (route.includes('/commits?')) value = [{sha, author: pull.user, commit: {verification: {verified: true, reason: 'valid'}}}];
      else if (route.includes('/actions/runs?')) value = {workflow_runs: runs};
      else if (route.endsWith('/git/ref/heads/1.x')) value = {ref: 'refs/heads/1.x', object: {type: 'commit', sha: 'b'.repeat(40)}};
      else if (route.includes('/compare/')) value = {merge_base_commit: {sha: 'c'.repeat(40)}};
      else throw new Error('Unexpected mutation or route');
      process.stdout.write(JSON.stringify(value));
    `,
      { mode: 0o755 },
    );
    let result;
    try {
      result = await promisify(execFile)(
        process.execPath,
        [new URL("./merge-dependabot.mjs", import.meta.url).pathname],
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
    expect(JSON.parse(result.stdout).blocked).toEqual([
      { pull: 42, reason: "base changed; Dependabot rebase required" },
    ]);
    expect(await readFile(summary, "utf8")).toContain("blocked: [PR #42]");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
