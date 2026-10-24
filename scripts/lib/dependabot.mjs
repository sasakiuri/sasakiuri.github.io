import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export const repository = "sasakiuri/sasakiuri.github.io";
export const apiRoot = `repos/${repository}`;
export const requiredWorkflows = [
  ".github/workflows/pipeline.yml",
  ".github/workflows/security.yml",
  ".github/workflows/pr-title.yml",
];

// Content drift is tolerated; dependency, code, workflow, and policy changes need a rebase.
const allowedBaseChanges = new Set([
  "src/content/diary.json",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/architecture.md",
  "docs/dependency-policy.md",
  "docs/operations.md",
  "docs/threat-model.md",
  "docs/adr/0001-build-once-promote.md",
  "docs/adr/0002-static-hash-csp.md",
  "docs/adr/0003-versioned-publication-contract.md",
]);
const isSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
export const isDependabotAccount = (user) =>
  user?.login === "dependabot[bot]" && user.id === 49699333 && user.type === "Bot";

export async function hasTrustedDependabotCommits(request, pull) {
  if (!Number.isSafeInteger(pull.commits) || pull.commits < 1 || pull.commits > 250) return false;
  const pages = await request(`${apiRoot}/pulls/${pull.number}/commits?per_page=100`, { paginate: true });
  const commits = pages.flat();
  return (
    commits.length === pull.commits &&
    new Set(commits.map((commit) => commit?.sha)).size === commits.length &&
    commits.at(-1)?.sha === pull.head.sha &&
    commits.every(
      (commit) =>
        isSha(commit?.sha) &&
        isDependabotAccount(commit.author) &&
        commit.commit?.verification?.verified === true &&
        commit.commit.verification.reason === "valid",
    )
  );
}

function allowedContentFiles(files) {
  return (
    Array.isArray(files) &&
    files.length > 0 &&
    // GitHub returns at most 300 compare files, without a reliable truncation flag.
    files.length < 300 &&
    files.every((file) => {
      if (!allowedBaseChanges.has(file?.filename)) return false;
      if (["added", "modified", "removed"].includes(file.status)) return true;
      return ["renamed", "copied"].includes(file.status) && allowedBaseChanges.has(file.previous_filename);
    })
  );
}

export async function liveBaseSha(request) {
  const ref = await request(`${apiRoot}/git/ref/heads/1.x`);
  if (ref?.ref !== "refs/heads/1.x" || ref.object?.type !== "commit" || !isSha(ref.object.sha)) {
    throw new TypeError("GitHub did not return a valid 1.x commit.");
  }
  return ref.object.sha;
}

export async function checkBaseChanges(request, pull) {
  const sha = await liveBaseSha(request);
  // PR/run association base SHAs are mutable metadata, not a historical tested base.
  const comparison = await request(`${apiRoot}/compare/${pull.head.sha}...${sha}`);
  const ancestor = comparison?.merge_base_commit?.sha;
  if (!isSha(ancestor)) return { sha, allowed: false };
  if (ancestor === sha) return { sha, allowed: true };
  const changes = await request(`${apiRoot}/compare/${ancestor}...${sha}`);
  const complete =
    changes?.status === "ahead" &&
    changes.merge_base_commit?.sha === ancestor &&
    Number.isSafeInteger(changes.total_commits) &&
    changes.total_commits > 0 &&
    changes.total_commits <= 30 &&
    Array.isArray(changes.commits) &&
    changes.commits.length === changes.total_commits &&
    changes.commits.every((commit) => isSha(commit?.sha)) &&
    allowedContentFiles(changes.files);
  if (!complete) return { sha, allowed: false };
  // A protected change followed by a revert disappears from the aggregate diff.
  for (const commit of changes.commits) {
    const detail = await request(`${apiRoot}/commits/${commit.sha}`);
    if (detail?.sha !== commit.sha || !allowedContentFiles(detail.files)) return { sha, allowed: false };
  }
  return { sha, allowed: true };
}

export function sameDependabotPull(current, previous) {
  return (
    isDependabotUpdate(current) &&
    current.number === previous.number &&
    current.commits === previous.commits &&
    current.head.sha === previous.head.sha &&
    current.head.ref === previous.head.ref &&
    current.head.repo.id === previous.head.repo.id &&
    current.base.repo.id === previous.base.repo.id &&
    current.mergeable === true
  );
}

export function isDependabotUpdate(pull) {
  return (
    Number.isSafeInteger(pull?.number) &&
    pull.number > 0 &&
    pull.state === "open" &&
    pull.draft === false &&
    isDependabotAccount(pull.user) &&
    pull.base?.ref === "1.x" &&
    pull.base.repo?.full_name === repository &&
    Number.isSafeInteger(pull.base.repo.id) &&
    pull.base.repo.id > 0 &&
    pull.head?.repo?.full_name === repository &&
    Number.isSafeInteger(pull.head.repo.id) &&
    pull.head.repo.id > 0 &&
    typeof pull.head.ref === "string" &&
    pull.head.ref.startsWith("dependabot/") &&
    /^[0-9a-f]{40}$/u.test(pull.head.sha)
  );
}

export function isRunForPullRequest(run, pull) {
  return (
    Number.isSafeInteger(run?.id) &&
    run.id > 0 &&
    run.event === "pull_request" &&
    run.head_sha === pull.head.sha &&
    run.head_repository?.full_name === repository &&
    Array.isArray(run.pull_requests) &&
    run.pull_requests.some(
      (associated) =>
        associated?.number === pull.number &&
        associated.base?.ref === pull.base.ref &&
        associated.base.repo?.id === pull.base.repo.id &&
        associated.head?.ref === pull.head.ref &&
        associated.head.sha === pull.head.sha &&
        associated.head.repo?.id === pull.head.repo.id,
    )
  );
}

export async function latestDependabotRuns(request, pull) {
  const pages = await request(`${apiRoot}/actions/runs?event=pull_request&head_sha=${pull.head.sha}&per_page=100`, {
    paginate: true,
  });
  const runs = pages.flatMap((page) => page.workflow_runs);
  return requiredWorkflows.map((workflow) => ({
    workflow,
    run: runs
      .filter((run) => run.path === workflow && isRunForPullRequest(run, pull))
      .sort((left, right) => right.id - left.id)[0],
  }));
}

export async function requestGitHub(route, { method = "GET", fields = {}, paginate = false } = {}) {
  const args = ["api", "--method", method, route];
  if (paginate) args.push("--paginate", "--jq", "tojson");
  for (const [name, value] of Object.entries(fields)) args.push("-f", `${name}=${value}`);
  const { stdout } = await execute("gh", args, { maxBuffer: 16 * 1024 * 1024 });
  const source = stdout.trim();
  if (paginate) return source.split("\n").map((page) => JSON.parse(page));
  return source === "" ? null : JSON.parse(source);
}
