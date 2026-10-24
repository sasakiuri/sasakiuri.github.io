#!/usr/bin/env node

import { parseArgs } from "node:util";

import {
  apiRoot,
  checkBaseChanges,
  isDependabotUpdate,
  latestDependabotRuns,
  liveBaseSha,
  requestGitHub,
  sameDependabotPull,
} from "./lib/dependabot.mjs";

const passed = (runs) => runs.every(({ run }) => run?.status === "completed" && run.conclusion === "success");

export async function mergeDependabotUpdates(request, { dryRun = false } = {}) {
  const pages = await request(`${apiRoot}/pulls?state=open&base=1.x&per_page=100`, { paginate: true });
  const summary = { merged: [], ready: [], waiting: [] };

  for (const candidate of pages.flat()) {
    if (!isDependabotUpdate(candidate)) continue;
    const pull = await request(`${apiRoot}/pulls/${candidate.number}`);
    if (!isDependabotUpdate(pull)) continue;
    if (pull.mergeable !== true || !passed(await latestDependabotRuns(request, pull))) {
      summary.waiting.push(pull.number);
      continue;
    }
    const base = await checkBaseChanges(request, pull);
    if (!base.allowed) {
      summary.waiting.push(pull.number);
      continue;
    }
    const current = await request(`${apiRoot}/pulls/${pull.number}`);
    if (
      !sameDependabotPull(current, pull) ||
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
      throw new TypeError(`GitHub did not merge Dependabot pull request #${pull.number}.`);
    }
    summary.merged.push(pull.number);
    // Merges made with GITHUB_TOKEN do not trigger push workflows.
    try {
      await request(`${apiRoot}/dispatches`, { method: "POST", fields: { event_type: "dependabot-updated" } });
    } catch (error) {
      throw new TypeError(
        `Dependabot pull request #${pull.number} was merged, but dispatch failed. Run Verify and deploy and Security manually on 1.x.`,
        { cause: error },
      );
    }
  }
  return summary;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } }, strict: true });
  const summary = await mergeDependabotUpdates(requestGitHub, { dryRun: values["dry-run"] });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
