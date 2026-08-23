import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config/site";

import { HomePage } from "./home-page";

describe("HomePage", () => {
  it("renders the original heading and hero content", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: siteConfig.pageHeading,
      }),
    ).toBeInTheDocument();

    const image = screen.getByRole("img", {
      name: siteConfig.hero.image.alt,
    });

    expect(image).toHaveAttribute("src", siteConfig.hero.image.src);
    expect(image).toHaveAttribute(
      "height",
      String(siteConfig.hero.image.height),
    );
    expect(image).toHaveAttribute("width", String(siteConfig.hero.image.width));

    expect(
      screen.getByText(siteConfig.hero.label, { selector: "ruby" }),
    ).toHaveTextContent(
      `${siteConfig.hero.label}（${siteConfig.hero.annotation}）`,
    );
  });

  it("renders every configured social link securely", () => {
    render(<HomePage />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(
      siteConfig.socials.length,
    );

    for (const social of siteConfig.socials) {
      expect(
        within(list).getByRole("link", { name: social.label }),
      ).toHaveAttribute("href", social.href);
    }
  });
});
