#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
const packageManagerPath = process.env.npm_execpath;

if (packageManagerPath === undefined) {
  throw new Error("Run this audit through the package manager script.");
}

const exceptions = new Map([
  [
    "GHSA-w3rx-r6r6-pgpr",
    {
      expires: "2026-09-30",
      moduleName: "image-size",
      pathSuffix: "@storybook/nextjs-vite>vite-plugin-storybook-nextjs>image-size",
      version: "2.0.2",
    },
  ],
  [
    "GHSA-5p2g-fcmc-qvqq",
    {
      expires: "2026-09-30",
      moduleName: "image-size",
      pathSuffix: "@storybook/nextjs-vite>vite-plugin-storybook-nextjs>image-size",
      version: "2.0.2",
    },
  ],
]);

let output;
try {
  ({ stdout: output } = await execute(process.execPath, [packageManagerPath, "audit", "--json"], {
    maxBuffer: 16 * 1024 * 1024,
  }));
} catch (error) {
  if (typeof error?.stdout !== "string" || error.stdout.length === 0) {
    throw error;
  }
  output = error.stdout;
}

const report = JSON.parse(output);
const accepted = [];
const rejected = [];

for (const advisory of Object.values(report.advisories ?? {})) {
  if (advisory.severity !== "high" && advisory.severity !== "critical") {
    continue;
  }

  const exception = exceptions.get(advisory.github_advisory_id);
  if (exception !== undefined && matchesException(advisory, exception)) {
    accepted.push(`${advisory.github_advisory_id} until ${exception.expires}`);
  } else {
    rejected.push(`${advisory.github_advisory_id ?? advisory.id}: ${advisory.title}`);
  }
}

if (accepted.length > 0) {
  process.stdout.write(`Accepted time-bounded development exceptions:\n- ${accepted.join("\n- ")}\n`);
}

if (rejected.length > 0) {
  process.stderr.write(`Unaccepted high or critical dependency advisories:\n- ${rejected.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("No unaccepted high or critical dependency advisories.\n");
}

function matchesException(advisory, exception) {
  const expiresAt = Date.parse(`${exception.expires}T23:59:59.999Z`);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt || advisory.module_name !== exception.moduleName) {
    return false;
  }

  return (
    advisory.findings.length > 0 &&
    advisory.findings.every(
      (finding) =>
        finding.dev === true &&
        finding.version === exception.version &&
        finding.paths.length > 0 &&
        finding.paths.every((dependencyPath) => dependencyPath.endsWith(exception.pathSuffix)),
    )
  );
}
