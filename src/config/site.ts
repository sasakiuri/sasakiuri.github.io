import * as z from "zod";

import { httpsUrlSchema, type HttpsUrl } from "./https-url-schema";

export const siteConfigSchema = z.strictObject({
  description: z.string().min(1),
  hero: z.strictObject({
    annotation: z.string().min(1),
    image: z.strictObject({
      alt: z.string().min(1),
      height: z.number().positive(),
      src: z.string().regex(/^\/(?!\/).+$/),
      width: z.number().int().positive(),
    }),
    label: z.string().min(1),
    sourceUrl: httpsUrlSchema,
  }),
  language: z.literal("ja"),
  name: z.string().min(1),
  pageHeading: z.string().min(1),
  socials: z
    .array(
      z.strictObject({
        href: httpsUrlSchema,
        label: z.string().min(1),
      }),
    )
    .min(1),
  title: z.string().min(1),
  url: httpsUrlSchema,
});

interface SocialLink {
  readonly href: HttpsUrl;
  readonly label: string;
}

interface SiteConfig {
  readonly description: string;
  readonly hero: {
    readonly annotation: string;
    readonly image: {
      readonly alt: string;
      readonly height: number;
      readonly src: `/${string}`;
      readonly width: number;
    };
    readonly label: string;
    readonly sourceUrl: HttpsUrl;
  };
  readonly language: "ja";
  readonly name: string;
  readonly pageHeading: string;
  readonly socials: readonly SocialLink[];
  readonly title: string;
  readonly url: HttpsUrl;
}

const rawSiteConfig = {
  description: "ホームページです。",
  hero: {
    annotation: "アライグマ",
    image: {
      alt: "ハクビシン",
      height: 337.438,
      src: "/ea98a6f9-e9a6-43ea-a6e3-464656155004.webp",
      width: 384,
    },
    label: "ハクビシン",
    sourceUrl: "https://www.irasutoya.com/2014/12/blog-post_964.html",
  },
  language: "ja",
  name: "梶ヶ谷 宜之",
  pageHeading: "ホームページ",
  socials: [
    {
      href: "https://twitter.com/sasakiuri",
      label: "Twitter",
    },
    {
      href: "https://www.facebook.com/nkajigaya1128",
      label: "Facebook",
    },
  ],
  title: "梶ヶ谷 宜之 | ホームページ",
  url: "https://sasakiuri.github.io",
} as const satisfies SiteConfig;

export const siteConfig = siteConfigSchema.parse(rawSiteConfig) as SiteConfig;
