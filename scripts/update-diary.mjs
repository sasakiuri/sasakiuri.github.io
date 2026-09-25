#!/usr/bin/env node

import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { mergeDiaryPosts, validateDiaryData } from "./lib/diary-data.mjs";
import { fetchXTimelinePosts } from "./lib/x-timeline.mjs";

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } }, strict: true });
const dataUrl = new URL("../src/content/diary.json", import.meta.url);
const currentSource = await readFile(dataUrl, "utf8");
const currentData = validateDiaryData(JSON.parse(currentSource));
const fetchedPosts = await fetchXTimelinePosts(currentData.posts);
const nextData = mergeDiaryPosts(currentData, fetchedPosts);
const nextSource = `${JSON.stringify(nextData, null, 2)}\n`;
const currentById = new Map(currentData.posts.map((post) => [post.id, post]));
const additions = fetchedPosts.filter(({ id }) => !currentById.has(id)).length;
const updates = fetchedPosts.filter((post) => {
  const current = currentById.get(post.id);
  return current !== undefined && current.text !== post.text;
}).length;

if (values["dry-run"]) {
  process.stdout.write(
    `Would archive ${nextData.posts.length} posts (${additions} additions, ${updates} text updates).\n`,
  );
} else if (nextSource === currentSource) {
  process.stdout.write(`Diary is current with ${nextData.posts.length} archived posts.\n`);
} else {
  const temporaryUrl = new URL(`./diary.json.${process.pid}.tmp`, dataUrl);
  try {
    await writeFile(temporaryUrl, nextSource, { flag: "wx" });
    await rename(temporaryUrl, dataUrl);
  } finally {
    await rm(temporaryUrl, { force: true });
  }
  process.stdout.write(`Archived ${nextData.posts.length} posts (${additions} additions, ${updates} text updates).\n`);
}
