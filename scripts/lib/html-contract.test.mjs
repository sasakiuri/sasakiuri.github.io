import { describe, expect, it } from "vitest";

import { parseHtmlDocument, tokenize } from "./html-contract.mjs";

describe("static HTML contract parser", () => {
  it("extracts browser-equivalent metadata, resources, identifiers, and structured data", () => {
    const document = parseHtmlDocument(`<!doctype html>
      <html lang="ja"><head>
        <title>A &amp; B</title>
        <meta name="description" content="説明">
        <meta property="og:title" content="A &amp; B">
        <link rel="canonical alternate" href="https://slithy.net/sasakiuri/">
        <link rel="manifest" href="/sasakiuri/manifest.webmanifest">
      </head><body>
        <main id="content"><a href="https://example.com" rel="noopener noreferrer" target="_blank">Example</a></main>
        <img src="/image.webp" alt="Image">
        <script type="application/ld+json">{"@type":"ProfilePage"}</script>
      </body></html>`);

    expect(document.htmlAttributes.lang).toBe("ja");
    expect(document.titles).toEqual(["A & B"]);
    expect(document.description).toEqual(["説明"]);
    expect(document.canonicalUrls).toEqual(["https://slithy.net/sasakiuri/"]);
    expect(document.manifestUrls).toEqual(["/sasakiuri/manifest.webmanifest"]);
    expect(document.metaByProperty.get("og:title")).toEqual(["A & B"]);
    expect(document.anchors).toEqual([
      {
        attributes: {
          href: "https://example.com",
          rel: "noopener noreferrer",
          target: "_blank",
        },
        text: "Example",
      },
    ]);
    expect(document.images).toEqual([{ alt: "Image", src: "/image.webp" }]);
    expect(document.ids.has("content")).toBe(true);
    expect(document.structuredData).toEqual([{ "@type": "ProfilePage" }]);
  });

  it("tokenizes space-separated attributes case-insensitively", () => {
    expect(tokenize(" NoOpener   NOREFERRER ")).toEqual(["noopener", "noreferrer"]);
  });

  it.each([
    ["a fragment", "<p>fragment</p>"],
    ["duplicate attributes", '<!doctype html><html lang="en" lang="ja"><head></head><body></body></html>'],
    ["unquoted attributes", "<!doctype html><html lang=en><head></head><body></body></html>"],
    ["an implicit closing body", '<!doctype html><html lang="en"><head></head><body>text</html>'],
  ])("fails closed for %s", (_label, html) => {
    expect(() => parseHtmlDocument(html)).toThrow(TypeError);
  });

  it("rejects browser-first duplicate attribute ambiguity", () => {
    const html =
      '<!doctype html><html lang="en"><head></head><body><a href="https://evil.example" href="https://slithy.net/">link</a></body></html>';

    expect(() => parseHtmlDocument(html)).toThrow(/duplicate-attribute/u);
  });
});
