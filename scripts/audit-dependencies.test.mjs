// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, expect, it } from "vitest";

const execute = promisify(execFile);
const directories = [];
const allowedPaths = [".>lighthouse>puppeteer-core>chromium-bidi>zod"];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function audit({
  advisory = {},
  finding = {},
  graph = [{ name: "site" }, { name: "tools" }],
  toolGraph = graph,
  now = "2026-10-20T00:00:00.000Z",
  advisories,
  toolAdvisories,
  toolReport,
  workspaceOutput,
} = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "dependency-audit-test-"));
  directories.push(directory);
  await mkdir(path.join(directory, "tools"));
  const report = {
    advisories: {
      1: {
        github_advisory_id: "GHSA-mrhx-c7xc-m3w5",
        module_name: "zod",
        severity: "high",
        title: "Zod collection validation exhausts memory",
        findings: [{ dev: true, version: "3.25.76", paths: allowedPaths, ...finding }],
        ...advisory,
      },
    },
  };
  if (advisories !== undefined) report.advisories = advisories;
  const managerPath = path.join(directory, "package-manager.mjs");
  await writeFile(
    managerPath,
    `const tool = process.argv.includes(${JSON.stringify(path.join(directory, "tools"))});
    if (process.argv.includes("--parseable")) {
      process.stdout.write(${JSON.stringify(workspaceOutput ?? `${directory}\n${path.join(directory, "tools")}\n`)});
    } else if (process.argv.includes("list")) {
      if (process.argv[process.argv.indexOf("--filter") + 1] !== "." || process.cwd() !== process.argv[process.argv.indexOf("--dir") + 1]) {
        throw new Error("Graph listing requires an exact project filter from its own directory.");
      }
      process.stdout.write(tool ? ${JSON.stringify(JSON.stringify(toolGraph))} : ${JSON.stringify(JSON.stringify(graph))});
    } else {
      process.stdout.write(tool ? ${JSON.stringify(JSON.stringify(toolReport === undefined ? { ...report, advisories: toolAdvisories ?? report.advisories } : toolReport))} : ${JSON.stringify(JSON.stringify(report))});
      process.exitCode = 1;
    }`,
  );
  const clockPath = path.join(directory, "clock.mjs");
  await writeFile(clockPath, `Date.now = () => ${Date.parse(now)};`);
  return execute(
    process.execPath,
    ["--import", clockPath, new URL("./audit-dependencies.mjs", import.meta.url).pathname],
    { env: { ...process.env, npm_execpath: managerPath } },
  );
}

it("passes a clean audit with no mapper in any workspace", async () => {
  expect((await audit({ advisories: {} })).stdout).toContain("No unaccepted high");
});

it.each(["dependencies", "devDependencies", "optionalDependencies"])(
  "rejects a mapper introduced through a workspace's %s even when the advisory database is clean",
  async (section) => {
    await expect(
      audit({
        advisories: {},
        toolGraph: [
          { name: "site" },
          {
            name: "tools",
            [section]: { anotherTool: { dependencies: { "chromium-bidi": { version: "157.0.8090-0" } } } },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("must not include chromium-bidi") });
  },
);

it("audits a tool lockfile even when the root audit is clean", async () => {
  await expect(
    audit({
      advisories: {},
      toolAdvisories: { 1: { github_advisory_id: "GHSA-tools", severity: "critical", title: "Tool vulnerability" } },
    }),
  ).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("tools: GHSA-tools") });
});

it.each([null, {}, { advisories: [] }, { advisories: {}, error: { code: "REGISTRY_UNAVAILABLE" } }])(
  "rejects an unsuccessful tool audit rather than reporting a clean workspace: %j",
  async (toolReport) => {
    await expect(audit({ advisories: {}, toolReport })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("did not return an advisory report"),
    });
  },
);

it.each(["", "relative/workspace\n"])("rejects invalid workspace discovery: %j", async (workspaceOutput) => {
  await expect(audit({ advisories: {}, workspaceOutput })).rejects.toMatchObject({ code: 1 });
});

it.each([[], {}])("rejects an incomplete dependency graph: %j", async (graph) => {
  await expect(audit({ advisories: {}, graph })).rejects.toMatchObject({ code: 1 });
});

it("rejects the former Lighthouse exception even before its old deadline", async () => {
  await expect(audit()).rejects.toMatchObject({ code: 1 });
  await expect(audit({ now: "2026-11-03T23:59:59.999Z" })).rejects.toMatchObject({ code: 1 });
});

it("continues to reject the former exception after its old deadline", async () => {
  await expect(audit({ now: "2026-11-04T00:00:00.000Z" })).rejects.toMatchObject({ code: 1 });
});

it.each([
  { dev: false },
  { version: "3.25.75" },
  { version: "4.4.3" },
  { paths: [".>zod"] },
  { paths: [".>puppeteer-core>chromium-bidi>zod"] },
  { paths: [".>other-lighthouse>puppeteer-core>chromium-bidi>zod"] },
  { paths: [...allowedPaths, ".>application>zod"] },
  { paths: [] },
])("rejects an out-of-scope finding: %j", async (finding) => {
  await expect(audit({ finding })).rejects.toMatchObject({ code: 1 });
});

it.each([{ github_advisory_id: "GHSA-unrelated" }, { module_name: "another-package" }, { findings: [] }])(
  "rejects an out-of-scope advisory: %j",
  async (advisory) => {
    await expect(audit({ advisory })).rejects.toMatchObject({ code: 1 });
  },
);

it.each([
  { dev: false, version: "3.25.76", paths: allowedPaths },
  { dev: true, version: "4.4.3", paths: allowedPaths },
  { dev: true, version: "3.25.76", paths: [".>application>zod"] },
])("rejects an advisory that also contains an out-of-scope finding: %j", async (finding) => {
  await expect(
    audit({ advisory: { findings: [{ dev: true, version: "3.25.76", paths: allowedPaths }, finding] } }),
  ).rejects.toMatchObject({ code: 1 });
});

it("continues to reject unrelated critical advisories", async () => {
  await expect(
    audit({ advisory: { severity: "critical", github_advisory_id: "GHSA-unrelated" } }),
  ).rejects.toMatchObject({
    code: 1,
  });
});
