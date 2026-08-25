import { siteConfig } from "@/config/site";

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function StructuredData() {
  const profilePage = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    description: siteConfig.description,
    inLanguage: siteConfig.language,
    mainEntity: {
      "@id": `${siteConfig.url}/#person`,
      "@type": "Person",
      name: siteConfig.name,
      sameAs: siteConfig.socials.map(({ href }) => href),
      url: siteConfig.url,
    },
    name: siteConfig.title,
    url: siteConfig.url,
  } as const;
  const serialized = serializeStructuredData(profilePage);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON comes from strict local configuration and escapes HTML delimiters.
  return <script dangerouslySetInnerHTML={{ __html: serialized }} type="application/ld+json" />;
}
