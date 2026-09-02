// @vitest-environment node

import { readFile } from "node:fs/promises";

import { parse } from "acorn";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const scriptUrl = new URL("./export-x-diary.js", import.meta.url);

describe("DevTools diary exporter", () => {
  it("is a standalone script that avoids credentials and direct network access", async () => {
    const source = await readFile(scriptUrl, "utf8");

    expect(() => parse(source, { ecmaVersion: "latest", sourceType: "script" })).not.toThrow();
    expect(source).toContain("x-browser-dom-v1");
    expect(source).toContain('article[data-testid="tweet"]');
    expect(source).not.toMatch(/\b(?:cookie|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest)\b/u);
    expect(source).not.toMatch(/\bAuthorization\b/u);
  });

  it("collects authored DOM posts while excluding reposts and quoted content", async () => {
    const source = await readFile(scriptUrl, "utf8");
    const dom = new JSDOM(
      `<!doctype html><html><body>
        <div data-href="/sasakiuri/status/2093251072781590942"><article data-testid="tweet">
          <a href="/sasakiuri/status/2093251072781590942"><time datetime="2026-08-28T08:15:21.132Z"></time></a>
          <div data-testid="tweetText">一行目<br>二行目 <img alt="🌟"></div>
          <article data-testid="tweet"><div data-testid="tweetText">引用元</div></article>
        </article></div>
        <div data-href="/sasakiuri/status/2092877356218343626"><article data-testid="tweet">
          <img src="https://pbs.twimg.com/media/example.jpg" alt="">
        </article></div>
        <div data-href="/sasakiuri/status/2092500000000000000"><article data-testid="tweet"></article></div>
        <div data-href="/someone/status/2088523830969143604"><article data-testid="tweet">
          <div data-testid="tweetText">リポストされた他人の投稿</div>
        </article></div>
      </body></html>`,
      { runScripts: "outside-only", url: "https://x.com/sasakiuri/with_replies" },
    );
    dom.window.__SASAKIURI_DIARY_EXPORTER_OPTIONS__ = {
      autoDownload: false,
      delayMs: 10,
      idleRounds: 1,
      maxRounds: 1,
    };
    dom.window.scrollBy = () => {};
    dom.window.console.info = () => {};
    dom.window.console.warn = () => {};

    dom.window.eval(source);
    const payload = JSON.parse(JSON.stringify(await dom.window.__sasakiuriDiaryExporter.done));

    expect(payload).toMatchObject({
      posts: [
        { id: "2093251072781590942", text: "一行目\n二行目 🌟" },
        { id: "2092877356218343626", text: "画像または動画を投稿しました。" },
      ],
      source: { kind: "x-browser-dom-v1", username: "sasakiuri" },
      version: 1,
    });
    expect(dom.window.__sasakiuriDiaryExporter.status()).toMatchObject({
      count: 2,
      running: false,
    });
    dom.window.close();
  });
});
