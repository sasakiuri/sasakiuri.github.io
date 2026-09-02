import { ExternalLink } from "@/components/external-link/external-link";
import { siteConfig } from "@/config/site";

export function HomePage() {
  const { hero, pageHeading, socials } = siteConfig;
  const workProfiles = socials.filter((social) => social.label === "GitHub");
  const socialProfiles = socials.filter((social) => social.label !== "GitHub");

  return (
    <main>
      <header>
        <h1>{pageHeading}</h1>
        <p>
          <ExternalLink href={hero.sourceUrl}>
            {/* biome-ignore lint/performance/noImgElement: A plain image preserves the requested browser-default rendering. */}
            <img alt={hero.image.alt} height={hero.image.height} src={hero.image.src} width={hero.image.width} />
          </ExternalLink>
        </p>
        <p>
          <ruby className="hero-label">
            {hero.label}
            <rp>（</rp>
            <rt>{hero.annotation}</rt>
            <rp>）</rp>
          </ruby>
        </p>
      </header>

      <hr />

      <section aria-labelledby="writing-heading">
        <h2 id="writing-heading">文章</h2>
        <p>
          <a href="/sasakuri/diary/">日記</a>
        </p>
      </section>

      <hr />

      <section aria-labelledby="works-heading">
        <h2 id="works-heading">作ったもの</h2>
        {workProfiles.map((profile) => (
          <p key={profile.href}>
            <ExternalLink href={profile.href}>{profile.label}</ExternalLink>
          </p>
        ))}
      </section>

      <hr />

      <nav aria-labelledby="socials-heading" className="social-links">
        <h2 id="socials-heading">SNS</h2>
        <ul>
          {socialProfiles.map((social) => (
            <li key={social.href}>
              <ExternalLink href={social.href}>{social.label}</ExternalLink>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
