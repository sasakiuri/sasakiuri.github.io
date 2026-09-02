import { describe, expect, it } from "vitest";

import { extractXProfilePosts } from "./x-profile.mjs";

const profileMeta = '<meta property="profile:username" content="sasakiuri">';

describe("public X profile extraction", () => {
  it("extracts authored text, ignores reposts, and excludes nested quote text", () => {
    const html = `<!doctype html><html><head>${profileMeta}</head><body>
      <div data-href="/sasakiuri/status/2093251072781590942"><article>
        <div dir="auto" class="whitespace-pre-wrap text-body">一行目<br>二行目 &amp; 続き</div>
        <article><div dir="auto" class="whitespace-pre-wrap text-body">引用元</div></article>
      </article></div>
      <div data-href="/someone/status/2092877356218343626"><article>
        <div dir="auto" class="whitespace-pre-wrap text-body">他人の投稿</div>
      </article></div>
    </body></html>`;

    expect(extractXProfilePosts(html)).toEqual([
      expect.objectContaining({
        id: "2093251072781590942",
        text: "一行目二行目 & 続き",
        url: "https://x.com/sasakiuri/status/2093251072781590942",
      }),
    ]);
  });

  it("keeps media-only posts as diary entries", () => {
    const html = `<!doctype html><html><head>${profileMeta}</head><body>
      <div data-href="/sasakiuri/status/2092877356218343626"><article>
        <img src="https://pbs.twimg.com/media/example?format=webp&amp;name=medium" alt="">
      </article></div>
    </body></html>`;

    expect(extractXProfilePosts(html)[0]?.text).toBe("画像または動画を投稿しました。");
  });

  it("fails closed for the wrong profile or an incompatible empty response", () => {
    expect(() =>
      extractXProfilePosts('<html><head><meta property="profile:username" content="other"></head></html>'),
    ).toThrow(/not for/u);
    expect(() => extractXProfilePosts(`<!doctype html><html><head>${profileMeta}</head></html>`)).toThrow(
      /No public posts/u,
    );
  });
});
