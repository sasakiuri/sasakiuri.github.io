#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";
import lighthouse, { desktopConfig } from "lighthouse";

import { qualityGates } from "./lib/quality-gates.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(projectRoot, "out");
const reportDirectory = path.join(projectRoot, "reports", "lighthouse");
const runs = positiveInteger(process.env.LIGHTHOUSE_RUNS, 3);

const thresholds = {
  accessibility: qualityGates.lighthouse.accessibility,
  bestPractices: qualityGates.lighthouse.bestPractices,
  cumulativeLayoutShift: qualityGates.lighthouse.cumulativeLayoutShift,
  largestContentfulPaint: qualityGates.lighthouse.largestContentfulPaintMilliseconds,
  performance: qualityGates.lighthouse.performance,
  seo: qualityGates.lighthouse.seo,
  totalBlockingTime: qualityGates.lighthouse.totalBlockingTimeMilliseconds,
};

await mkdir(reportDirectory, { recursive: true });

const server = createStaticServer(outputDirectory);
await listen(server);

const address = server.address();
if (address === null || typeof address === "string") {
  throw new Error("The Lighthouse server did not expose a TCP port.");
}

const targetUrl = `http://127.0.0.1:${address.port}/sasakiuri/`;

try {
  const measured = [];

  for (let index = 1; index <= runs; index += 1) {
    const temporaryRoot = process.platform === "win32" ? tmpdir() : "/tmp";
    const userDataDir = await mkdtemp(path.join(temporaryRoot, "sasakiuri-lighthouse-"));
    const debuggingPort = await reservePort();
    const chrome = spawn(
      chromium.executablePath(),
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${userDataDir}`,
        "about:blank",
      ],
      {
        detached: process.platform !== "win32",
        stdio: "ignore",
      },
    );

    try {
      await waitForChrome(chrome, debuggingPort);
      const result = await lighthouse(
        targetUrl,
        {
          logLevel: "error",
          output: ["html", "json"],
          port: debuggingPort,
          skipAudits: ["uses-http2"],
        },
        desktopConfig,
      );

      if (result === undefined || !Array.isArray(result.report)) {
        throw new Error("Lighthouse did not return HTML and JSON reports.");
      }

      const [htmlReport, jsonReport] = result.report;
      await Promise.all([
        writeFile(path.join(reportDirectory, `run-${index}.html`), htmlReport),
        writeFile(path.join(reportDirectory, `run-${index}.json`), jsonReport),
      ]);
      measured.push(readMetrics(result.lhr));
    } finally {
      await stopProcess(chrome);
      await rm(userDataDir, {
        force: true,
        maxRetries: 10,
        recursive: true,
        retryDelay: 100,
      });
    }
  }

  const summary = summarize(measured);
  await writeFile(path.join(reportDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  printSummary(summary);
  assertThresholds(summary);
} finally {
  await close(server);
}

function positiveInteger(raw, fallback) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createStaticServer(rootDirectory) {
  const mimeTypes = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".ico", "image/x-icon"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".txt", "text/plain; charset=utf-8"],
    [".webmanifest", "application/manifest+json; charset=utf-8"],
    [".webp", "image/webp"],
    [".woff2", "font/woff2"],
    [".xml", "application/xml; charset=utf-8"],
  ]);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      relativePath ||= "index.html";

      let filePath = path.resolve(rootDirectory, relativePath);
      if (filePath !== rootDirectory && !filePath.startsWith(`${rootDirectory}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }

      if ((await stat(filePath)).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes.get(path.extname(filePath)) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
    }
  });
}

function listen(serverToStart) {
  return new Promise((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => {
      serverToStart.off("error", reject);
      resolve();
    });
  });
}

function close(serverToStop) {
  return new Promise((resolve, reject) => {
    serverToStop.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

async function reservePort() {
  const serverForPort = createServer();
  await listen(serverForPort);

  const addressForPort = serverForPort.address();
  if (addressForPort === null || typeof addressForPort === "string") {
    await close(serverForPort);
    throw new Error("Unable to reserve a Chrome debugging port.");
  }

  await close(serverForPort);
  return addressForPort.port;
}

async function waitForChrome(chromeProcess, port) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (chromeProcess.exitCode !== null) {
      throw new Error(`Chromium exited before Lighthouse connected (${chromeProcess.exitCode}).`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // Chromium is still starting.
    }

    await delay(100);
  }

  throw new Error("Timed out waiting for Chromium's debugging port.");
}

async function stopProcess(childProcess) {
  if (childProcess.exitCode !== null) {
    return;
  }

  killProcessTree(childProcess, "SIGTERM");
  if (await waitForExit(childProcess, 5_000)) {
    return;
  }

  killProcessTree(childProcess, "SIGKILL");
  await waitForExit(childProcess, 5_000);
}

function killProcessTree(childProcess, signal) {
  try {
    if (process.platform !== "win32" && childProcess.pid !== undefined) {
      process.kill(-childProcess.pid, signal);
      return;
    }

    childProcess.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

function waitForExit(childProcess, timeout) {
  if (childProcess.exitCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      childProcess.off("exit", onExit);
      resolve(false);
    }, timeout);
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };

    childProcess.once("exit", onExit);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readMetrics(lhr) {
  return {
    accessibility: requiredNumber(lhr.categories.accessibility?.score, "accessibility score"),
    bestPractices: requiredNumber(lhr.categories["best-practices"]?.score, "best-practices score"),
    cumulativeLayoutShift: requiredNumber(
      lhr.audits["cumulative-layout-shift"]?.numericValue,
      "cumulative-layout-shift",
    ),
    largestContentfulPaint: requiredNumber(
      lhr.audits["largest-contentful-paint"]?.numericValue,
      "largest-contentful-paint",
    ),
    performance: requiredNumber(lhr.categories.performance?.score, "performance score"),
    seo: requiredNumber(lhr.categories.seo?.score, "SEO score"),
    totalBlockingTime: requiredNumber(lhr.audits["total-blocking-time"]?.numericValue, "total-blocking-time"),
  };
}

function requiredNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Lighthouse result is missing ${name}.`);
  }

  return value;
}

function summarize(results) {
  const keys = Object.keys(results[0]);
  return Object.fromEntries(keys.map((key) => [key, median(results.map((result) => result[key]))]));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function printSummary(summary) {
  process.stdout.write(
    [
      "Lighthouse median results:",
      `  performance: ${summary.performance.toFixed(2)}`,
      `  accessibility: ${summary.accessibility.toFixed(2)}`,
      `  best practices: ${summary.bestPractices.toFixed(2)}`,
      `  SEO: ${summary.seo.toFixed(2)}`,
      `  LCP: ${Math.round(summary.largestContentfulPaint)}ms`,
      `  TBT: ${Math.round(summary.totalBlockingTime)}ms`,
      `  CLS: ${summary.cumulativeLayoutShift.toFixed(3)}`,
      "",
    ].join("\n"),
  );
}

function assertThresholds(summary) {
  const failures = [];

  for (const category of ["accessibility", "bestPractices", "performance", "seo"]) {
    if (summary[category] < thresholds[category]) {
      failures.push(`${category} ${summary[category]} < ${thresholds[category]}`);
    }
  }
  for (const metric of ["cumulativeLayoutShift", "largestContentfulPaint", "totalBlockingTime"]) {
    if (summary[metric] > thresholds[metric]) {
      failures.push(`${metric} ${summary[metric]} > ${thresholds[metric]}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Lighthouse budgets failed:\n- ${failures.join("\n- ")}`);
  }
}
