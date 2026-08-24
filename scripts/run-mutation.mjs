#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const executable = path.join(
  projectRoot,
  "tools",
  "mutation",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "stryker.cmd" : "stryker",
);

const child = spawn(executable, ["run"], {
  cwd: projectRoot,
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("error", (error) => {
  process.stderr.write(`Unable to start Stryker: ${error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.stderr.write(`Stryker stopped after receiving ${signal}.\n`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
