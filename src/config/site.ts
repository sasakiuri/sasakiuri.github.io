import * as z from "zod";

import { httpsUrlSchema } from "./https-url-schema";

const nonEmptyTextSchema = z.string().trim().min(1);
const socialLinkSchema = z
  .strictObject({
    href: httpsUrlSchema,
    label: nonEmptyTextSchema,
  })
  .readonly();

export const siteConfigSchema = z
  .strictObject({
    description: nonEmptyTextSchema,
    hero: z
      .strictObject({
        annotation: nonEmptyTextSchema,
        image: z
          .strictObject({
            alt: nonEmptyTextSchema,
            height: z.number().positive(),
            src: z.string().regex(/^\/(?!\/).+$/),
            width: z.number().int().positive(),
          })
          .readonly(),
        label: nonEmptyTextSchema,
        sourceUrl: httpsUrlSchema,
      })
      .readonly(),
    language: z.literal("ja"),
    name: nonEmptyTextSchema,
    pageHeading: nonEmptyTextSchema,
    socials: z.array(socialLinkSchema).min(1).readonly(),
    title: nonEmptyTextSchema,
    url: httpsUrlSchema,
  })
  .readonly();

export type SiteConfig = z.output<typeof siteConfigSchema>;

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

export const siteConfig: SiteConfig = siteConfigSchema.parse(rawSiteConfig);
