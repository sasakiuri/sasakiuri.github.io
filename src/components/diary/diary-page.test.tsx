import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { diaryData } from "@/content/diary";

import { DiaryPage } from "./diary-page";

describe("DiaryPage", () => {
  it("renders a bounded latest page in reverse chronological order", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const posts = [diaryData.posts[0], diaryData.posts[4]].filter((post) => post !== undefined);
    render(<DiaryPage posts={posts} totalPosts={954} years={["2026", "2025"]} />);

    expect(screen.getByRole("heading", { level: 1, name: "日記" })).toBeInTheDocument();
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveTextContent("ひさしぶりに弾作ろうとしたらタンブラーの中身を全部床にぶちまけた");
    expect(articles[0]).toHaveTextContent("誰もお前を愛さない");
    expect(within(articles[0] as HTMLElement).getByRole("heading", { level: 2 })).toHaveTextContent(
      "2026年8月28日(金) 17:15",
    );
    expect(screen.getByText("954件")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "検索" })).toBeDisabled();
    expect(screen.getAllByRole("separator")).toHaveLength(6);
    expect(screen.queryByText("購読と保存")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "日記データ" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "年別の日記" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atomフィード" })).toHaveAttribute("href", "/sasakuri/diary/feed.xml");
    expect(screen.getByRole("link", { name: "検索結果へ移動" })).toHaveAttribute("href", "#diary-results");
    const main = screen.getByRole("main");
    const breadcrumb = screen.getByRole("navigation", { name: "パンくずリスト" });
    const pageNavigation = screen.getByRole("navigation", { name: "ページ内移動" });
    expect(breadcrumb.compareDocumentPosition(pageNavigation) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(breadcrumb.nextElementSibling).toHaveRole("separator");
    expect(breadcrumb.nextElementSibling?.nextElementSibling).toBe(pageNavigation);
    expect(main.firstElementChild).toContainElement(breadcrumb);
    expect(screen.getByRole("link", { name: "ページ上部へ戻る" })).toHaveAttribute("href", "#page-top");
    expect(screen.getByRole("link", { name: "テキスト版を保存" })).toHaveAttribute("download", "sasakiuri-diary.txt");
    expect(screen.getByRole("link", { name: "テキスト版を保存" })).toHaveAttribute(
      "href",
      "/sasakuri/diary/archive.txt",
    );
    expect(screen.getByRole("link", { name: "JSON版を保存" })).toHaveAttribute("download", "sasakiuri-diary.json");
  });

  it("marks the selected archive and keeps it free of X links", () => {
    const decemberPosts = diaryData.posts.filter(({ publishedAt }) => publishedAt.startsWith("2025-12")).slice(0, 2);
    const novemberPost = diaryData.posts.find(({ publishedAt }) => publishedAt.startsWith("2025-11"));
    if (decemberPosts.length !== 2 || novemberPost === undefined) {
      throw new TypeError("The diary fixture must contain multiple December and one November 2025 post.");
    }
    const posts = [...decemberPosts, novemberPost];
    render(<DiaryPage archiveYear="2025" posts={posts} totalPosts={posts.length} years={["2026", "2025"]} />);

    expect(screen.getByRole("heading", { level: 1, name: "2025年の日記" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2025年" })).toHaveAttribute("aria-current", "page");
    const monthNavigation = screen.getByRole("navigation", { name: "月別目次" });
    expect(within(monthNavigation).getAllByRole("link")).toHaveLength(2);
    expect(within(monthNavigation).getByRole("link", { name: "12月" })).toHaveAttribute(
      "href",
      `#entry-${decemberPosts[0]?.id}`,
    );
    expect(within(monthNavigation).getByRole("link", { name: "11月" })).toHaveAttribute(
      "href",
      `#entry-${novemberPost.id}`,
    );
    expect(screen.getByRole("link", { name: "日記本文へ移動" })).toHaveAttribute("href", "#diary-results");
    expect(screen.queryByRole("link", { name: /X/u })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ホームページ" })).toHaveAttribute("href", "/sasakiuri/");
    expect(screen.getByRole("link", { name: "日記" })).toHaveAttribute("href", "/sasakuri/diary/");
    expect(within(screen.getAllByRole("article")[0] as HTMLElement).getByRole("link")).toHaveAttribute(
      "href",
      `/sasakuri/diary/2025/#entry-${decemberPosts[0]?.id}`,
    );
  });
});

afterEach(() => vi.unstubAllGlobals());
