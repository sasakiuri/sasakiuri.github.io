// @vitest-environment node

import { expect, it, vi } from "vitest";

import { apiRoot, checkBaseChanges, liveBaseSha } from "./dependabot.mjs";

const head = "a".repeat(40);
const base = "b".repeat(40);
const old = "c".repeat(40);
const pull = { head: { sha: head }, base: { sha: old } };
const ref = { ref: "refs/heads/1.x", object: { type: "commit", sha: base } };

function setup({ ancestor = old, changes = {}, reference = ref } = {}) {
  return vi.fn(async (route) => {
    if (route === `${apiRoot}/git/ref/heads/1.x`) return reference;
    if (route === `${apiRoot}/compare/${head}...${base}`) return { merge_base_commit: { sha: ancestor } };
    if (route === `${apiRoot}/compare/${old}...${base}`) {
      return {
        status: "ahead",
        total_commits: 1,
        commits: [{ sha: base }],
        merge_base_commit: { sha: old },
        files: [{ filename: "src/content/diary.json", status: "modified" }],
        ...changes,
      };
    }
    if (route === `${apiRoot}/commits/${base}`)
      return { sha: base, files: changes.files ?? [{ filename: "src/content/diary.json", status: "modified" }] };
    throw new Error(`Unexpected request: ${route}`);
  });
}

it("accepts a PR already containing the current live base", async () => {
  const request = setup({ ancestor: base });
  expect(await checkBaseChanges(request, pull)).toEqual({ sha: base, allowed: true });
  expect(request).toHaveBeenCalledTimes(2);
});

it("uses the live ref and common ancestor even when PR base metadata is stale", async () => {
  const request = setup();
  expect(await checkBaseChanges(request, pull)).toEqual({ sha: base, allowed: true });
  expect(request).toHaveBeenCalledWith(`${apiRoot}/compare/${old}...${base}`);
});

it.each(["added", "modified", "removed"])("permits explicitly allowed content changes: %s", async (status) => {
  const request = setup({ changes: { files: [{ filename: "docs/operations.md", status }] } });
  expect((await checkBaseChanges(request, pull)).allowed).toBe(true);
});

it.each(["renamed", "copied"])("checks both paths of a %s file", async (status) => {
  const request = setup({
    changes: { files: [{ filename: "README.md", previous_filename: "docs/operations.md", status }] },
  });
  expect((await checkBaseChanges(request, pull)).allowed).toBe(true);
});

it.each([
  { filename: "pnpm-lock.yaml", status: "modified" },
  { filename: "package.json", status: "modified" },
  { filename: ".github/workflows/pipeline.yml", status: "modified" },
  { filename: "scripts/audit-dependencies.mjs", status: "modified" },
  { filename: "src/app/page.tsx", status: "modified" },
  { filename: "docs/new-tool.mjs", status: "added" },
  { filename: "docs/new.md", status: "added" },
  { filename: "docs/../pnpm-lock.yaml", status: "modified" },
  { filename: "README.md", previous_filename: "package.json", status: "renamed" },
  { filename: "README.md", previous_filename: "package.json", status: "copied" },
  { filename: "package.json", previous_filename: "README.md", status: "renamed" },
  { filename: "README.md", status: "renamed" },
  { filename: "README.md", status: "changed" },
  { filename: "README.md", status: "unchanged" },
  { filename: "README.md", status: "unknown" },
  {},
  null,
])("blocks dependency/code/unknown changes requiring a rebase: %j", async (file) => {
  const request = setup({ changes: { files: [file] } });
  expect((await checkBaseChanges(request, pull)).allowed).toBe(false);
});

it.each([
  { status: "diverged" },
  { status: "behind" },
  { merge_base_commit: { sha: head } },
  { files: undefined },
  { total_commits: 31 },
  { total_commits: 2 },
  { commits: [] },
  { commits: [{ sha: "invalid" }] },
  { files: [] },
  { files: Array.from({ length: 300 }, () => ({ filename: "README.md", status: "modified" })) },
])("fails closed when comparison is ambiguous or potentially truncated: %j", async (changes) => {
  expect((await checkBaseChanges(setup({ changes }), pull)).allowed).toBe(false);
});

it("does not proceed without a valid common ancestor", async () => {
  expect((await checkBaseChanges(setup({ ancestor: "invalid" }), pull)).allowed).toBe(false);
});

it.each([null, {}, { ...ref, object: { type: "tag", sha: base } }, { ...ref, object: { type: "commit", sha: "1.x" } }])(
  "does not accept missing or malformed live refs: %j",
  async (reference) => {
    await expect(liveBaseSha(setup({ reference }))).rejects.toThrow("valid 1.x commit");
  },
);

it("blocks a protected change reverted before the aggregate comparison", async () => {
  const request = setup();
  const original = request.getMockImplementation();
  request.mockImplementation((route) =>
    route.includes("/commits/")
      ? { sha: base, files: [{ filename: "package.json", status: "modified" }] }
      : original(route),
  );
  expect((await checkBaseChanges(request, pull)).allowed).toBe(false);
});

it("rejects a truncated individual commit even when the aggregate looks harmless", async () => {
  const request = setup();
  const original = request.getMockImplementation();
  request.mockImplementation((route) =>
    route.includes("/commits/")
      ? { sha: base, files: Array.from({ length: 300 }, () => ({ filename: "README.md", status: "modified" })) }
      : original(route),
  );
  expect((await checkBaseChanges(request, pull)).allowed).toBe(false);
});
