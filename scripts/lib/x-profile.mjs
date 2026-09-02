import { parse } from "parse5";

import { createDiaryPost, diarySource } from "./diary-data.mjs";

const mediaOnlyText = "画像または動画を投稿しました。";

export function extractXProfilePosts(html) {
  if (typeof html !== "string" || html.length === 0) throw new TypeError("X profile HTML must be non-empty text.");

  const tree = parse(html);
  const profileUsername = findFirst(
    tree,
    (node) => node.tagName === "meta" && attributes(node).property === "profile:username",
  );
  if (attributes(profileUsername).content?.toLowerCase() !== diarySource.username) {
    throw new TypeError(`X profile HTML is not for @${diarySource.username}.`);
  }

  const posts = new Map();
  visit(tree, (node) => {
    const href = attributes(node)["data-href"];
    const match = new RegExp(`^/${diarySource.username}/status/(?<id>[1-9]\\d{5,24})$`, "u").exec(href ?? "");
    const id = match?.groups?.id;
    if (id === undefined || posts.has(id)) return;

    const article = findFirst(node, (candidate) => candidate.tagName === "article");
    if (article === undefined) return;
    const text = extractPostText(article) ?? (containsPostMedia(article) ? mediaOnlyText : undefined);
    if (text !== undefined) posts.set(id, createDiaryPost({ id, text }));
  });

  if (posts.size === 0) {
    throw new TypeError(`No public posts by @${diarySource.username} were found in the X profile HTML.`);
  }

  return [...posts.values()].sort((left, right) => (BigInt(left.id) > BigInt(right.id) ? -1 : 1));
}

function extractPostText(article) {
  let result;
  visit(
    article,
    (node) => {
      if (result !== undefined || node === article || node.tagName !== "div") return;
      const attribute = attributes(node);
      const classNames = new Set((attribute.class ?? "").split(/\s+/u));
      if (attribute.dir === "auto" && classNames.has("whitespace-pre-wrap") && classNames.has("text-body")) {
        const value = textContent(node).trim();
        if (value !== "") result = value;
      }
    },
    { skipNestedArticles: true },
  );
  return result;
}

function containsPostMedia(article) {
  let found = false;
  visit(
    article,
    (node) => {
      const source = attributes(node).src ?? "";
      if (
        node.tagName === "video" ||
        (node.tagName === "img" && /^https:\/\/pbs\.twimg\.com\/(?:amplify_video_thumb|media)\//u.test(source))
      ) {
        found = true;
      }
    },
    { skipNestedArticles: true },
  );
  return found;
}

function findFirst(root, predicate) {
  let match;
  visit(root, (node) => {
    if (match === undefined && predicate(node)) match = node;
  });
  return match;
}

function visit(root, callback, { skipNestedArticles = false } = {}) {
  const traverse = (node, isRoot) => {
    if (skipNestedArticles && !isRoot && node.tagName === "article") return;
    callback(node);
    for (const child of node.childNodes ?? []) traverse(child, false);
    if (node.tagName === "template" && node.content !== undefined) traverse(node.content, false);
  };
  traverse(root, true);
}

function attributes(node) {
  return Object.fromEntries((node?.attrs ?? []).map(({ name, value }) => [name, value]));
}

function textContent(node) {
  return (node.childNodes ?? [])
    .map((child) => (child.nodeName === "#text" ? child.value : textContent(child)))
    .join("");
}
