import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DiarySearchPost } from "@/content/diary-types";

import { DiaryEntries } from "./diary-entries";

const post: DiarySearchPost = {
  id: "2093251072781590942",
  publishedAt: "2026-08-28T08:15:21.132Z",
  text: "A+Bを記録\nタンブラーとa+b",
};

describe("DiaryEntries", () => {
  it("highlights every exact query term and preserves line breaks", () => {
    render(<DiaryEntries highlightQuery="タンブラー A+B A+B" label="日記" posts={[post]} />);

    expect(screen.getAllByText(/^(?:A\+B|a\+b|タンブラー)$/u)).toHaveLength(3);
    expect(document.querySelectorAll("mark")).toHaveLength(3);
    expect(document.querySelectorAll("br")).toHaveLength(1);
    expect(within(screen.getByRole("article")).getByRole("link")).toHaveAttribute(
      "href",
      "/sasakuri/diary/2026/#entry-2093251072781590942",
    );
  });

  it("renders plain text when there is no query", () => {
    render(<DiaryEntries label="日記" posts={[post]} />);

    expect(document.querySelector("mark")).not.toBeInTheDocument();
    expect(screen.getByRole("article")).toHaveTextContent("A+Bを記録タンブラーとa+b");
  });

  it("does not highlight excluded terms or the OR operator", () => {
    render(<DiaryEntries highlightQuery='"タンブラー" OR 記録 -A+B' label="日記" posts={[post]} />);

    expect(document.querySelectorAll("mark")).toHaveLength(2);
    expect(screen.getByText("タンブラー").tagName).toBe("MARK");
    expect(screen.getByText("記録").tagName).toBe("MARK");
  });
});
