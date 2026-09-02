import type { DiarySearchPost } from "@/content/diary-types";
import { diaryConfig } from "@/config/site";

export const diaryAtomFeedPath = "/sasakuri/diary/feed.xml";
export const diaryAtomFeedLimit = 50;

const feedUrl = new URL(diaryAtomFeedPath, `${diaryConfig.url}/`).href;
const yearFormatter = new Intl.DateTimeFormat("en", { timeZone: "Asia/Tokyo", year: "numeric" });
const titleFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "long",
  timeZone: "Asia/Tokyo",
  year: "numeric",
});

export function createDiaryAtomFeed(posts: readonly DiarySearchPost[]): string {
  if (posts.length === 0) throw new TypeError("The diary Atom feed requires at least one post.");

  const entries = [...posts]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, diaryAtomFeedLimit);
  const latest = entries[0];
  if (latest === undefined) throw new TypeError("The diary Atom feed requires a latest post.");

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">',
    `  <title>${escapeXml(diaryConfig.title)}</title>`,
    `  <id>${escapeXml(diaryConfig.url)}</id>`,
    "  <author>",
    "    <name>ささきうり</name>",
    "  </author>",
    `  <link href="${escapeXml(diaryConfig.url)}" rel="alternate" />`,
    `  <link href="${escapeXml(feedUrl)}" rel="self" type="application/atom+xml" />`,
    `  <updated>${escapeXml(latest.publishedAt)}</updated>`,
    ...entries.flatMap((post) => atomEntry(post)),
    "</feed>",
    "",
  ].join("\n");
}

function atomEntry(post: DiarySearchPost): readonly string[] {
  const publishedAt = new Date(post.publishedAt);
  const year = yearFormatter.format(publishedAt);
  const entryUrl = new URL(`${year}/#entry-${post.id}`, diaryConfig.url).href;
  return [
    "  <entry>",
    `    <title>${escapeXml(titleFormatter.format(publishedAt))}</title>`,
    `    <id>${escapeXml(entryUrl)}</id>`,
    `    <link href="${escapeXml(entryUrl)}" rel="alternate" />`,
    `    <published>${escapeXml(post.publishedAt)}</published>`,
    `    <updated>${escapeXml(post.publishedAt)}</updated>`,
    `    <content type="text">${escapeXml(post.text)}</content>`,
    "  </entry>",
  ];
}

function escapeXml(value: string): string {
  const validXml = [...value]
    .map((character) => (isXmlCharacter(character.codePointAt(0) ?? 0) ? character : "�"))
    .join("");
  return validXml.replace(/[&<>"']/gu, (character) => {
    const entities: Readonly<Record<string, string>> = {
      '"': "&quot;",
      "&": "&amp;",
      "'": "&apos;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return entities[character] ?? character;
  });
}

function isXmlCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10_000 && codePoint <= 0x10_ffff)
  );
}
