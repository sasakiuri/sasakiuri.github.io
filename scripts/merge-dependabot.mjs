#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  apiRoot,
  checkBaseChanges,
  hasTrustedDependabotCommits,
  isDependabotAccount,
  isDependabotUpdate,
  latestDependabotRuns,
  liveBaseSha,
  requestGitHub,
  repository,
  sameDependabotPull,
} from "./lib/dependabot.mjs";

const passed = (runs) =>
  runs.every(
    ({ run }) => isDependabotAccount(run?.actor) && run.status === "completed" && run.conclusion === "success",
  );

export async function mergeDependabotUpdates(request, { dryRun = false } = {}) {
  const pages = await request(`${apiRoot}/pulls?state=open&base=1.x&per_page=100`, { paginate: true });
  const summary = { merged: [], ready: [], waiting: [], blocked: [], errors: [] };

  for (const candidate of pages.flat()) {
    if (!isDependabotUpdate(candidate)) continue;
    try {
      const pull = await request(`${apiRoot}/pulls/${candidate.number}`);
      if (!isDependabotUpdate(pull)) continue;
      if (pull.mergeable !== true) {
        summary.waiting.push(pull.number);
        continue;
      }
      if (!(await hasTrustedDependabotCommits(request, pull))) {
        summary.blocked.push({ pull: pull.number, reason: "commit provenance requires manual review" });
        continue;
      }
      const runs = await latestDependabotRuns(request, pull);
      if (runs.some(({ run }) => run !== undefined && !isDependabotAccount(run.actor))) {
        summary.blocked.push({ pull: pull.number, reason: "workflow actor requires manual review" });
        continue;
      }
      if (!passed(runs)) {
        summary.waiting.push(pull.number);
        continue;
      }
      const base = await checkBaseChanges(request, pull);
      if (!base.allowed) {
        summary.blocked.push({ pull: pull.number, reason: "base changed; Dependabot rebase required" });
        continue;
      }
      const current = await request(`${apiRoot}/pulls/${pull.number}`);
      if (
        !sameDependabotPull(current, pull) ||
        !(await hasTrustedDependabotCommits(request, current)) ||
        !passed(await latestDependabotRuns(request, current)) ||
        (await liveBaseSha(request)) !== base.sha
      ) {
        summary.waiting.push(pull.number);
        continue;
      }
      summary.ready.push(pull.number);
      if (dryRun) continue;

      const result = await request(`${apiRoot}/pulls/${pull.number}/merge`, {
        method: "PUT",
        fields: { merge_method: "rebase", sha: pull.head.sha },
      });
      if (result.merged !== true || !/^[0-9a-f]{40}$/u.test(result.sha)) {
        summary.errors.push({ pull: pull.number, reason: "GitHub merge request was not accepted" });
        continue;
      }
      summary.merged.push(pull.number);
      // Merges made with GITHUB_TOKEN do not trigger push workflows.
      try {
        await request(`${apiRoot}/dispatches`, { method: "POST", fields: { event_type: "dependabot-updated" } });
      } catch {
        summary.errors.push({
          pull: pull.number,
          reason: "merged, but dispatch failed; run Verify and deploy and Security on 1.x",
        });
      }
    } catch {
      summary.errors.push({ pull: candidate.number, reason: "GitHub pull request inspection or merge failed" });
    }
  }
  return summary;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } }, strict: true });
  const summary = await mergeDependabotUpdates(requestGitHub, { dryRun: values["dry-run"] });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    const lines = Object.entries(summary).flatMap(([state, entries]) =>
      entries.map((entry) => {
        const { pull, reason } = typeof entry === "number" ? { pull: entry } : entry;
        return `- ${state}: [PR #${pull}](https://github.com/${repository}/pull/${pull})${reason === undefined ? "" : `: ${reason}`}.`;
      }),
    );
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Dependabot merges\n\n${lines.length === 0 ? "No pending Dependabot updates." : lines.join("\n")}\n`,
    );
  }
  if (summary.errors.length > 0 || summary.blocked.length > 0) process.exitCode = 1;
}
