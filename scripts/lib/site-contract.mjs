import rawSiteContract from "../../config/site-contract.json" with { type: "json" };

const safeSegment = String.raw`(?!\.{1,2}(?:/|$))[A-Za-z\d._~-]+`;
const artifactPathPattern = new RegExp(`^(?:${safeSegment}/)*${safeSegment}$`, "u");
const directoryPathPattern = new RegExp(`^/(?:${safeSegment}/)*$`, "u");
const publicPathPattern = new RegExp(`^/(?:${safeSegment}/)*${safeSegment}$`, "u");

export const siteContract = validateSiteContract(rawSiteContract);

export function validateSiteContract(value) {
  assertRecord(value, "site contract");
  assertExactKeys(value, ["$schema", "discovery", "origin", "pwa", "routes", "version"], "site contract");
  assertEqual(value.$schema, "./site-contract.schema.json", "site contract schema reference");
  assertEqual(value.version, 1, "site contract version");
  assertHttpsOrigin(value.origin, "site contract origin");

  assertRecord(value.discovery, "discovery contract");
  assertExactKeys(value.discovery, ["robotsArtifactPath", "sitemapArtifactPath"], "discovery contract");
  assertEqual(value.discovery.robotsArtifactPath, "robots.txt", "robots artifact path");
  assertEqual(value.discovery.sitemapArtifactPath, "sitemap.xml", "sitemap artifact path");

  assertRecord(value.routes, "route contract");
  assertExactKeys(value.routes, ["personal", "root"], "route contract");
  validateRootRoute(value.routes.root, value.origin);
  validatePersonalRoute(value.routes.personal, value.origin);

  assertRecord(value.pwa, "PWA contract");
  assertExactKeys(value.pwa, ["manifest", "serviceWorker"], "PWA contract");
  validateManifest(value.pwa.manifest);
  validateServiceWorker(value.pwa.serviceWorker);
  validateRelationships(value);

  return deepFreeze(value);
}

export function getPrecachePublicPaths(contract = siteContract) {
  const { manifest, serviceWorker } = contract.pwa;
  const personal = contract.routes.personal;
  return sortOrdinal(
    unique([
      personal.path,
      personal.appleTouchIcon.src,
      personal.favicon.src,
      personal.hero.image.src,
      personal.socialImage.src,
      manifest.publicPath,
      ...manifest.icons.map(({ src }) => src),
      ...serviceWorker.additionalPrecachePaths,
    ]),
  );
}

export function publicPathToArtifactPath(publicPath) {
  assertPublicPath(publicPath, "public path");
  return publicPath.slice(1);
}

export function sortOrdinal(values) {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function validateRootRoute(route, origin) {
  assertRecord(route, "root route");
  assertExactKeys(
    route,
    ["artifactPath", "description", "language", "path", "socialMetadata", "title", "url"],
    "root route",
  );
  validateCommonRoute(route, origin, "root route");
  assertEqual(route.language, "en", "root language");
  assertEqual(route.path, "/", "root path");
  assertEqual(route.socialMetadata, false, "root social metadata flag");
}

function validatePersonalRoute(route, origin) {
  assertRecord(route, "personal route");
  assertExactKeys(
    route,
    [
      "appleTouchIcon",
      "artifactPath",
      "description",
      "favicon",
      "hero",
      "language",
      "name",
      "pageHeading",
      "path",
      "socialImage",
      "socialMetadata",
      "socials",
      "title",
      "url",
    ],
    "personal route",
  );
  validateCommonRoute(route, origin, "personal route");
  assertEqual(route.language, "ja", "personal language");
  assertEqual(route.path, "/sasakiuri/", "personal path");
  assertEqual(route.socialMetadata, true, "personal social metadata flag");
  for (const [name, text] of [
    ["personal name", route.name],
    ["personal page heading", route.pageHeading],
  ]) {
    assertNonEmptyText(text, name);
  }

  validateLinkIcon(route.appleTouchIcon, "apple touch icon", true);
  validateLinkIcon(route.favicon, "favicon", false);
  validateImage(route.socialImage, "social image");
  assertRecord(route.hero, "hero");
  assertExactKeys(route.hero, ["annotation", "image", "label", "sourceUrl"], "hero");
  assertNonEmptyText(route.hero.annotation, "hero annotation");
  assertNonEmptyText(route.hero.label, "hero label");
  assertSafeExternalUrl(route.hero.sourceUrl, "hero source URL");
  validateImage(route.hero.image, "hero image");

  if (!Array.isArray(route.socials) || route.socials.length === 0) {
    throw new TypeError("Personal socials must be a non-empty array.");
  }
  for (const [index, social] of route.socials.entries()) {
    assertRecord(social, `social ${index + 1}`);
    assertExactKeys(social, ["href", "label"], `social ${index + 1}`);
    assertSafeExternalUrl(social.href, `social ${index + 1} URL`);
    assertNonEmptyText(social.label, `social ${index + 1} label`);
  }
  assertUnique(
    route.socials.map(({ href }) => href),
    "Social URLs",
  );
  assertUnique(
    route.socials.map(({ label }) => label),
    "Social labels",
  );
}

function validateCommonRoute(route, origin, name) {
  assertArtifactPath(route.artifactPath, `${name} artifact path`);
  assertNonEmptyText(route.description, `${name} description`);
  assertNonEmptyText(route.title, `${name} title`);
  assertDirectoryPath(route.path, `${name} path`);
  assertCanonicalUrl(route.url, `${name} canonical URL`);
  assertEqual(route.url, new URL(route.path, `${origin}/`).href, `${name} canonical URL`);
  assertEqual(
    route.artifactPath,
    route.path === "/" ? "index.html" : `${route.path.slice(1)}index.html`,
    `${name} artifact path`,
  );
}

function validateManifest(manifest) {
  assertRecord(manifest, "web manifest contract");
  assertExactKeys(
    manifest,
    ["backgroundColor", "categories", "display", "icons", "orientation", "publicPath", "shortName", "themeColor"],
    "web manifest contract",
  );
  assertColor(manifest.backgroundColor, "manifest background color");
  assertColor(manifest.themeColor, "manifest theme color");
  assertEqual(manifest.display, "standalone", "manifest display");
  assertEqual(manifest.orientation, "any", "manifest orientation");
  assertPublicPath(manifest.publicPath, "manifest public path");
  assertNonEmptyText(manifest.shortName, "manifest short name");
  if (!Array.isArray(manifest.categories) || manifest.categories.length === 0) {
    throw new TypeError("Manifest categories must be a non-empty array.");
  }
  for (const category of manifest.categories) assertNonEmptyText(category, "manifest category");
  assertUnique(manifest.categories, "Manifest categories");

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    throw new TypeError("Manifest icons must be a non-empty array.");
  }
  for (const [index, icon] of manifest.icons.entries()) {
    assertRecord(icon, `manifest icon ${index + 1}`);
    assertExactKeys(icon, ["purpose", "sizes", "src", "type"], `manifest icon ${index + 1}`);
    if (!["any", "maskable"].includes(icon.purpose)) {
      throw new TypeError(`Manifest icon ${index + 1} purpose is invalid.`);
    }
    if (typeof icon.sizes !== "string" || !/^[1-9]\d*x[1-9]\d*$/u.test(icon.sizes)) {
      throw new TypeError(`Manifest icon ${index + 1} sizes are invalid.`);
    }
    assertPublicPath(icon.src, `manifest icon ${index + 1} path`);
    assertEqual(icon.type, "image/png", `manifest icon ${index + 1} media type`);
  }
  assertUnique(
    manifest.icons.map(({ purpose }) => purpose),
    "Manifest icon purposes",
  );
}

function validateServiceWorker(serviceWorker) {
  assertRecord(serviceWorker, "Service Worker contract");
  assertExactKeys(
    serviceWorker,
    ["additionalPrecachePaths", "cachePrefix", "navigationFallback", "publicPath", "scope"],
    "Service Worker contract",
  );
  if (typeof serviceWorker.cachePrefix !== "string" || !/^[a-z\d-]+-$/u.test(serviceWorker.cachePrefix)) {
    throw new TypeError("Service Worker cache prefix is invalid.");
  }
  assertDirectoryPath(serviceWorker.navigationFallback, "Service Worker navigation fallback");
  assertPublicPath(serviceWorker.publicPath, "Service Worker public path");
  assertDirectoryPath(serviceWorker.scope, "Service Worker scope");
  if (!Array.isArray(serviceWorker.additionalPrecachePaths)) {
    throw new TypeError("Additional precache paths must be an array.");
  }
  for (const publicPath of serviceWorker.additionalPrecachePaths) {
    assertPublicPath(publicPath, "additional precache path");
  }
  assertUnique(serviceWorker.additionalPrecachePaths, "Additional precache paths");
}

function validateRelationships(contract) {
  const { manifest, serviceWorker } = contract.pwa;
  const personal = contract.routes.personal;
  assertEqual(serviceWorker.scope, personal.path, "Service Worker scope");
  assertEqual(serviceWorker.navigationFallback, personal.path, "Service Worker navigation fallback");
  assertEqual(manifest.shortName, personal.name, "manifest short name");

  for (const publicPath of [
    personal.appleTouchIcon.src,
    personal.favicon.src,
    personal.hero.image.src,
    personal.socialImage.src,
    manifest.publicPath,
    serviceWorker.publicPath,
    ...manifest.icons.map(({ src }) => src),
    ...serviceWorker.additionalPrecachePaths,
  ]) {
    if (!publicPath.startsWith(personal.path)) {
      throw new TypeError(`Personal asset is outside ${personal.path}: ${publicPath}`);
    }
  }
}

function validateLinkIcon(icon, name, hasSizes) {
  assertRecord(icon, name);
  assertExactKeys(icon, hasSizes ? ["sizes", "src", "type"] : ["src", "type"], name);
  if (hasSizes) assertNonEmptyText(icon.sizes, `${name} sizes`);
  assertPublicPath(icon.src, `${name} path`);
  assertNonEmptyText(icon.type, `${name} media type`);
}

function validateImage(image, name) {
  assertRecord(image, name);
  assertExactKeys(image, ["alt", "height", "src", "width"], name);
  assertNonEmptyText(image.alt, `${name} alt`);
  assertPositiveNumber(image.height, `${name} height`);
  assertPublicPath(image.src, `${name} path`);
  if (!Number.isInteger(image.width) || image.width <= 0) {
    throw new TypeError(`${name} width must be a positive integer.`);
  }
}

function assertHttpsOrigin(value, name) {
  assertHttpsUrl(value, name);
  if (new URL(value).origin !== value) throw new TypeError(`${name} must contain an origin only.`);
}

function assertCanonicalUrl(value, name) {
  assertHttpsUrl(value, name);
  const url = new URL(value);
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    !url.pathname.endsWith("/") ||
    url.href !== value
  ) {
    throw new TypeError(`${name} must be a normalized directory URL.`);
  }
}

function assertSafeExternalUrl(value, name) {
  assertHttpsUrl(value, name);
  const url = new URL(value);
  if (url.username !== "" || url.password !== "") throw new TypeError(`${name} must not contain credentials.`);
}

function assertHttpsUrl(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be an HTTPS URL.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${name} must be an HTTPS URL.`);
  }
  if (url.protocol !== "https:") throw new TypeError(`${name} must be an HTTPS URL.`);
}

function assertArtifactPath(value, name) {
  if (typeof value !== "string" || !artifactPathPattern.test(value)) {
    throw new TypeError(`${name} must be a safe relative artifact path.`);
  }
}

function assertDirectoryPath(value, name) {
  if (typeof value !== "string" || !directoryPathPattern.test(value)) {
    throw new TypeError(`${name} must be a normalized absolute directory path.`);
  }
}

function assertPublicPath(value, name) {
  if (typeof value !== "string" || !publicPathPattern.test(value)) {
    throw new TypeError(`${name} must be a normalized absolute public path.`);
  }
}

function assertColor(value, name) {
  if (typeof value !== "string" || !/^#[\dA-Fa-f]{6}$/u.test(value)) {
    throw new TypeError(`${name} must be a six-digit hexadecimal color.`);
  }
}

function assertNonEmptyText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty text.`);
  }
}

function assertPositiveNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number.`);
  }
}

function assertUnique(values, name) {
  if (new Set(values).size !== values.length) throw new TypeError(`${name} must be unique.`);
}

function assertRecord(value, name) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
}

function assertExactKeys(value, expectedKeys, name) {
  const actualKeys = sortOrdinal(Object.keys(value));
  const sortedExpectedKeys = sortOrdinal(expectedKeys);
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new TypeError(`${name} has missing or unknown properties.`);
  }
}

function assertEqual(actual, expected, name) {
  if (actual !== expected) throw new TypeError(`${name} must be ${JSON.stringify(expected)}.`);
}

function unique(values) {
  return [...new Set(values)];
}

function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
