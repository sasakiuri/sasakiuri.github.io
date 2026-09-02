import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomePage } from "./home-page";

describe("HomePage", () => {
  it("renders the heading and hero image", () => {
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
    expect(image).toHaveAttribute("height", "264");
    expect(image).toHaveAttribute("width", "300");

    expect(screen.getByText("ハクビシン", { selector: "ruby" })).toHaveTextContent("ハクビシン（アライグマ）");
    expect(screen.getAllByRole("separator")).toHaveLength(3);
    expect(screen.queryByRole("heading", { name: "自己紹介" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "文章" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "作ったもの" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "SNS" })).toBeInTheDocument();
  });

  it("organizes the diary, work, and social links by purpose", () => {
    render(<HomePage />);

    const writing = screen.getByRole("region", { name: "文章" });
    expect(within(writing).getByRole("link", { name: "日記" })).toHaveAttribute("href", "/sasakuri/diary/");
    expect(within(writing).queryByRole("article")).not.toBeInTheDocument();

    const works = screen.getByRole("region", { name: "作ったもの" });
    expect(within(works).getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/sasakiuri");

    const socials = screen.getByRole("navigation", { name: "SNS" });
    const list = within(socials).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(socials).queryByRole("link", { name: /日記/u })).not.toBeInTheDocument();
    expect(within(socials).getByRole("link", { name: "Twitter" })).toHaveAttribute(
      "href",
      "https://twitter.com/sasakiuri",
    );
    expect(within(socials).getByRole("link", { name: "Facebook" })).toHaveAttribute(
      "href",
      "https://www.facebook.com/nkajigaya1128",
    );
    expect(within(socials).queryByRole("link", { name: "GitHub" })).not.toBeInTheDocument();
  });
});
