import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiarySearchIndex, DiarySearchPost } from "@/content/diary-types";

import { DiaryExplorer } from "./diary-explorer";

const posts = makePosts(55);
const index: DiarySearchIndex = { posts, version: 1 };
const years = ["2026", "2025"];

describe("DiaryExplorer", () => {
  it("loads all posts, searches incrementally, and provides selectable pagination", async () => {
    const fetchMock = vi.fn().mockResolvedValue(searchResponse(index));
    vi.stubGlobal("fetch", fetchMock);
    render(<DiaryExplorer initialPosts={posts.slice(0, 2)} totalPosts={posts.length} years={years} />);

    const searchbox = screen.getByRole("searchbox", { name: "検索" });
    expect(searchbox).toBeDisabled();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("検索データを読み込んでいます。");

    await waitFor(() => expect(searchbox).toBeEnabled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/sasakuri/diary/search-index.json",
      expect.objectContaining({ cache: "no-cache", headers: { accept: "application/json" } }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("55件");
    expect(screen.getAllByRole("article")).toHaveLength(50);
    expect(screen.queryByText("空白で複数語を絞り込めます。多少の入力違いにも一致します。")).not.toBeInTheDocument();
    expect(screen.getByText("検索方法")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
    fireEvent.focus(searchbox);

    const reset = screen.getByRole("button", { name: "検索条件を解除" });
    const dateFrom = screen.getByLabelText("開始");
    const dateTo = screen.getByLabelText("終了");
    expect(reset).toBeDisabled();
    expect(dateFrom).not.toHaveAttribute("max");
    expect(dateTo).not.toHaveAttribute("min");
    fireEvent.change(dateFrom, { target: { value: "2026-08-20" } });
    expect(screen.getByRole("status")).toHaveTextContent("9件");
    fireEvent.change(dateTo, { target: { value: "2026-08-25" } });
    expect(screen.getByRole("status")).toHaveTextContent("6件");
    expect(dateFrom).toHaveAttribute("max", "2026-08-25");
    expect(dateTo).toHaveAttribute("min", "2026-08-20");
    expect(window.location.search).toBe("?from=2026-08-20&to=2026-08-25");
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(searchbox).toHaveFocus();
    expect(dateFrom).toHaveValue("");
    expect(dateTo).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("55件");
    expect(window.location.search).toBe("");
    expect(reset).toBeDisabled();

    const pageSize = screen.getByRole("combobox", { name: "表示件数" });
    fireEvent.change(pageSize, { target: { value: "10" } });
    expect(screen.getAllByRole("article")).toHaveLength(10);
    expect(window.location.search).toBe("?size=10");

    const year = screen.getByRole("combobox", { name: "年" });
    const sort = screen.getByRole("combobox", { name: "並び順" });
    expect(within(year).getAllByRole("option")).toHaveLength(3);
    expect(within(sort).getAllByRole("option")).toHaveLength(3);
    fireEvent.change(year, { target: { value: "2025" } });
    expect(screen.getByRole("status")).toHaveTextContent("0件");
    expect(window.location.search).toBe("?year=2025&size=10");
    fireEvent.change(year, { target: { value: "all" } });
    fireEvent.change(sort, { target: { value: "oldest" } });
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("日記 54");
    expect(window.location.search).toBe("?sort=oldest&size=10");
    fireEvent.change(sort, { target: { value: "relevance" } });

    let topNavigation = screen.getByRole("navigation", { name: "検索結果のページ（上）" });
    expect(within(topNavigation).getByRole("button", { name: "前へ" })).toBeDisabled();
    fireEvent.click(within(topNavigation).getByRole("button", { name: "次へ" }));
    expect(within(topNavigation).getByRole("combobox", { name: "ページ" })).toHaveValue("2");
    expect(screen.getByText("日記 10")).toBeInTheDocument();

    fireEvent.click(within(topNavigation).getByRole("button", { name: "前へ" }));
    expect(within(topNavigation).getByRole("combobox", { name: "ページ" })).toHaveValue("1");
    fireEvent.change(within(topNavigation).getByRole("combobox", { name: "ページ" }), {
      target: { value: "6" },
    });
    topNavigation = screen.getByRole("navigation", { name: "検索結果のページ（上）" });
    expect(screen.getAllByRole("article")).toHaveLength(5);
    expect(within(topNavigation).getByRole("button", { name: "次へ" })).toBeDisabled();
    const bottomNavigation = screen.getByRole("navigation", { name: "検索結果のページ（下）" });
    fireEvent.click(within(bottomNavigation).getByRole("button", { name: "前へ" }));
    expect(within(topNavigation).getByRole("combobox", { name: "ページ" })).toHaveValue("5");

    fireEvent.change(searchbox, { target: { value: "日記" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("54件見つかりました。"));
    let suggestions = screen.getByRole("region", { name: "検索候補" });
    expect(within(suggestions).getByRole("listbox", { name: "検索候補" })).toHaveAttribute("size", "5");
    expect(within(suggestions).getAllByRole("option")).toHaveLength(5);
    expect(within(suggestions).queryByRole("button")).not.toBeInTheDocument();
    expect(within(suggestions).queryByRole("heading")).not.toBeInTheDocument();
    expect(searchbox.nextElementSibling).toBe(suggestions);

    let suggestionList = within(suggestions).getByRole("listbox", {
      name: "検索候補",
    }) as HTMLSelectElement;
    fireEvent.blur(searchbox, { relatedTarget: suggestionList });
    expect(screen.getByRole("region", { name: "検索候補" })).toBeInTheDocument();
    fireEvent.blur(suggestionList);
    fireEvent.focus(searchbox);
    fireEvent.blur(searchbox, { relatedTarget: document.body });
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
    fireEvent.focus(searchbox);
    suggestions = screen.getByRole("region", { name: "検索候補" });
    fireEvent.keyDown(searchbox, { key: "x" });
    fireEvent.keyDown(searchbox, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
    fireEvent.focus(searchbox);
    suggestions = screen.getByRole("region", { name: "検索候補" });
    suggestionList = within(suggestions).getByRole("listbox", { name: "検索候補" }) as HTMLSelectElement;
    fireEvent.keyDown(searchbox, { key: "ArrowDown" });
    expect(suggestionList).toHaveFocus();
    expect(suggestionList.selectedIndex).toBe(1);
    fireEvent.keyDown(suggestionList, { key: "x" });
    fireEvent.keyDown(suggestionList, { key: "Escape" });
    expect(searchbox).toHaveFocus();
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
    fireEvent.keyDown(searchbox, { key: "ArrowDown" });
    fireEvent.blur(searchbox);
    fireEvent.focus(searchbox);
    suggestions = screen.getByRole("region", { name: "検索候補" });
    suggestionList = within(suggestions).getByRole("listbox", { name: "検索候補" }) as HTMLSelectElement;
    fireEvent.keyDown(searchbox, { key: "ArrowUp" });
    expect(suggestionList.selectedIndex).toBe(suggestionList.options.length - 1);
    fireEvent.keyDown(suggestionList, { key: "Enter", target: { value: "" } });
    expect(screen.getByRole("region", { name: "検索候補" })).toBeInTheDocument();
    const keyboardSuggestion = suggestionList.options[1]?.value;
    if (keyboardSuggestion === undefined) throw new TypeError("A keyboard suggestion is required.");
    fireEvent.keyDown(suggestionList, { key: "Enter", target: { value: keyboardSuggestion } });
    expect(searchbox).toHaveValue(keyboardSuggestion);
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();

    fireEvent.change(searchbox, { target: { value: "タンプラー" } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1件見つかりました。"));
    suggestions = screen.getByRole("region", { name: "検索候補" });
    suggestionList = within(suggestions).getByRole("listbox", { name: "検索候補" }) as HTMLSelectElement;
    expect(within(suggestionList).getByRole("option", { name: "タンブラー" })).toBeInTheDocument();
    fireEvent.change(suggestionList, { target: { value: "タンブラー" } });
    expect(searchbox).toHaveValue("タンブラー");
    expect(searchbox).toHaveFocus();
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article")).toHaveTextContent("タンブラーを床にぶちまけた");
    expect(within(screen.getByRole("article")).getByText("タンブラー").tagName).toBe("MARK");
    expect(screen.queryByRole("navigation", { name: /検索結果のページ/u })).not.toBeInTheDocument();

    fireEvent.change(searchbox, { target: { value: '"タンブラー" OR "日記 54"' } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2件見つかりました。"));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
    expect(screen.getAllByText("タンブラー").some((node) => node.tagName === "MARK")).toBe(true);
    expect(screen.getAllByText("日記 54").some((node) => node.tagName === "MARK")).toBe(true);

    fireEvent.submit(screen.getByRole("search"));
    fireEvent.change(searchbox, { target: { value: "一致しない固有の検索語" } });
    await waitFor(() => expect(screen.getByText("該当する日記はありません。")).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
  });

  it("restores, bounds, and revisits a complete view from the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/sasakuri/diary/?year=2026&from=2026-07-01&to=2026-08-28&sort=oldest&size=10&page=999#diary-results",
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse(index)));
    render(<DiaryExplorer initialPosts={posts.slice(0, 2)} totalPosts={posts.length} years={years} />);

    await waitFor(() => expect(screen.getByRole("searchbox", { name: "検索" })).toBeEnabled());
    await waitFor(() =>
      expect(window.location.search).toBe("?year=2026&from=2026-07-01&to=2026-08-28&sort=oldest&size=10&page=6"),
    );
    expect(window.location.hash).toBe("#diary-results");
    expect(screen.getByRole("combobox", { name: "年" })).toHaveValue("2026");
    expect(screen.getByRole("combobox", { name: "並び順" })).toHaveValue("oldest");
    expect(screen.getByLabelText("開始")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("開始")).toHaveAttribute("max", "2026-08-28");
    expect(screen.getByLabelText("終了")).toHaveValue("2026-08-28");
    expect(screen.getByLabelText("終了")).toHaveAttribute("min", "2026-07-01");
    expect(screen.getAllByRole("article")).toHaveLength(5);

    window.history.pushState(
      null,
      "",
      "/sasakuri/diary/?q=%E6%97%A5%E8%A8%98&year=2026&sort=newest&size=25&page=2#diary-results",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => expect(screen.getByRole("searchbox", { name: "検索" })).toHaveValue("日記"));
    expect(screen.getByRole("combobox", { name: "並び順" })).toHaveValue("newest");
    expect(screen.getByRole("combobox", { name: "表示件数" })).toHaveValue("25");
    expect(screen.getByLabelText("開始")).toHaveValue("");
    expect(screen.getByLabelText("終了")).toHaveValue("");
    expect(
      within(screen.getByRole("navigation", { name: "検索結果のページ（上）" })).getByRole("combobox", {
        name: "ページ",
      }),
    ).toHaveValue("2");
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(screen.queryByRole("region", { name: "検索候補" })).not.toBeInTheDocument();
  });

  it.each([
    ["an HTTP failure", searchResponse(index, { ok: false })],
    ["a wrong content type", searchResponse(index, { contentType: "text/html" })],
    ["a missing content type", searchResponse(index, { contentType: null })],
  ])("retains the static fallback after %s", async (_label, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    render(<DiaryExplorer initialPosts={posts.slice(0, 2)} totalPosts={posts.length} years={years} />);

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "検索データを読み込めませんでした。年別の日記は利用できます。",
      ),
    );
    expect(screen.getByRole("searchbox", { name: "検索" })).toBeDisabled();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "検索データを再読み込み" })).toBeInTheDocument();
  });

  it("retries loading the full search index after a failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(searchResponse(index, { ok: false }))
      .mockResolvedValueOnce(searchResponse(index));
    vi.stubGlobal("fetch", fetchMock);
    render(<DiaryExplorer initialPosts={posts.slice(0, 2)} totalPosts={posts.length} years={years} />);

    const retry = await screen.findByRole("button", { name: "検索データを再読み込み" });
    fireEvent.click(retry);
    expect(screen.getByRole("status")).toHaveTextContent("検索データを読み込んでいます。");
    expect(screen.queryByRole("button", { name: "検索データを再読み込み" })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole("searchbox", { name: "検索" })).toBeEnabled());
    expect(screen.getByRole("status")).toHaveTextContent("55件");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/sasakuri/diary/search-index.json?retry=1",
      expect.objectContaining({ cache: "no-cache", headers: { accept: "application/json" } }),
    );
  });

  it("ignores a completed request after unmount", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const view = render(<DiaryExplorer initialPosts={posts.slice(0, 2)} totalPosts={posts.length} years={years} />);

    view.unmount();
    resolveResponse?.(searchResponse(index));
    await pending;
  });
});

beforeEach(() => window.history.replaceState(null, "", "/sasakuri/diary/"));

afterEach(() => {
  window.history.replaceState(null, "", "/sasakuri/diary/");
  vi.unstubAllGlobals();
});

function makePosts(count: number): readonly DiarySearchPost[] {
  const firstId = 2_093_251_072_781_590_942n;
  const firstDate = Date.parse("2026-08-28T08:15:21.132Z");
  return Array.from({ length: count }, (_value, index) => ({
    id: String(firstId - BigInt(index) * 1_000_000n),
    publishedAt: new Date(firstDate - index * 86_400_000).toISOString(),
    text: index === 0 ? "タンブラーを床にぶちまけた" : `日記 ${index}`,
  }));
}

function searchResponse(
  body: DiarySearchIndex,
  { contentType = "application/json", ok = true }: { contentType?: string | null; ok?: boolean } = {},
): Response {
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  return {
    headers,
    json: vi.fn().mockResolvedValue(body),
    ok,
  } as unknown as Response;
}
