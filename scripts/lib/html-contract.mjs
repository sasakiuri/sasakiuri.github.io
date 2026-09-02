import { parse } from "parse5";

const quotedAttributePattern = /^(?<name>[^\s"'<>/=]+)\s*=\s*(?:"[^"]*"|'[^']*')$/su;
const requiredClosingTags = new Set(["body", "head", "html"]);

export function parseHtmlDocument(html) {
  if (typeof html !== "string") throw new TypeError("HTML source must be text.");

  const parseErrors = [];
  const tree = parse(html, {
    onParseError: (error) => parseErrors.push(error),
    sourceCodeLocationInfo: true,
  });
  if (parseErrors.length > 0) {
    const error = parseErrors[0];
    throw new TypeError(`HTML parse error ${error.code} at ${error.startLine}:${error.startCol}.`);
  }

  const documentTypes = tree.childNodes.filter(({ nodeName }) => nodeName === "#documentType");
  const htmlElements = tree.childNodes.filter((node) => isElement(node, "html"));
  if (documentTypes.length !== 1 || documentTypes[0]?.name.toLowerCase() !== "html" || htmlElements.length !== 1) {
    throw new TypeError("HTML document must contain one HTML5 doctype and one html element.");
  }

  const htmlElement = htmlElements[0];
  const headElements = htmlElement.childNodes.filter((node) => isElement(node, "head"));
  const bodyElements = htmlElement.childNodes.filter((node) => isElement(node, "body"));
  if (headElements.length !== 1 || bodyElements.length !== 1) {
    throw new TypeError("HTML document must contain one explicit head and one explicit body.");
  }

  const elements = collectElements(htmlElement);
  for (const element of elements) assertExplicitSyntax(element, html);
  const descriptors = elements.map(toDescriptor);
  const byTag = (tagName) => descriptors.filter((element) => element.tagName === tagName);
  const metaElements = byTag("meta").map(({ attributes }) => attributes);
  const links = byTag("link").map(({ attributes }) => attributes);
  const anchors = byTag("a").map(({ attributes, text }) => ({ attributes, text: normalizeText(text) }));
  const scripts = byTag("script").map(({ attributes, text }) => ({ attributes, source: text }));
  const ids = descriptors.map(({ attributes }) => attributes.id).filter((value) => value !== undefined);
  if (new Set(ids).size !== ids.length) throw new TypeError("HTML document contains duplicate id attributes.");

  const structuredData = scripts
    .filter(({ attributes }) => attributes.type?.toLowerCase() === "application/ld+json")
    .map(({ source }) => {
      try {
        return JSON.parse(source);
      } catch {
        throw new TypeError("HTML document contains invalid JSON-LD.");
      }
    });

  return {
    anchors,
    canonicalUrls: links
      .filter(({ rel }) => tokenize(rel).includes("canonical"))
      .map(({ href }) => href)
      .filter((value) => value !== undefined),
    description: getMetaValues(metaElements, "name", "description"),
    htmlAttributes: attributesToRecord(htmlElement.attrs),
    ids: new Set(ids),
    images: byTag("img").map(({ attributes }) => attributes),
    links,
    manifestUrls: links
      .filter(({ rel }) => tokenize(rel).includes("manifest"))
      .map(({ href }) => href)
      .filter((value) => value !== undefined),
    metaByHttpEquiv: groupMetaValues(metaElements, "http-equiv"),
    metaByName: groupMetaValues(metaElements, "name"),
    metaByProperty: groupMetaValues(metaElements, "property"),
    scripts,
    sources: byTag("source").map(({ attributes }) => attributes),
    structuredData,
    titles: byTag("title").map(({ text }) => text),
  };
}

export function tokenize(value = "") {
  return value.toLowerCase().split(/\s+/u).filter(Boolean);
}

function collectElements(root) {
  const elements = [];
  const visit = (node) => {
    if (typeof node.tagName === "string") elements.push(node);
    for (const child of node.childNodes ?? []) visit(child);
    if (node.tagName === "template" && node.content !== undefined) visit(node.content);
  };
  visit(root);
  return elements;
}

function assertExplicitSyntax(element, html) {
  const location = element.sourceCodeLocation;
  if (location?.startTag === undefined) {
    throw new TypeError(`HTML parser implicitly created <${element.tagName}>.`);
  }
  if (requiredClosingTags.has(element.tagName) && location.endTag === undefined) {
    throw new TypeError(`HTML element <${element.tagName}> requires an explicit closing tag.`);
  }

  const attributeLocations = location.attrs ?? {};
  for (const attribute of element.attrs) {
    const attributeLocation = attributeLocations[attribute.name];
    if (attributeLocation === undefined) {
      throw new TypeError(`HTML attribute ${attribute.name} on <${element.tagName}> has no source location.`);
    }
    const source = html.slice(attributeLocation.startOffset, attributeLocation.endOffset);
    const match = quotedAttributePattern.exec(source);
    if (match?.groups?.name.toLowerCase() !== attribute.name) {
      throw new TypeError(`HTML attribute ${attribute.name} on <${element.tagName}> must use a quoted value.`);
    }
  }
}

function toDescriptor(element) {
  return {
    attributes: attributesToRecord(element.attrs),
    tagName: element.tagName,
    text: textContent(element),
  };
}

function attributesToRecord(attributes) {
  return Object.fromEntries(attributes.map(({ name, value }) => [name, value]));
}

function textContent(node) {
  return (node.childNodes ?? [])
    .map((child) => (child.nodeName === "#text" ? child.value : textContent(child)))
    .join("");
}

function normalizeText(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function isElement(node, tagName) {
  return node.tagName === tagName;
}

function getMetaValues(metaElements, key, expectedName) {
  return metaElements
    .filter((attributes) => attributes[key]?.toLowerCase() === expectedName)
    .map(({ content }) => content)
    .filter((value) => value !== undefined);
}

function groupMetaValues(metaElements, key) {
  const grouped = new Map();
  for (const attributes of metaElements) {
    const name = attributes[key]?.toLowerCase();
    const value = attributes.content;
    if (name === undefined || value === undefined) continue;
    grouped.set(name, [...(grouped.get(name) ?? []), value]);
  }
  return grouped;
}
