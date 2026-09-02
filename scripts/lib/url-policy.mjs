const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;

export function containsXUrl(text) {
  if (typeof text !== "string") {
    throw new TypeError("URL source must be a string.");
  }

  for (const match of text.matchAll(HTTP_URL_PATTERN)) {
    try {
      const candidate = new URL(match[0].replaceAll("&amp;", "&"));
      if (candidate.hostname === "x.com" || candidate.hostname.endsWith(".x.com")) {
        return true;
      }
    } catch {
      // Ignore text that resembles a URL but is not parseable as one.
    }
  }

  return false;
}
