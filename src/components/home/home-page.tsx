import Image from "next/image";

import { ExternalLink } from "@/components/external-link/external-link";
import { siteConfig } from "@/config/site";

import styles from "./home-page.module.css";

export function HomePage() {
  const { hero, pageHeading, socials } = siteConfig;

  return (
    <div className={styles.container}>
      <main>
        <h1 className="block text-2xl font-bold">{pageHeading}</h1>

        <ExternalLink className={styles.heroLink} href={hero.sourceUrl}>
          <Image
            alt={hero.image.alt}
            className="my2 h-auto max-w-sm"
            height={hero.image.height}
            preload
            src={hero.image.src}
            unoptimized
            width={hero.image.width}
          />
          <ruby className="my-2 block text-4xl font-bold italic">
            {hero.label}
            <rp>（</rp>
            <rt>{hero.annotation}</rt>
            <rp>）</rp>
          </ruby>
        </ExternalLink>

        <ul className="my-2">
          {socials.map((social) => (
            <li key={social.href}>
              <ExternalLink className={styles.socialLink} href={social.href}>
                {social.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
