#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const projectRoot = path.resolve(import.meta.dirname, "..");
const executable = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "license-checker-rseidelsohn.cmd" : "license-checker-rseidelsohn",
);

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);

const { stdout } = await execute(executable, ["--production", "--json"], {
  cwd: projectRoot,
  maxBuffer: 16 * 1024 * 1024,
});

const dependencies = JSON.parse(stdout);
const projectManifest = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
delete dependencies[`${projectManifest.name}@${projectManifest.version}`];

const rejected = Object.entries(dependencies).flatMap(([name, metadata]) => {
  const declared = Array.isArray(metadata.licenses) ? metadata.licenses : [metadata.licenses];
  const tokens = declared.flatMap((license) =>
    typeof license === "string"
      ? (license.match(/[A-Za-z0-9.-]+/g) ?? []).filter((token) => token !== "AND" && token !== "OR")
      : [],
  );

  return tokens.length > 0 && tokens.every((license) => allowedLicenses.has(license))
    ? []
    : [{ licenses: declared, name }];
});

if (process.argv.includes("--report")) {
  const reportDirectory = path.join(projectRoot, "reports", "licenses");
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    path.join(reportDirectory, "production-dependencies.json"),
    `${JSON.stringify(dependencies, null, 2)}\n`,
  );
}

if (rejected.length > 0) {
  process.stderr.write(
    `Disallowed or unknown production dependency licenses:\n${rejected
      .map(({ licenses, name }) => `- ${name}: ${licenses.join(", ")}`)
      .join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`Validated licenses for ${Object.keys(dependencies).length} production dependencies.\n`);
}
