#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createPrecacheManifest, renderServiceWorker } from "./lib/service-worker-manifest.mjs";
import { publicPathToArtifactPath, siteContract } from "./lib/site-contract.mjs";

const projectDirectory = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(projectDirectory, "out");
const serviceWorkerPath = path.join(
  outputDirectory,
  publicPathToArtifactPath(siteContract.pwa.serviceWorker.publicPath),
);
const manifest = await createPrecacheManifest(outputDirectory);
const template = await readFile(serviceWorkerPath, "utf8");
const serviceWorker = renderServiceWorker(template, manifest);

await writeFile(serviceWorkerPath, serviceWorker);
process.stdout.write(`Injected ${manifest.urls.length} precache URLs with version ${manifest.version}.\n`);
