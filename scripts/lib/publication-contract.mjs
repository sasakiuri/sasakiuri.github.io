import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseHtmlDocument, tokenize } from "./html-contract.mjs";
import { findNavigatorCapabilityReferences } from "./javascript-contract.mjs";
import { createPrecacheManifest } from "./service-worker-manifest.mjs";
import { publicPathToArtifactPath, siteContract, sortOrdinal } from "./site-contract.mjs";
import { readUtf8 } from "./static-export.mjs";

const contractedRoutes = [siteContract.routes.root, siteContract.routes.personal, siteContract.routes.diary];

export async function verifyPublicationContract({ availablePaths, fileShaByPath, initialEdges = [], outputDirectory }) {
  const edges = [...initialEdges];
  const documents = new Map();
  const routes = contractedRoutes;
  const routeEvidence = [];

  for (const route of routes) {
    assertAvailable(route.artifactPath, availablePaths, `route ${route.path}`);
    const html = await readUtf8(path.join(outputDirectory, route.artifactPath));
    const document = parseHtmlDocument(html);
    documents.set(route.artifactPath, document);
    await verifyRouteDocument({ availablePaths, document, documents, edges, outputDirectory, route });
    routeEvidence.push({
      artifactPath: route.artifactPath,
      canonicalUrl: route.url,
      externalLinks: expectedExternalLinks(route),
      path: route.path,
      sha256: fileShaByPath.get(route.artifactPath),
    });
  }

  const manifestEvidence = await verifyWebManifest({ availablePaths, edges, fileShaByPath, outputDirectory });
  const discoveryEvidence = await verifyDiscovery({ availablePaths, edges, fileShaByPath, outputDirectory });
  const serviceWorkerEvidence = await verifyServiceWorker({
    availablePaths,
    edges,
    fileShaByPath,
    outputDirectory,
  });

  return {
    assetGraph: {
      edges: sortEdges(uniqueEdges(edges)),
      nodes: availablePaths.size,
    },
    discovery: discoveryEvidence,
    pwa: {
      manifest: manifestEvidence,
      serviceWorker: serviceWorkerEvidence,
    },
    routes: routeEvidence,
  };
}

async function verifyRouteDocument({ availablePaths, document, documents, edges, outputDirectory, route }) {
  assertEqual(document.htmlAttributes.lang, route.language, `${route.path} document language`);
  assertSingleEqual(document.titles, route.title, `${route.path} title`);
  assertSingleEqual(document.description, route.description, `${route.path} description`);
  assertSingleEqual(document.canonicalUrls, route.url, `${route.path} canonical URL`);
  assertSingle(document.metaByName.get("viewport") ?? [], `${route.path} viewport`);

  const actualExternalLinks = [];
  for (const anchor of document.anchors) {
    const href = anchor.attributes.href;
    if (href === undefined) throw new TypeError(`${route.path} contains an anchor without href.`);
    const target = resolveReference(href, route.url);
    if (target.origin !== siteContract.origin) {
      if (!href.startsWith("https://") || target.username !== "" || target.password !== "") {
        throw new TypeError(`${route.path} external link is not a safe absolute HTTPS URL: ${href}`);
      }
      if (anchor.attributes.target !== "_blank") {
        throw new TypeError(`${route.path} external link must open a new context: ${href}`);
      }
      const rel = new Set(tokenize(anchor.attributes.rel));
      if (!rel.has("noopener") || !rel.has("noreferrer")) {
        throw new TypeError(`${route.path} external link is missing noopener or noreferrer: ${href}`);
      }
      actualExternalLinks.push(href);
      edges.push({ kind: "external-link", owner: route.artifactPath, target: href });
      continue;
    }

    const targetPath = await assertInternalReference({
      availablePaths,
      documents,
      outputDirectory,
      ownerUrl: route.url,
      reference: href,
    });
    edges.push({ kind: "document-link", owner: route.artifactPath, target: targetPath });
  }

  assertDeepEqual(actualExternalLinks, expectedExternalLinks(route), `${route.path} external link order`);
  if (route === siteContract.routes.personal) {
    for (const social of route.socials) {
      const anchor = document.anchors.find(({ attributes }) => attributes.href === social.href);
      if (anchor?.text !== social.label) {
        throw new TypeError(`${route.path} social label does not match ${social.href}.`);
      }
    }
    verifyPersonalAssets(document, route, availablePaths, edges);
    verifyServiceWorkerRegistration(document, route, availablePaths, edges);
    verifySocialMetadata(document, route, availablePaths, edges);
    verifyStructuredData(document, route);
  } else {
    if (document.manifestUrls.length !== 0 || document.structuredData.length !== 0) {
      throw new TypeError(`${route.path} must not publish the personal PWA or profile data.`);
    }
    if (
      document.metaByProperty.size !== 0 ||
      [...document.metaByName.keys()].some((name) => name.startsWith("twitter:"))
    ) {
      throw new TypeError(`${route.path} must preserve its minimal legacy metadata surface.`);
    }
  }
}

function verifyPersonalAssets(document, route, availablePaths, edges) {
  const favicon = document.links.filter(({ rel }) => {
    const tokens = tokenize(rel);
    return tokens.includes("icon") && !tokens.includes("apple-touch-icon");
  });
  assertSingle(favicon, "personal favicon link");
  assertEqual(favicon[0].href, route.favicon.src, "personal favicon path");
  assertEqual(favicon[0].type, route.favicon.type, "personal favicon media type");

  const appleTouchIcons = document.links.filter(({ rel }) => tokenize(rel).includes("apple-touch-icon"));
  assertSingle(appleTouchIcons, "personal apple touch icon link");
  assertEqual(appleTouchIcons[0].href, route.appleTouchIcon.src, "personal apple touch icon path");
  assertEqual(appleTouchIcons[0].sizes, route.appleTouchIcon.sizes, "personal apple touch icon size");
  assertEqual(appleTouchIcons[0].type, route.appleTouchIcon.type, "personal apple touch icon media type");

  const heroImages = document.images.filter(({ src }) => src === route.hero.image.src);
  assertSingle(heroImages, "personal hero image");
  assertEqual(heroImages[0].alt, route.hero.image.alt, "personal hero image alt text");
  assertEqual(heroImages[0].width, String(route.hero.image.width), "personal hero image width");
  assertEqual(heroImages[0].height, String(route.hero.image.height), "personal hero image height");

  for (const [kind, publicPath] of [
    ["apple-touch-icon", route.appleTouchIcon.src],
    ["favicon", route.favicon.src],
    ["hero-image", route.hero.image.src],
  ]) {
    const target = publicPathToArtifactPath(publicPath);
    assertAvailable(target, availablePaths, `${kind} asset`);
    edges.push({ kind, owner: route.artifactPath, target });
  }
}

function verifyServiceWorkerRegistration(document, route, availablePaths, edges) {
  const { publicPath, scope } = siteContract.pwa.serviceWorker;
  const prefix = 'if ("serviceWorker" in navigator) navigator.serviceWorker.register(';
  const registrations = document.scripts.flatMap(({ attributes, source }) => {
    if (attributes.src !== undefined || attributes.type?.toLowerCase() === "application/ld+json") return [];
    const sourceType = attributes.type?.toLowerCase() === "module" ? "module" : "script";
    return findNavigatorCapabilityReferences(source, sourceType).length > 0 ? [source.trim()] : [];
  });
  const expected = `${prefix}${JSON.stringify(publicPath)}, ${JSON.stringify({ scope, updateViaCache: "none" })});`;
  assertSingleEqual(registrations, expected, "personal Service Worker registration");

  const target = publicPathToArtifactPath(publicPath);
  assertAvailable(target, availablePaths, "registered Service Worker");
  edges.push({ kind: "service-worker-registration", owner: route.artifactPath, target });
}

function verifySocialMetadata(document, route, availablePaths, edges) {
  assertSingleEqual(document.metaByProperty.get("og:title") ?? [], route.title, "Open Graph title");
  assertSingleEqual(document.metaByProperty.get("og:description") ?? [], route.description, "Open Graph description");
  assertSingleEqual(document.metaByProperty.get("og:url") ?? [], route.url, "Open Graph URL");
  assertSingleEqual(document.metaByName.get("twitter:title") ?? [], route.title, "Twitter title");
  assertSingleEqual(document.metaByName.get("twitter:description") ?? [], route.description, "Twitter description");
  assertSingleEqual(document.manifestUrls, siteContract.pwa.manifest.publicPath, "personal web manifest URL");

  const socialImageUrl = new URL(route.socialImage.src, `${siteContract.origin}/`).href;
  assertSingleEqual(document.metaByProperty.get("og:image") ?? [], socialImageUrl, "Open Graph image");
  assertSingleEqual(document.metaByName.get("twitter:image") ?? [], socialImageUrl, "Twitter image");
  assertSingleEqual(
    document.metaByProperty.get("og:image:width") ?? [],
    String(route.socialImage.width),
    "Open Graph image width",
  );
  assertSingleEqual(
    document.metaByProperty.get("og:image:height") ?? [],
    String(route.socialImage.height),
    "Open Graph image height",
  );
  assertSingleEqual(document.metaByProperty.get("og:image:alt") ?? [], route.socialImage.alt, "Open Graph image alt");
  assertSingleEqual(document.metaByName.get("twitter:image:alt") ?? [], route.socialImage.alt, "Twitter image alt");
  assertSingleEqual(
    document.metaByName.get("twitter:image:width") ?? [],
    String(route.socialImage.width),
    "Twitter image width",
  );
  assertSingleEqual(
    document.metaByName.get("twitter:image:height") ?? [],
    String(route.socialImage.height),
    "Twitter image height",
  );

  assertAvailable(publicPathToArtifactPath(route.socialImage.src), availablePaths, "social image");
  edges.push({
    kind: "social-image",
    owner: route.artifactPath,
    target: publicPathToArtifactPath(route.socialImage.src),
  });
  edges.push({
    kind: "manifest",
    owner: route.artifactPath,
    target: publicPathToArtifactPath(siteContract.pwa.manifest.publicPath),
  });
}

function verifyStructuredData(document, route) {
  const expected = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    description: route.description,
    inLanguage: route.language,
    mainEntity: {
      "@id": new URL("#person", route.url).href,
      "@type": "Person",
      name: route.name,
      sameAs: route.socials.map(({ href }) => href),
      url: route.url,
    },
    name: route.title,
    url: route.url,
  };
  assertSingle(document.structuredData, "personal JSON-LD document");
  assertDeepEqual(document.structuredData[0], expected, "personal JSON-LD document");
}

async function verifyWebManifest({ availablePaths, edges, fileShaByPath, outputDirectory }) {
  const policy = siteContract.pwa.manifest;
  const route = siteContract.routes.personal;
  const artifactPath = publicPathToArtifactPath(policy.publicPath);
  assertAvailable(artifactPath, availablePaths, "web manifest");
  const manifest = JSON.parse(await readUtf8(path.join(outputDirectory, artifactPath)));
  const expected = {
    background_color: policy.backgroundColor,
    categories: [...policy.categories],
    description: route.description,
    display: policy.display,
    icons: policy.icons.map((icon) => ({ ...icon })),
    id: route.path,
    lang: route.language,
    name: route.title,
    orientation: policy.orientation,
    scope: siteContract.pwa.serviceWorker.scope,
    short_name: policy.shortName,
    start_url: route.path,
    theme_color: policy.themeColor,
  };
  assertDeepEqual(manifest, expected, "web manifest");

  edges.push({ kind: "start-url", owner: artifactPath, target: route.artifactPath });
  for (const icon of policy.icons) {
    const iconPath = publicPathToArtifactPath(icon.src);
    assertAvailable(iconPath, availablePaths, `manifest icon ${icon.src}`);
    const [width, height] = icon.sizes.split("x").map(Number);
    await assertPngDimensions(path.join(outputDirectory, iconPath), width, height, icon.src);
    edges.push({ kind: "manifest-icon", owner: artifactPath, target: iconPath });
  }

  const appleIconPath = publicPathToArtifactPath(route.appleTouchIcon.src);
  const [appleWidth, appleHeight] = route.appleTouchIcon.sizes.split("x").map(Number);
  await assertPngDimensions(
    path.join(outputDirectory, appleIconPath),
    appleWidth,
    appleHeight,
    route.appleTouchIcon.src,
  );
  await assertPngDimensions(
    path.join(outputDirectory, publicPathToArtifactPath(route.socialImage.src)),
    route.socialImage.width,
    route.socialImage.height,
    route.socialImage.src,
  );
  await assertWebp(path.join(outputDirectory, publicPathToArtifactPath(route.hero.image.src)), route.hero.image.src);
  await assertIco(path.join(outputDirectory, publicPathToArtifactPath(route.favicon.src)), route.favicon.src);
  await assertIco(path.join(outputDirectory, "favicon.ico"), "/favicon.ico");

  return {
    artifactPath,
    icons: policy.icons.length,
    sha256: fileShaByPath.get(artifactPath),
  };
}

async function verifyDiscovery({ availablePaths, edges, fileShaByPath, outputDirectory }) {
  const { robotsArtifactPath, sitemapArtifactPath } = siteContract.discovery;
  assertAvailable(robotsArtifactPath, availablePaths, "robots.txt");
  assertAvailable(sitemapArtifactPath, availablePaths, "sitemap.xml");
  const [robots, sitemap] = await Promise.all([
    readUtf8(path.join(outputDirectory, robotsArtifactPath)),
    readUtf8(path.join(outputDirectory, sitemapArtifactPath)),
  ]);
  const expectedUrls = contractedRoutes.map(({ url }) => url);
  const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  assertDeepEqual(sitemapUrls, expectedUrls, "sitemap canonical URL set");
  const expectedSitemapUrl = new URL(`/${sitemapArtifactPath}`, `${siteContract.origin}/`).href;
  const expectedRobots = `User-Agent: *\nAllow: /\n\nSitemap: ${expectedSitemapUrl}`;
  assertEqual(robots.replaceAll("\r\n", "\n").trim(), expectedRobots, "robots.txt contract");
  for (const route of contractedRoutes) {
    edges.push({ kind: "sitemap-route", owner: sitemapArtifactPath, target: route.artifactPath });
  }
  edges.push({ kind: "robots-sitemap", owner: robotsArtifactPath, target: sitemapArtifactPath });
  return {
    robots: { artifactPath: robotsArtifactPath, sha256: fileShaByPath.get(robotsArtifactPath) },
    sitemap: { artifactPath: sitemapArtifactPath, sha256: fileShaByPath.get(sitemapArtifactPath), urls: sitemapUrls },
  };
}

async function verifyServiceWorker({ availablePaths, edges, fileShaByPath, outputDirectory }) {
  const policy = siteContract.pwa.serviceWorker;
  const artifactPath = publicPathToArtifactPath(policy.publicPath);
  assertAvailable(artifactPath, availablePaths, "Service Worker");
  const source = await readUtf8(path.join(outputDirectory, artifactPath));
  const actual = {
    cachePrefix: extractJsonConstant(source, "cachePrefix"),
    navigationFallback: extractJsonConstant(source, "navigationFallback"),
    urls: extractJsonConstant(source, "precacheUrls"),
    version: extractJsonConstant(source, "precacheVersion"),
  };
  const expected = await createPrecacheManifest(outputDirectory);
  assertEqual(actual.cachePrefix, policy.cachePrefix, "Service Worker cache prefix");
  assertEqual(actual.navigationFallback, policy.navigationFallback, "Service Worker navigation fallback");
  assertDeepEqual(actual.urls, expected.urls, "Service Worker precache URL set");
  assertEqual(actual.version, expected.version, "Service Worker precache version");
  for (const url of expected.urls) {
    const target = url.endsWith("/") ? `${url.slice(1)}index.html` : publicPathToArtifactPath(url);
    assertAvailable(target, availablePaths, `Service Worker target ${url}`);
    edges.push({ kind: "precache", owner: artifactPath, target });
  }
  return {
    artifactPath,
    precacheEntries: expected.urls.length,
    sha256: fileShaByPath.get(artifactPath),
    version: expected.version,
  };
}

async function assertInternalReference({ availablePaths, documents, outputDirectory, ownerUrl, reference }) {
  assertUnambiguousReference(reference);
  const url = resolveReference(reference, ownerUrl);
  if (url.username !== "" || url.password !== "")
    throw new TypeError(`Internal URL contains credentials: ${reference}`);
  const artifactPath = url.pathname.endsWith("/")
    ? `${decodeURIComponent(url.pathname).replace(/^\//u, "")}index.html`
    : decodeURIComponent(url.pathname).replace(/^\//u, "");
  assertAvailable(artifactPath, availablePaths, `internal reference ${reference}`);
  if (url.hash !== "") {
    let document = documents.get(artifactPath);
    if (document === undefined) {
      document = parseHtmlDocument(await readUtf8(path.join(outputDirectory, artifactPath)));
      documents.set(artifactPath, document);
    }
    const fragment = decodeURIComponent(url.hash.slice(1));
    if (!document.ids.has(fragment)) throw new TypeError(`Broken fragment in ${reference}: ${fragment}`);
  }
  return artifactPath;
}

function resolveReference(reference, ownerUrl) {
  try {
    return new URL(reference, ownerUrl);
  } catch {
    throw new TypeError(`Invalid URL reference: ${reference}`);
  }
}

function assertUnambiguousReference(reference) {
  let decoded;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    throw new TypeError(`URL reference has invalid encoding: ${reference}`);
  }
  if (decoded.includes("\\") || decoded.split(/[/?#]/u).includes("..")) {
    throw new TypeError(`URL reference contains traversal syntax: ${reference}`);
  }
}

async function assertPngDimensions(filePath, expectedWidth, expectedHeight, label) {
  const body = await readFile(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (body.length < 24 || !body.subarray(0, 8).equals(signature)) throw new TypeError(`${label} is not a PNG image.`);
  const width = body.readUInt32BE(16);
  const height = body.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new TypeError(`${label} dimensions are ${width}x${height}; expected ${expectedWidth}x${expectedHeight}.`);
  }
}

async function assertWebp(filePath, label) {
  const body = await readFile(filePath);
  if (body.length < 12 || body.toString("ascii", 0, 4) !== "RIFF" || body.toString("ascii", 8, 12) !== "WEBP") {
    throw new TypeError(`${label} is not a WebP image.`);
  }
}

async function assertIco(filePath, label) {
  const body = await readFile(filePath);
  if (body.length < 6 || !body.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) || body.readUInt16LE(4) < 1) {
    throw new TypeError(`${label} is not a populated ICO image.`);
  }
}

function extractJsonConstant(source, name) {
  const match = source.match(new RegExp(String.raw`const ${name} = ([\s\S]*?);\n`, "u"));
  if (match?.[1] === undefined) throw new TypeError(`Service Worker is missing ${name}.`);
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new TypeError(`Service Worker ${name} is not a JSON literal.`);
  }
}

function expectedExternalLinks(route) {
  if (route === siteContract.routes.personal) {
    return [route.hero.sourceUrl, ...route.socials.map(({ href }) => href)];
  }
  return [];
}

function assertAvailable(artifactPath, availablePaths, label) {
  if (!availablePaths.has(artifactPath)) throw new TypeError(`${label} is missing: ${artifactPath}`);
}

function assertSingle(values, label) {
  if (values.length !== 1) throw new TypeError(`${label} must occur exactly once; found ${values.length}.`);
}

function assertSingleEqual(values, expected, label) {
  assertSingle(values, label);
  assertEqual(values[0], expected, label);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected)
    throw new TypeError(`${label} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`);
}

function assertDeepEqual(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) throw new TypeError(`${label} does not match the publication contract.`);
}

function uniqueEdges(edges) {
  const byKey = new Map(edges.map((edge) => [`${edge.kind}\0${edge.owner}\0${edge.target}`, edge]));
  return [...byKey.values()];
}

function sortEdges(edges) {
  const keys = sortOrdinal(edges.map((edge) => `${edge.owner}\0${edge.kind}\0${edge.target}`));
  const byKey = new Map(edges.map((edge) => [`${edge.owner}\0${edge.kind}\0${edge.target}`, edge]));
  return keys.map((key) => byKey.get(key));
}
