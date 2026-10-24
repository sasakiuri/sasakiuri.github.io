#!/usr/bin/env node

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { dependencyAuditExceptions, dependencyExceptionDeadline } from "./lib/dependency-audit-policy.mjs";

const execute = promisify(execFile);
const packageManagerPath = process.env.npm_execpath;

if (packageManagerPath === undefined) {
  throw new Error("Run this audit through the package manager script.");
}

const { stdout: directoryOutput } = await execute(
  process.execPath,
  [packageManagerPath, "list", "--recursive", "--depth", "-1", "--parseable"],
  { maxBuffer: 16 * 1024 * 1024 },
);
const directories = directoryOutput.trim().split(/\r?\n/u);
if (directories.some((directory) => !path.isAbsolute(directory)) || new Set(directories).size !== directories.length) {
  throw new Error("The dependency graph did not identify the workspace directories.");
}

const accepted = [];
const rejected = [];

// The pnpm audit command checks only the selected project’s lockfile.
for (const directory of directories) {
  // Advisory scanners do not inspect the Zod code embedded in the BiDi mapper.
  // Read each lockfile so stale node_modules cannot hide a reintroduced mapper.
  const { stdout: graphOutput } = await execute(
    process.execPath,
    [
      packageManagerPath,
      "--dir",
      directory,
      "--filter",
      ".",
      "list",
      "--lockfile-only",
      "--depth",
      "Infinity",
      "--json",
      "chromium-bidi",
    ],
    { cwd: directory, maxBuffer: 16 * 1024 * 1024 },
  );
  const projects = JSON.parse(graphOutput);
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error("The dependency graph did not include any workspace projects.");
  }
  if (
    projects.some((project) =>
      ["dependencies", "devDependencies", "optionalDependencies"].some(
        (section) => Object.keys(project[section] ?? {}).length > 0,
      ),
    )
  ) {
    throw new Error("The CDP-only Lighthouse setup must not include chromium-bidi; review its bundled dependencies.");
  }

  let output;
  try {
    ({ stdout: output } = await execute(process.execPath, [packageManagerPath, "--dir", directory, "audit", "--json"], {
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (error) {
    if (typeof error?.stdout !== "string" || error.stdout.length === 0) {
      throw error;
    }
    output = error.stdout;
  }

  const report = JSON.parse(output);
  if (
    report === null ||
    typeof report !== "object" ||
    report.error !== undefined ||
    report.advisories === null ||
    typeof report.advisories !== "object" ||
    Array.isArray(report.advisories)
  ) {
    throw new Error(`Dependency audit did not return an advisory report for ${directory}.`);
  }
  for (const advisory of Object.values(report.advisories)) {
    if (advisory.severity !== "high" && advisory.severity !== "critical") {
      continue;
    }

    const exception = dependencyAuditExceptions.get(advisory.github_advisory_id);
    if (exception !== undefined && matchesException(advisory, exception)) {
      accepted.push(`${directory}: ${advisory.github_advisory_id} until ${exception.expires}`);
    } else {
      rejected.push(`${directory}: ${advisory.github_advisory_id ?? advisory.id}: ${advisory.title}`);
    }
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
  const expiresAt = dependencyExceptionDeadline(exception.expires);
  if (Date.now() > expiresAt || advisory.module_name !== exception.moduleName) {
    return false;
  }

  return (
    advisory.findings.length > 0 &&
    advisory.findings.every(
      (finding) =>
        finding.dev === true &&
        finding.version === exception.version &&
        finding.paths.length > 0 &&
        finding.paths.every((dependencyPath) =>
          exception.pathSuffixes.some((suffix) => dependencyPath.endsWith(suffix)),
        ),
    )
  );
}
