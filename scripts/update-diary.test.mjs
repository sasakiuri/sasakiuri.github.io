// @vitest-environment node

import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, expect, it } from "vitest";

import { createDiaryPost, diarySource } from "./lib/diary-data.mjs";

const execFileAsync = promisify(execFile);
const directories = [];
const oldPost = createDiaryPost({ id: "2093251072781590942", text: "保存済み" });
const newPost = createDiaryPost({ id: "2103293728005976484", text: "新しい投稿" });

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(pages) {
  const directory = await mkdtemp(path.join(tmpdir(), "diary-update-test-"));
  directories.push(directory);
  await mkdir(path.join(directory, "scripts/lib"), { recursive: true });
  await mkdir(path.join(directory, "src/content"), { recursive: true });
  for (const file of ["update-diary.mjs", "lib/x-timeline.mjs", "lib/diary-data.mjs"]) {
    await copyFile(new URL(file, import.meta.url), path.join(directory, "scripts", file));
  }
  const dataPath = path.join(directory, "src/content/diary.json");
  const original = `${JSON.stringify({ posts: [oldPost], source: diarySource, version: 1 }, null, 2)}\n`;
  await writeFile(dataPath, original);
  const mockPath = path.join(directory, "mock-fetch.mjs");
  await writeFile(
    mockPath,
    `const pages = ${JSON.stringify(pages)};
globalThis.fetch = async () => new Response(JSON.stringify(pages.shift()), {
  headers: { "content-type": "application/json" },
});\n`,
  );
  const run = (...args) =>
    execFileAsync(process.execPath, ["--import", mockPath, path.join(directory, "scripts/update-diary.mjs"), ...args]);
  return { dataPath, original, run };
}

function page(post, cursor = null) {
  return {
    code: 200,
    results: [
      {
        type: "status",
        provider: "twitter",
        id: post.id,
        text: post.text,
        author: { id: "897820919749500928", screen_name: "sasakiuri" },
        created_timestamp: Math.floor(Date.parse(post.publishedAt) / 1000),
      },
    ],
    cursor: { bottom: cursor },
  };
}

it("reports a dry run without writing, then saves a validated update and is idempotent", async () => {
  const { dataPath, original, run } = await setup([page(newPost)]);
  expect((await run("--dry-run")).stdout).toContain("1 additions, 0 text updates");
  expect(await readFile(dataPath, "utf8")).toBe(original);
  await run();
  expect(JSON.parse(await readFile(dataPath, "utf8")).posts).toEqual([newPost, oldPost]);
  expect((await run()).stdout).toContain("Diary is current with 2 archived posts");
});

it("preserves the archive byte for byte when a later page fails validation", async () => {
  const { dataPath, original, run } = await setup([page(newPost, "next"), { code: 500 }]);
  await expect(run()).rejects.toThrow(/invalid timeline page/u);
  expect(await readFile(dataPath, "utf8")).toBe(original);
});
