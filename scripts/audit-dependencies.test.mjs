// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

async function audit({ advisory = {}, finding = {}, now = "2026-10-20T00:00:00.000Z" } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "dependency-audit-test-"));
  directories.push(directory);
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
  const managerPath = path.join(directory, "package-manager.mjs");
  await writeFile(managerPath, `process.stdout.write(${JSON.stringify(JSON.stringify(report))});process.exitCode = 1;`);
  const clockPath = path.join(directory, "clock.mjs");
  await writeFile(clockPath, `Date.now = () => ${Date.parse(now)};`);
  return execute(
    process.execPath,
    ["--import", clockPath, new URL("./audit-dependencies.mjs", import.meta.url).pathname],
    { env: { ...process.env, npm_execpath: managerPath } },
  );
}

it("accepts only the scoped development dependency before its deadline", async () => {
  expect((await audit()).stdout).toContain("GHSA-mrhx-c7xc-m3w5 until 2026-11-03");
  expect((await audit({ now: "2026-11-03T23:59:59.999Z" })).stdout).toContain("No unaccepted high");
});

it("rejects the exception immediately after its deadline", async () => {
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
