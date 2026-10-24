#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import {
  apiRoot,
  checkBaseChanges,
  hasTrustedDependabotCommits,
  isDependabotAccount,
  isDependabotUpdate,
  isRunForPullRequest,
  latestDependabotRuns,
  liveBaseSha,
  repository,
  requestGitHub,
  sameDependabotPull,
} from "./lib/dependabot.mjs";

const retryDelay = 26 * 60 * 60 * 1000;
const maximumRunAge = 30 * 24 * 60 * 60 * 1000;
const maximumAttempts = 3;

function retryState(run, now) {
  // Select the latest associated run first, including human-triggered events.
  // Original actors persist on reruns; triggering_actor may be a maintainer.
  if (run !== undefined && !isDependabotAccount(run.actor)) return "workflow actor requires manual review";
  if (run === undefined || run.status !== "completed") return "workflow not completed";
  if (run.conclusion === "success") return "passed";
  if (run.conclusion !== "failure" && run.conclusion !== "timed_out") return "manual action required";
  const created = Date.parse(run.created_at);
  const updated = Date.parse(run.updated_at);
  if (
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    !Number.isFinite(created) ||
    !Number.isFinite(updated) ||
    created > updated
  ) {
    return "invalid retry metadata";
  }
  if (now - created >= maximumRunAge) return "run is at least 30 days old";
  if (run.run_attempt >= maximumAttempts) return "attempt limit reached";
  if (updated > now) return "runner clock behind GitHub";
  return now - updated >= retryDelay ? "ready" : "retry delay";
}

export async function retryDependabotChecks(request, { dryRun = false, now = Date.now() } = {}) {
  if (!Number.isFinite(now)) throw new TypeError("The retry check needs a valid current time.");
  const pages = await request(`${apiRoot}/pulls?state=open&base=1.x&per_page=100`, { paginate: true });
  const summary = { ready: [], retried: [], waiting: [], blocked: [], errors: [] };
  for (const candidate of pages.flat()) {
    if (!isDependabotUpdate(candidate)) continue;
    try {
      const pull = await request(`${apiRoot}/pulls/${candidate.number}`);
      if (!isDependabotUpdate(pull)) continue;
      if (pull.mergeable === false) {
        summary.blocked.push({ pull: pull.number, reason: "merge conflict" });
        continue;
      }
      if (pull.mergeable !== true) {
        summary.waiting.push({ pull: pull.number, reason: "mergeability not computed" });
        continue;
      }
      if (!(await hasTrustedDependabotCommits(request, pull))) {
        summary.blocked.push({ pull: pull.number, reason: "commit provenance requires manual review" });
        continue;
      }
      const runs = await latestDependabotRuns(request, pull);
      for (const { workflow, run } of runs) {
        const state = retryState(run, now);
        const entry = { pull: pull.number, workflow, run: run?.id };
        if (run === undefined && !(now - Date.parse(pull.updated_at) < retryDelay)) {
          summary.blocked.push({ ...entry, reason: "required workflow missing; manual action required" });
          continue;
        }
        if (state === "passed") continue;
        if (["workflow not completed", "retry delay", "runner clock behind GitHub"].includes(state)) {
          summary.waiting.push({ ...entry, reason: state });
          continue;
        }
        if (state !== "ready") {
          summary.blocked.push({ ...entry, reason: state });
          continue;
        }

        const base = await checkBaseChanges(request, pull);
        if (!base.allowed) {
          summary.blocked.push({ ...entry, reason: "base changed; Dependabot rebase required" });
          continue;
        }
        const current = await request(`${apiRoot}/pulls/${pull.number}`);
        if (!sameDependabotPull(current, pull)) {
          summary.waiting.push({ ...entry, reason: "pull request changed" });
          continue;
        }
        const latest = (await latestDependabotRuns(request, current)).find((item) => item.workflow === workflow)?.run;
        if (
          latest?.id !== run.id ||
          latest.run_attempt !== run.run_attempt ||
          latest.updated_at !== run.updated_at ||
          retryState(latest, now) !== "ready"
        ) {
          summary.waiting.push({ ...entry, reason: "workflow changed" });
          continue;
        }
        const fresh = await request(`${apiRoot}/actions/runs/${run.id}`);
        if (
          !isRunForPullRequest(fresh, current) ||
          fresh.id !== run.id ||
          fresh.path !== workflow ||
          fresh.run_attempt !== run.run_attempt ||
          fresh.updated_at !== run.updated_at ||
          retryState(fresh, now) !== "ready"
        ) {
          summary.waiting.push({ ...entry, reason: "workflow changed" });
          continue;
        }
        const finalPull = await request(`${apiRoot}/pulls/${pull.number}`);
        if (
          !sameDependabotPull(finalPull, pull) ||
          !(await hasTrustedDependabotCommits(request, finalPull)) ||
          (await liveBaseSha(request)) !== base.sha
        ) {
          summary.waiting.push({ ...entry, reason: "pull request or base changed" });
          continue;
        }
        summary.ready.push(entry);
        if (dryRun) continue;
        // Rebuild artifacts and repeat successful checks too, including the dependency audit.
        try {
          await request(`${apiRoot}/actions/runs/${run.id}/rerun`, { method: "POST" });
          summary.retried.push(entry);
        } catch {
          summary.errors.push({ ...entry, reason: "GitHub rerun request failed" });
        }
      }
    } catch {
      summary.errors.push({ pull: candidate.number, reason: "GitHub pull request inspection failed" });
    }
  }
  return summary;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } }, strict: true });
  const summary = await retryDependabotChecks(requestGitHub, { dryRun: values["dry-run"] });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    const lines = Object.entries(summary).flatMap(([state, entries]) =>
      entries.map(
        ({ pull, workflow, run, reason }) =>
          `- ${state}: [PR #${pull}](https://github.com/${repository}/pull/${pull}), ${workflow ?? "pull request"}${run === undefined ? "" : `, run ${run}`}${reason === undefined ? "" : `: ${reason}`}.`,
      ),
    );
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Dependabot retries\n\n${lines.length === 0 ? "No pending Dependabot checks." : lines.join("\n")}\n`,
    );
  }
  if (summary.errors.length > 0) process.exitCode = 1;
}
