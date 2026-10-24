#!/usr/bin/env node

import { appendFile } from "node:fs/promises";

import { dependencyAuditExceptions, dependencyExceptionDeadline } from "./lib/dependency-audit-policy.mjs";

const warningWindow = 7 * 24 * 60 * 60 * 1000;

export function checkDependencyExceptionDeadlines({ exceptions = dependencyAuditExceptions, now = Date.now() } = {}) {
  if (!Number.isFinite(now)) throw new TypeError("The exception check needs a valid current time.");
  return [...exceptions].map(([advisory, { expires }]) => {
    const deadline = dependencyExceptionDeadline(expires);
    const status = now > deadline ? "expired" : deadline - now <= warningWindow ? "due" : "accepted";
    return { advisory, expires, status };
  });
}

if (import.meta.main) {
  const exceptions = checkDependencyExceptionDeadlines();
  const attention = exceptions.filter(({ status }) => status !== "accepted");
  process.stdout.write(`${JSON.stringify({ exceptions })}\n`);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    const lines = exceptions.map(({ advisory, expires, status }) => `- ${advisory}: ${status}; expires ${expires}.`);
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Dependency exceptions\n\n${lines.join("\n")}\n`);
  }
  if (attention.length > 0) {
    process.stderr.write("Dependency exceptions expire within seven days or have expired; review them manually.\n");
    process.exitCode = 1;
  }
}
