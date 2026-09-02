import * as z from "zod";

import rawSiteContract from "../../config/site-contract.json";

import { canonicalDirectoryUrlSchema, httpsOriginSchema, safeExternalHttpsUrlSchema } from "./https-url-schema";
import { artifactPathSchema, directoryPathSchema, publicPathSchema } from "./public-path-schema";

const nonEmptyTextSchema = z.string().trim().min(1);
const colorSchema = z.string().regex(/^#[\dA-Fa-f]{6}$/u);
const imageSchema = z
  .strictObject({
    alt: nonEmptyTextSchema,
    height: z.number().positive(),
    src: publicPathSchema,
    width: z.number().int().positive(),
  })
  .readonly();
const linkIconSchema = z
  .strictObject({
    sizes: nonEmptyTextSchema.optional(),
    src: publicPathSchema,
    type: nonEmptyTextSchema,
  })
  .readonly();
const socialLinkSchema = z
  .strictObject({
    href: safeExternalHttpsUrlSchema,
    label: nonEmptyTextSchema,
  })
  .readonly();

const rootRouteSchema = z
  .strictObject({
    artifactPath: artifactPathSchema,
    description: nonEmptyTextSchema,
    language: z.literal("en"),
    path: z.literal("/"),
    socialMetadata: z.literal(false),
    title: nonEmptyTextSchema,
    url: canonicalDirectoryUrlSchema,
  })
  .readonly();

const diaryRouteSchema = z
  .strictObject({
    artifactPath: z.literal("sasakuri/diary/index.html"),
    description: nonEmptyTextSchema,
    language: z.literal("ja"),
    path: z.literal("/sasakuri/diary/"),
    socialMetadata: z.literal(false),
    sourceUrl: safeExternalHttpsUrlSchema.refine((value) => value === "https://x.com/sasakiuri"),
    title: nonEmptyTextSchema,
    url: canonicalDirectoryUrlSchema,
  })
  .readonly();

export const siteConfigSchema = z
  .strictObject({
    appleTouchIcon: linkIconSchema,
    artifactPath: artifactPathSchema,
    description: nonEmptyTextSchema,
    favicon: linkIconSchema,
    hero: z
      .strictObject({
        annotation: nonEmptyTextSchema,
        image: imageSchema,
        label: nonEmptyTextSchema,
        sourceUrl: safeExternalHttpsUrlSchema,
      })
      .readonly(),
    language: z.literal("ja"),
    name: nonEmptyTextSchema,
    pageHeading: nonEmptyTextSchema,
    path: z.literal("/sasakiuri/"),
    socialImage: imageSchema,
    socialMetadata: z.literal(true),
    socials: z.array(socialLinkSchema).min(1).readonly(),
    title: nonEmptyTextSchema,
    url: canonicalDirectoryUrlSchema,
  })
  .readonly();

const manifestIconSchema = z
  .strictObject({
    purpose: z.enum(["any", "maskable"]),
    sizes: z.string().regex(/^[1-9]\d*x[1-9]\d*$/u),
    src: publicPathSchema,
    type: z.literal("image/png"),
  })
  .readonly();

const siteContractObjectSchema = z.strictObject({
  $schema: z.literal("./site-contract.schema.json"),
  discovery: z
    .strictObject({
      robotsArtifactPath: artifactPathSchema,
      sitemapArtifactPath: artifactPathSchema,
    })
    .readonly(),
  origin: httpsOriginSchema,
  pwa: z
    .strictObject({
      manifest: z
        .strictObject({
          backgroundColor: colorSchema,
          categories: z.array(nonEmptyTextSchema).min(1).readonly(),
          display: z.literal("standalone"),
          icons: z.array(manifestIconSchema).min(1).readonly(),
          orientation: z.literal("any"),
          publicPath: publicPathSchema,
          shortName: nonEmptyTextSchema,
          themeColor: colorSchema,
        })
        .readonly(),
      serviceWorker: z
        .strictObject({
          additionalPrecachePaths: z.array(publicPathSchema).readonly(),
          cachePrefix: z.string().regex(/^[a-z\d-]+-$/u),
          navigationFallback: directoryPathSchema,
          publicPath: publicPathSchema,
          scope: directoryPathSchema,
        })
        .readonly(),
    })
    .readonly(),
  routes: z
    .strictObject({
      diary: diaryRouteSchema,
      personal: siteConfigSchema,
      root: rootRouteSchema,
    })
    .readonly(),
  version: z.literal(1),
});

type SiteContractCandidate = z.output<typeof siteContractObjectSchema>;

const baseSiteContractSchema = siteContractObjectSchema.superRefine(validateRelationships).readonly();

export const siteContractSchema = baseSiteContractSchema;
export type SiteContract = z.output<typeof siteContractSchema>;
export type SiteConfig = z.output<typeof siteConfigSchema>;

export const siteContract: SiteContract = siteContractSchema.parse(rawSiteContract);
export const diaryConfig = siteContract.routes.diary;
export const siteConfig: SiteConfig = siteContract.routes.personal;

function validateRelationships(contract: SiteContractCandidate, context: z.RefinementCtx) {
  const { manifest, serviceWorker } = contract.pwa;
  const { diary, personal, root } = contract.routes;

  validateRoute(contract.origin, root, ["routes", "root"], context);
  validateRoute(contract.origin, personal, ["routes", "personal"], context);
  validateRoute(contract.origin, diary, ["routes", "diary"], context);

  if (personal.path !== serviceWorker.scope || personal.path !== serviceWorker.navigationFallback) {
    addRelationshipIssue(
      context,
      ["pwa", "serviceWorker"],
      "Service Worker scope and fallback must match the personal route.",
    );
  }
  if (manifest.shortName !== personal.name) {
    addRelationshipIssue(
      context,
      ["pwa", "manifest", "shortName"],
      "Manifest short name must match the personal name.",
    );
  }

  const scopedPaths = [
    personal.appleTouchIcon.src,
    personal.favicon.src,
    personal.hero.image.src,
    personal.socialImage.src,
    manifest.publicPath,
    serviceWorker.publicPath,
    ...manifest.icons.map(({ src }) => src),
    ...serviceWorker.additionalPrecachePaths,
  ];
  for (const [index, publicPath] of scopedPaths.entries()) {
    if (!publicPath.startsWith(personal.path)) {
      addRelationshipIssue(context, ["pwa"], `Personal asset ${index + 1} must stay inside ${personal.path}.`);
    }
  }

  validateUnique(
    personal.socials.map(({ href }) => href),
    ["routes", "personal", "socials"],
    "Social URLs",
    context,
  );
  validateUnique(
    personal.socials.map(({ label }) => label),
    ["routes", "personal", "socials"],
    "Social labels",
    context,
  );
  validateUnique(manifest.categories, ["pwa", "manifest", "categories"], "Manifest categories", context);
  validateUnique(
    manifest.icons.map(({ purpose }) => purpose),
    ["pwa", "manifest", "icons"],
    "Manifest icon purposes",
    context,
  );
  validateUnique(
    serviceWorker.additionalPrecachePaths,
    ["pwa", "serviceWorker", "additionalPrecachePaths"],
    "Additional precache paths",
    context,
  );

  if (contract.discovery.robotsArtifactPath !== "robots.txt") {
    addRelationshipIssue(context, ["discovery", "robotsArtifactPath"], "Robots output must remain robots.txt.");
  }
  if (contract.discovery.sitemapArtifactPath !== "sitemap.xml") {
    addRelationshipIssue(context, ["discovery", "sitemapArtifactPath"], "Sitemap output must remain sitemap.xml.");
  }
}

function validateRoute(
  origin: string,
  route: { readonly artifactPath: string; readonly path: "/" | `/${string}/`; readonly url: string },
  issuePath: PropertyKey[],
  context: z.RefinementCtx,
) {
  if (route.url !== new URL(route.path, `${origin}/`).href) {
    addRelationshipIssue(context, [...issuePath, "url"], "Canonical URL must equal origin plus route path.");
  }

  const expectedArtifactPath = route.path === "/" ? "index.html" : `${route.path.slice(1)}index.html`;
  if (route.artifactPath !== expectedArtifactPath) {
    addRelationshipIssue(
      context,
      [...issuePath, "artifactPath"],
      "Artifact path must be the trailing-slash route index.",
    );
  }
}

function validateUnique(values: readonly string[], issuePath: PropertyKey[], label: string, context: z.RefinementCtx) {
  if (new Set(values).size !== values.length) {
    addRelationshipIssue(context, issuePath, `${label} must be unique.`);
  }
}

function addRelationshipIssue(context: z.RefinementCtx, path: PropertyKey[], message: string) {
  context.addIssue({ code: "custom", message, path });
}
