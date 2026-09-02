// @vitest-environment node

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const importerUrl = new URL("./import-diary-browser-export.mjs", import.meta.url);
const diaryUrl = new URL("../src/content/diary.json", import.meta.url);

describe("browser diary export importer", () => {
  it("reports a dry run without changing the tracked diary", async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "sasakiuri-diary-import-"));
    const exportPath = path.join(temporaryDirectory, "export.json");
    const before = await readFile(diaryUrl, "utf8");
    const currentCount = JSON.parse(before).posts.length;
    await writeFile(
      exportPath,
      `${JSON.stringify({
        exportedAt: "2026-09-02T04:00:00.000Z",
        posts: [{ id: "1000000", text: "過去の投稿" }],
        source: { kind: "x-browser-dom-v1", username: "sasakiuri" },
        version: 1,
      })}\n`,
    );

    try {
      const { stderr, stdout } = await executeFile(process.execPath, [importerUrl.pathname, "--dry-run", exportPath], {
        cwd: process.cwd(),
      });

      expect(stderr).toBe("");
      expect(stdout).toBe(`Would archive ${currentCount + 1} posts (1 additions, 0 text updates).\n`);
      expect(await readFile(diaryUrl, "utf8")).toBe(before);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
