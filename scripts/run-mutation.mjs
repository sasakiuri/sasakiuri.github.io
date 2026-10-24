#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

export function verifyMutationReport(report) {
  if (report?.files === null || typeof report?.files !== "object" || Array.isArray(report.files)) {
    throw new TypeError("Mutation testing did not produce a report of source files.");
  }
  let mutants = 0;
  for (const [fileName, file] of Object.entries(report.files)) {
    if (!Array.isArray(file?.mutants)) throw new TypeError("Mutation testing did not report its mutants.");
    for (const mutant of file.mutants) {
      mutants += 1;
      if (mutant.status === "Survived" && (!Number.isInteger(mutant.testsCompleted) || mutant.testsCompleted <= 0)) {
        throw new Error(`A surviving mutant ran no tests: ${fileName} (${mutant.id}).`);
      }
    }
  }
  if (mutants === 0) throw new Error("Mutation testing did not evaluate any mutants.");
}

if (import.meta.main) {
  const projectRoot = path.resolve(import.meta.dirname, "..");
  const executable = path.join(
    projectRoot,
    "tools",
    "mutation",
    "node_modules",
    ".bin",
    process.platform === "win32" ? "stryker.cmd" : "stryker",
  );
  const reportPath = path.join(projectRoot, "stryker", "mutation.json");
  await rm(reportPath, { force: true });

  const code = await new Promise((resolve) => {
    const child = spawn(executable, ["run"], {
      cwd: projectRoot,
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.on("error", (error) => {
      process.stderr.write(`Unable to start Stryker: ${error.message}\n`);
      resolve(1);
    });
    child.on("exit", (exitCode, signal) => {
      if (signal) process.stderr.write(`Stryker stopped after receiving ${signal}.\n`);
      resolve(exitCode ?? 1);
    });
  });

  process.exitCode = code;
  if (code === 0) {
    verifyMutationReport(JSON.parse(await readFile(reportPath, "utf8")));
  }
}
