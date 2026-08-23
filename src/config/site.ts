export type HttpsUrl = `https://${string}`;

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

export const siteConfig = {
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
