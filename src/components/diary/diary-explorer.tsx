"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import type { DiarySearchPost } from "@/content/diary-types";
import { filterAndSortDiaryPosts, prepareDiarySearch, searchDiary, suggestDiaryQueries } from "@/lib/diary-search";
import { validateDiarySearchIndex } from "@/lib/diary-search-index";
import {
  defaultDiaryUrlState,
  diaryPageSizes,
  parseDiaryUrlState,
  serializeDiaryUrlState,
  type DiaryUrlState,
} from "@/lib/diary-url-state";

import { DiaryEntries } from "./diary-entries";

const searchIndexPath = "/sasakuri/diary/search-index.json";

type LoadState =
  | { readonly kind: "error" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly posts: readonly DiarySearchPost[] };

interface DiaryExplorerProps {
  readonly initialPosts: readonly DiarySearchPost[];
  readonly totalPosts: number;
  readonly years: readonly string[];
}

type HistoryMode = "push" | "replace";

export function DiaryExplorer({ initialPosts, totalPosts, years }: DiaryExplorerProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [urlReady, setUrlReady] = useState(false);
  const [view, setView] = useState<DiaryUrlState>(defaultDiaryUrlState);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const historyMode = useRef<HistoryMode>("replace");
  const searchInput = useRef<HTMLInputElement>(null);
  const suppressSuggestionFocus = useRef(false);
  const suggestionList = useRef<HTMLSelectElement>(null);
  const deferredQuery = useDeferredValue(view.query);

  useEffect(() => {
    const restoreUrl = () => {
      historyMode.current = "replace";
      setSuggestionsOpen(false);
      setView(parseDiaryUrlState(window.location.search, years));
    };

    restoreUrl();
    setUrlReady(true);
    window.addEventListener("popstate", restoreUrl);
    return () => window.removeEventListener("popstate", restoreUrl);
  }, [years]);

  useEffect(() => {
    if (!urlReady) return;
    const nextUrl = `${window.location.pathname}${serializeDiaryUrlState(view)}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history[historyMode.current === "push" ? "pushState" : "replaceState"](null, "", nextUrl);
    }
    historyMode.current = "replace";
  }, [urlReady, view]);

  useEffect(() => {
    let active = true;
    const requestPath = loadAttempt === 0 ? searchIndexPath : `${searchIndexPath}?retry=${loadAttempt}`;
    void loadSearchPosts(totalPosts, requestPath).then((nextState) => {
      if (active) setLoadState(nextState);
    });
    return () => {
      active = false;
    };
  }, [loadAttempt, totalPosts]);

  const allPosts = loadState.kind === "ready" ? loadState.posts : initialPosts;
  const records = useMemo(() => prepareDiarySearch(allPosts), [allPosts]);
  const searchedPosts = useMemo(() => searchDiary(records, deferredQuery), [deferredQuery, records]);
  const matchedPosts = useMemo(
    () =>
      filterAndSortDiaryPosts(searchedPosts, {
        dateFrom: view.dateFrom,
        dateTo: view.dateTo,
        sort: view.sort,
        year: view.year,
      }),
    [searchedPosts, view.dateFrom, view.dateTo, view.sort, view.year],
  );
  const candidateReady = readyQuery(loadState.kind, view.query, deferredQuery);
  const suggestions = candidateReady ? suggestDiaryQueries(matchedPosts, deferredQuery) : [];
  const hasSuggestions = suggestionsOpen && suggestions.length > 0;
  const pageCount = Math.max(1, Math.ceil(matchedPosts.length / view.pageSize));
  const page = Math.min(view.page, pageCount);
  const visiblePosts = matchedPosts.slice((page - 1) * view.pageSize, page * view.pageSize);
  const ready = loadState.kind === "ready" && urlReady;
  const hasViewConditions = serializeDiaryUrlState(view) !== "";
  const status = statusMessage(loadState.kind, view.query, deferredQuery, matchedPosts.length);

  useEffect(() => {
    if (!ready || view.page <= pageCount) return;
    historyMode.current = "replace";
    setView((current) => ({ ...current, page: pageCount }));
  }, [pageCount, ready, view.page]);

  function updateView(update: Partial<DiaryUrlState>, mode: HistoryMode) {
    historyMode.current = mode;
    setView((current) => ({ ...current, ...update }));
  }

  function selectSuggestion(suggestion: string) {
    if (suggestion === "") return;
    updateView({ page: 1, query: suggestion }, "push");
    setSuggestionsOpen(false);
    focusSearchWithoutSuggestions();
  }

  function focusSearchWithoutSuggestions() {
    suppressSuggestionFocus.current = true;
    searchInput.current?.focus();
    suppressSuggestionFocus.current = false;
  }

  function focusSuggestion(direction: "first" | "last") {
    const list = suggestionList.current;
    if (list === null) return;
    list.focus();
    list.selectedIndex = direction === "first" ? 1 : list.options.length - 1;
  }

  const pagination =
    ready && pageCount > 1 ? (
      <>
        <Pagination
          onPageChange={(nextPage) => updateView({ page: nextPage }, "push")}
          page={page}
          pageCount={pageCount}
          position="上"
        />
        <hr />
      </>
    ) : null;

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: A labelled form with a search role works in older browsers too. */}
      <form
        aria-label="日記の検索"
        onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
        role="search"
      >
        <div>
          <label htmlFor="diary-query">検索</label>
          <br />
          <input
            aria-autocomplete="list"
            aria-controls={hasSuggestions ? "diary-suggestions diary-results" : "diary-results"}
            autoComplete="off"
            disabled={!ready}
            id="diary-query"
            maxLength={100}
            onChange={(event) => {
              updateView({ page: 1, query: event.currentTarget.value }, "replace");
              setSuggestionsOpen(true);
            }}
            onBlur={(event) => {
              if (event.relatedTarget !== suggestionList.current) setSuggestionsOpen(false);
            }}
            onFocus={() => {
              if (suppressSuggestionFocus.current) {
                suppressSuggestionFocus.current = false;
              } else if (view.query.trim() !== "") {
                setSuggestionsOpen(true);
              }
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setSuggestionsOpen(false);
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                focusSuggestion(event.key === "ArrowDown" ? "first" : "last");
              }
            }}
            ref={searchInput}
            size={30}
            type="search"
            value={view.query}
          />
          {hasSuggestions ? (
            <DiarySuggestions
              listRef={suggestionList}
              onClose={() => {
                setSuggestionsOpen(false);
                focusSearchWithoutSuggestions();
              }}
              onDismiss={() => setSuggestionsOpen(false)}
              onSelect={selectSuggestion}
              suggestions={suggestions}
            />
          ) : null}
        </div>
        <details>
          <summary>検索方法</summary>
          <ul>
            <li>完全一致: &quot;検索語&quot;</li>
            <li>除外: -検索語</li>
            <li>いずれかを含む: 検索語 OR 検索語</li>
          </ul>
        </details>
        <p>
          <label htmlFor="diary-year">年</label>{" "}
          <select
            disabled={!ready}
            id="diary-year"
            onChange={(event) => updateView({ page: 1, year: event.currentTarget.value }, "push")}
            value={view.year}
          >
            <option value="all">すべて</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}年
              </option>
            ))}
          </select>{" "}
          <label htmlFor="diary-sort">並び順</label>{" "}
          <select
            disabled={!ready}
            id="diary-sort"
            onChange={(event) =>
              updateView({ page: 1, sort: event.currentTarget.value as DiaryUrlState["sort"] }, "push")
            }
            value={view.sort}
          >
            <option value="relevance">関連順</option>
            <option value="newest">新しい順</option>
            <option value="oldest">古い順</option>
          </select>
        </p>
        <p>
          <label htmlFor="diary-date-from">開始</label>{" "}
          <input
            disabled={!ready}
            id="diary-date-from"
            max={view.dateTo === "" ? undefined : view.dateTo}
            onChange={(event) => updateView({ dateFrom: event.currentTarget.value, page: 1 }, "push")}
            type="date"
            value={view.dateFrom}
          />
          <wbr /> <label htmlFor="diary-date-to">終了</label>{" "}
          <input
            disabled={!ready}
            id="diary-date-to"
            min={view.dateFrom === "" ? undefined : view.dateFrom}
            onChange={(event) => updateView({ dateTo: event.currentTarget.value, page: 1 }, "push")}
            type="date"
            value={view.dateTo}
          />
        </p>
        <p>
          <label htmlFor="diary-page-size">表示件数</label>{" "}
          <select
            disabled={!ready}
            id="diary-page-size"
            onChange={(event) =>
              updateView({ page: 1, pageSize: Number(event.currentTarget.value) as DiaryUrlState["pageSize"] }, "push")
            }
            value={view.pageSize}
          >
            {diaryPageSizes.map((size) => (
              <option key={size} value={size}>
                {size}件
              </option>
            ))}
          </select>
        </p>
        <p>
          <button
            disabled={!ready || !hasViewConditions}
            onClick={() => {
              updateView(defaultDiaryUrlState, "push");
              setSuggestionsOpen(false);
              focusSearchWithoutSuggestions();
            }}
            type="button"
          >
            検索条件を解除
          </button>
        </p>
      </form>

      <p aria-live="polite" id="diary-search-status" role="status">
        {status}
      </p>
      {loadState.kind === "error" ? (
        <p>
          <button
            onClick={() => {
              setLoadState({ kind: "loading" });
              setLoadAttempt((current) => current + 1);
            }}
            type="button"
          >
            検索データを再読み込み
          </button>
        </p>
      ) : null}
      <noscript>
        <p>検索機能にはJavaScriptが必要です。年別の日記はそのまま読めます。</p>
      </noscript>

      <hr />

      {pagination}
      <div aria-busy={loadState.kind === "loading" || view.query !== deferredQuery}>
        <DiaryEntries highlightQuery={deferredQuery} label="検索結果" posts={visiblePosts} />
      </div>
      {ready && pageCount > 1 ? (
        <>
          <hr />
          <Pagination
            onPageChange={(nextPage) => updateView({ page: nextPage }, "push")}
            page={page}
            pageCount={pageCount}
            position="下"
          />
        </>
      ) : null}
    </>
  );
}

interface DiarySuggestionsProps {
  readonly listRef: RefObject<HTMLSelectElement | null>;
  readonly onClose: () => void;
  readonly onDismiss: () => void;
  readonly onSelect: (suggestion: string) => void;
  readonly suggestions: readonly string[];
}

function DiarySuggestions({ listRef, onClose, onDismiss, onSelect, suggestions }: DiarySuggestionsProps) {
  return (
    <section aria-label="検索候補" id="diary-suggestions">
      <select
        aria-label="検索候補"
        onBlur={onDismiss}
        onChange={(event) => onSelect(event.currentTarget.value)}
        onKeyDown={(event: KeyboardEvent<HTMLSelectElement>) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          } else if (event.key === "Enter") {
            event.preventDefault();
            onSelect(event.currentTarget.value);
          }
        }}
        ref={listRef}
        size={Math.max(2, suggestions.length)}
        value=""
      >
        <option hidden value="" />
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion}>
            {suggestion}
          </option>
        ))}
      </select>
    </section>
  );
}

interface PaginationProps {
  readonly onPageChange: (page: number) => void;
  readonly page: number;
  readonly pageCount: number;
  readonly position: "上" | "下";
}

function Pagination({ onPageChange, page, pageCount, position }: PaginationProps) {
  const selectId = `diary-page-${position === "上" ? "top" : "bottom"}`;
  return (
    <nav aria-label={`検索結果のページ（${position}）`}>
      <button disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))} type="button">
        前へ
      </button>{" "}
      <label htmlFor={selectId}>ページ</label>{" "}
      <select id={selectId} onChange={(event) => onPageChange(Number(event.currentTarget.value))} value={page}>
        {Array.from({ length: pageCount }, (_value, index) => index + 1).map((pageNumber) => (
          <option key={pageNumber} value={pageNumber}>
            {pageNumber}
          </option>
        ))}
      </select>{" "}
      / {pageCount}{" "}
      <button disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))} type="button">
        次へ
      </button>
    </nav>
  );
}

async function loadSearchPosts(totalPosts: number, requestPath: string): Promise<LoadState> {
  try {
    const response = await fetch(requestPath, {
      cache: "no-cache",
      headers: { accept: "application/json" },
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || !contentType.includes("application/json")) throw new TypeError("Invalid search response.");
    const index = validateDiarySearchIndex(await response.json(), totalPosts);
    return { kind: "ready", posts: index.posts };
  } catch {
    return { kind: "error" };
  }
}

function statusMessage(kind: LoadState["kind"], query: string, deferredQuery: string, matches: number): string {
  if (kind === "loading") return "検索データを読み込んでいます。";
  if (kind === "error") return "検索データを読み込めませんでした。年別の日記は利用できます。";
  if (query !== deferredQuery) return "検索中です。";
  return deferredQuery.trim() === "" ? `${matches}件` : `${matches}件見つかりました。`;
}

function readyQuery(kind: LoadState["kind"], query: string, deferredQuery: string): boolean {
  return kind === "ready" && query === deferredQuery && deferredQuery.trim() !== "";
}
