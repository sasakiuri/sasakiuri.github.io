#!/usr/bin/env node

import { execFile } from "node:child_process";
import { parseArgs, promisify } from "node:util";

const execute = promisify(execFile);
const repository = "sasakiuri/sasakiuri.github.io";
const apiRoot = `repos/${repository}`;
const requiredWorkflows = [
  ".github/workflows/pipeline.yml",
  ".github/workflows/security.yml",
  ".github/workflows/pr-title.yml",
];

export async function mergeDependabotUpdates(request, { dryRun = false } = {}) {
  const pages = await request(`${apiRoot}/pulls?state=open&base=1.x&per_page=100`, { paginate: true });
  const summary = { merged: [], ready: [], waiting: [] };

  for (const candidate of pages.flat()) {
    if (!isDependabotUpdate(candidate)) continue;
    const pull = await request(`${apiRoot}/pulls/${candidate.number}`);
    if (!isDependabotUpdate(pull)) continue;
    const runPages = await request(
      `${apiRoot}/actions/runs?event=pull_request&head_sha=${pull.head.sha}&per_page=100`,
      {
        paginate: true,
      },
    );
    const runs = runPages.flatMap((page) => page.workflow_runs);
    const passed = requiredWorkflows.every((workflowPath) => {
      const latest = runs
        .filter(
          (run) =>
            run.path === workflowPath &&
            run.event === "pull_request" &&
            run.head_sha === pull.head.sha &&
            run.head_repository?.full_name === repository &&
            run.pull_requests.some(
              (associated) =>
                associated.number === pull.number &&
                associated.base.ref === pull.base.ref &&
                associated.base.repo.id === pull.base.repo.id &&
                associated.head.ref === pull.head.ref &&
                associated.head.sha === pull.head.sha &&
                associated.head.repo.id === pull.head.repo.id,
            ),
        )
        .sort((left, right) => right.id - left.id)[0];
      return latest?.status === "completed" && latest.conclusion === "success";
    });
    if (!passed) {
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

function isDependabotUpdate(pull) {
  return (
    Number.isSafeInteger(pull?.number) &&
    pull.number > 0 &&
    pull.state === "open" &&
    pull.draft === false &&
    pull.user?.login === "dependabot[bot]" &&
    pull.base?.ref === "1.x" &&
    pull.base.repo?.full_name === repository &&
    pull.head?.repo?.full_name === repository &&
    pull.head.ref.startsWith("dependabot/") &&
    /^[0-9a-f]{40}$/u.test(pull.head.sha)
  );
}

async function requestGitHub(route, { method = "GET", fields = {}, paginate = false } = {}) {
  const args = ["api", "--method", method, route];
  if (paginate) args.push("--paginate", "--jq", "tojson");
  for (const [name, value] of Object.entries(fields)) args.push("-f", `${name}=${value}`);
  const { stdout } = await execute("gh", args, { maxBuffer: 16 * 1024 * 1024 });
  const source = stdout.trim();
  if (paginate) return source.split("\n").map((page) => JSON.parse(page));
  return source === "" ? null : JSON.parse(source);
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } }, strict: true });
  const summary = await mergeDependabotUpdates(requestGitHub, { dryRun: values["dry-run"] });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
