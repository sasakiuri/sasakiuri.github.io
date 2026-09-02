#!/usr/bin/env node

import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { combineDiaryBrowserExports } from "./lib/diary-browser-export.mjs";
import { mergeDiaryPosts, validateDiaryData } from "./lib/diary-data.mjs";

const maximumFileBytes = 20_000_000;
const options = parseOptions();
const dataUrl = new URL("../src/content/diary.json", import.meta.url);
const currentSource = await readFile(dataUrl, "utf8");
const currentData = validateDiaryData(JSON.parse(currentSource));
const payloads = [];

for (const inputPath of options.inputPaths) {
  const resolvedPath = path.resolve(inputPath);
  const file = await stat(resolvedPath);
  if (!file.isFile()) throw new TypeError(`Browser export is not a regular file: ${inputPath}`);
  if (file.size > maximumFileBytes) {
    throw new TypeError(`Browser export exceeds the ${maximumFileBytes} byte safety limit: ${inputPath}`);
  }
  const source = await readFile(resolvedPath, "utf8");
  if (Buffer.byteLength(source) > maximumFileBytes) {
    throw new TypeError(`Browser export exceeds the ${maximumFileBytes} byte safety limit: ${inputPath}`);
  }
  try {
    payloads.push(JSON.parse(source));
  } catch (error) {
    throw new TypeError(`Browser export is not valid JSON: ${inputPath}`, { cause: error });
  }
}

const importedPosts = combineDiaryBrowserExports(payloads);
const nextData = mergeDiaryPosts(currentData, importedPosts);
const nextSource = `${JSON.stringify(nextData, undefined, 2)}\n`;
const currentById = new Map(currentData.posts.map((post) => [post.id, post]));
const additions = importedPosts.filter(({ id }) => !currentById.has(id)).length;
const updates = importedPosts.filter((post) => {
  const current = currentById.get(post.id);
  return current !== undefined && current.text !== post.text;
}).length;

if (options.dryRun || nextSource === currentSource) {
  process.stdout.write(
    `${options.dryRun ? "Would archive" : "Archive already contains"} ${nextData.posts.length} posts ` +
      `(${additions} additions, ${updates} text updates).\n`,
  );
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

function parseOptions() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      help: { short: "h", type: "boolean" },
    },
    strict: true,
  });

  if (values.help === true) {
    process.stdout.write("Usage: pnpm diary:import [--dry-run] <browser-export.json> [more-exports.json ...]\n");
    process.exit(0);
  }
  if (positionals.length === 0) {
    throw new TypeError("Provide at least one browser export JSON file. Use --help for usage.");
  }
  return { dryRun: values["dry-run"] === true, inputPaths: positionals };
}
