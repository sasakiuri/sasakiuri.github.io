#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createStaticSpdx } from "./lib/static-spdx.mjs";

const options = parseArguments(process.argv.slice(2));
const manifest = JSON.parse(await readFile(options.manifestPath, "utf8"));
const created = new Date(options.sourceDateEpoch * 1_000).toISOString().replace(".000Z", "Z");
const spdx = createStaticSpdx({ created, manifest });

await mkdir(path.dirname(options.outputPath), { recursive: true });
await writeFile(options.outputPath, `${JSON.stringify(spdx, null, 2)}\n`);
process.stdout.write(`Wrote SPDX evidence for ${spdx.files.length} static files to ${options.outputPath}.\n`);

function parseArguments(arguments_) {
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (typeof name !== "string" || typeof value !== "string" || !name.startsWith("--")) {
      throw new TypeError("Static SBOM arguments must be name-value pairs.");
    }
    values.set(name, value);
  }
  const manifestPath = values.get("--manifest");
  const outputPath = values.get("--output");
  const epoch = values.get("--source-date-epoch");
  if (manifestPath === undefined || outputPath === undefined || epoch === undefined || values.size !== 3) {
    throw new TypeError(
      "Usage: generate-static-sbom.mjs --manifest <path> --output <path> --source-date-epoch <seconds>",
    );
  }
  const sourceDateEpoch = Number(epoch);
  if (!Number.isSafeInteger(sourceDateEpoch) || sourceDateEpoch < 0) {
    throw new TypeError("Source date epoch must be a non-negative integer.");
  }
  return { manifestPath, outputPath, sourceDateEpoch };
}
