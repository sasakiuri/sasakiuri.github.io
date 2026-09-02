import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "./home-page";

describe("HomePage", () => {
  it("renders the original heading and hero content", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "ホームページ",
      }),
    ).toBeInTheDocument();

    const image = screen.getByRole("img", {
      name: "ハクビシン",
    });

    expect(image).toHaveAttribute("src", "/sasakiuri/ea98a6f9-e9a6-43ea-a6e3-464656155004.webp");
    expect(image).toHaveAttribute("height", "337.438");
    expect(image).toHaveAttribute("width", "384");

    expect(screen.getByText("ハクビシン", { selector: "ruby" })).toHaveTextContent("ハクビシン（アライグマ）");
  });

  it("renders every configured social link securely", () => {
    render(<HomePage />);

    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByRole("link", { name: "Twitter" })).toHaveAttribute(
      "href",
      "https://twitter.com/sasakiuri",
    );
    expect(within(list).getByRole("link", { name: "Facebook" })).toHaveAttribute(
      "href",
      "https://www.facebook.com/nkajigaya1128",
    );
    expect(within(list).getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/sasakiuri");
  });
});
