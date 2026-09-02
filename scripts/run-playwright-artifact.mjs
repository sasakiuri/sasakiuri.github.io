#!/usr/bin/env node

import { spawn } from "node:child_process";

const packageManagerPath = process.env.npm_execpath;
const forwardedArguments = process.argv.slice(2);
const [command, commandArguments] =
  packageManagerPath === undefined
    ? ["corepack", ["pnpm", "exec", "playwright", "test", ...forwardedArguments]]
    : [process.execPath, [packageManagerPath, "exec", "playwright", "test", ...forwardedArguments]];

const child = spawn(command, commandArguments, {
  env: { ...process.env, PLAYWRIGHT_REUSE_BUILD: "true" },
  stdio: "inherit",
});

child.once("error", (error) => {
  throw error;
});
child.once("exit", (code, signal) => {
  if (code === 0) return;
  throw new Error(`Playwright failed with ${signal === null ? `exit code ${code}` : `signal ${signal}`}.`);
});
