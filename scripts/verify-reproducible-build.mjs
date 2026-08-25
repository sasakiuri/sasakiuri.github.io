#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { digest } from "./lib/static-export.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(projectRoot, "reports", "artifact", "static-export-manifest.json");
const reportPath = path.join(projectRoot, "reports", "reproducibility", "result.json");

const firstManifest = await cleanBuildAndReadManifest();
const secondManifest = await cleanBuildAndReadManifest();
const firstSerialized = JSON.stringify(firstManifest);
const secondSerialized = JSON.stringify(secondManifest);

if (firstSerialized !== secondSerialized) {
  const differences = compareFiles(firstManifest.files, secondManifest.files);
  throw new TypeError(`Static export is not reproducible:\n- ${differences.join("\n- ")}`);
}

const result = {
  artifactManifestSha256: digest(Buffer.from(firstSerialized)),
  files: firstManifest.files.length,
  identical: true,
  totalBytes: firstManifest.totals.total,
  version: 1,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(
  `Two clean builds produced identical ${result.files}-file exports (${result.totalBytes} bytes).\n`,
);

async function cleanBuildAndReadManifest() {
  await Promise.all(
    [".next", "out", "reports/artifact", "reports/security"].map((relativePath) =>
      rm(path.join(projectRoot, relativePath), { force: true, recursive: true }),
    ),
  );
  await runPackageScript("build");
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

function runPackageScript(script) {
  const packageManagerPath = process.env.npm_execpath;
  const [command, argumentsForCommand] =
    packageManagerPath === undefined
      ? ["corepack", ["pnpm", "run", script]]
      : [process.execPath, [packageManagerPath, "run", script]];

  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsForCommand, {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Build failed with ${signal === null ? `exit code ${code}` : `signal ${signal}`}.`));
    });
  });
}

function compareFiles(firstFiles, secondFiles) {
  const first = new Map(firstFiles.map((file) => [file.path, file.sha256]));
  const second = new Map(secondFiles.map((file) => [file.path, file.sha256]));
  const paths = [...new Set([...first.keys(), ...second.keys()])].sort();
  const differences = paths.flatMap((filePath) => {
    if (!first.has(filePath)) return [`added ${filePath}`];
    if (!second.has(filePath)) return [`removed ${filePath}`];
    if (first.get(filePath) !== second.get(filePath)) return [`content changed ${filePath}`];
    return [];
  });
  return differences.length === 0 ? ["manifest metadata changed"] : differences;
}
