import * as z from "zod";

export type HttpsUrl = `https://${string}`;

const httpsUrlTemplateSchema = z.templateLiteral(["https://", z.string()]);

export const createHttpsUrlSchema = () => z.url().pipe(httpsUrlTemplateSchema);

export const canonicalDirectoryUrlSchema = createHttpsUrlSchema().refine(isCanonicalDirectoryUrl, {
  message: "Canonical URLs must be normalized HTTPS directory URLs without credentials, query, or fragment.",
});

export const httpsOriginSchema = createHttpsUrlSchema().refine((value) => new URL(value).origin === value, {
  message: "HTTPS origins must not contain credentials, a path, query, fragment, or default port.",
});

export const safeExternalHttpsUrlSchema = createHttpsUrlSchema().refine(
  (value) => {
    const url = new URL(value);
    return url.username === "" && url.password === "";
  },
  { message: "External HTTPS URLs must not contain credentials." },
);

function isCanonicalDirectoryUrl(value: HttpsUrl) {
  const url = new URL(value);
  return (
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.pathname.endsWith("/") &&
    url.href === value
  );
}
