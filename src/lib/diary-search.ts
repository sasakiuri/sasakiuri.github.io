import type { DiarySearchPost } from "@/content/diary-types";
import type { DiarySortOrder } from "@/lib/diary-url-state";

const searchDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Tokyo",
  year: "numeric",
});
const searchTimeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});
const searchDateKeyFormatter = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Tokyo",
  year: "numeric",
});
const suggestionSegmenter =
  typeof Intl.Segmenter === "function" ? new Intl.Segmenter("ja", { granularity: "word" }) : undefined;
const maximumSuggestionPosts = 50;
const maximumSuggestionRecords = 10_000;
const maximumSuggestionWords = 3;

export interface DiarySearchRecord {
  readonly normalizedText: string;
  readonly ordinal: number;
  readonly post: DiarySearchPost;
}

interface DiaryQueryTerm {
  readonly exact: boolean;
  readonly normalizedValue: string;
  readonly value: string;
}

interface ParsedDiaryQuery {
  readonly advanced: boolean;
  readonly exclusions: readonly DiaryQueryTerm[];
  readonly groups: readonly (readonly DiaryQueryTerm[])[];
}

export interface DiaryPostFilters {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly sort: DiarySortOrder;
  readonly year: string;
}

export function prepareDiarySearch(posts: readonly DiarySearchPost[]): readonly DiarySearchRecord[] {
  return posts.map((post, ordinal) => ({
    normalizedText: normalizeSearchText(
      `${post.text} ${searchDateFormatter.format(new Date(post.publishedAt))} ${searchTimeFormatter.format(
        new Date(post.publishedAt),
      )} ${post.publishedAt.slice(0, 10)}`,
    ),
    ordinal,
    post,
  }));
}

export function searchDiary(records: readonly DiarySearchRecord[], query: string): readonly DiarySearchPost[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === "") return records.map(({ post }) => post);

  const parsed = parseDiaryQuery(query);
  return records
    .flatMap((record) => {
      if (parsed.exclusions.some((term) => record.normalizedText.includes(term.normalizedValue))) return [];
      const scores =
        parsed.groups.length === 0
          ? [0]
          : parsed.groups.flatMap((group) => {
              const score = scoreSearchGroup(record.normalizedText, group);
              return score === undefined ? [] : [score];
            });
      if (scores.length === 0) return [];
      const score = Math.max(...scores);
      return [{ ordinal: record.ordinal, post: record.post, score }];
    })
    .sort((left, right) => right.score - left.score || left.ordinal - right.ordinal)
    .map(({ post }) => post);
}

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/gu, " ").trim();
}

export function filterAndSortDiaryPosts(
  posts: readonly DiarySearchPost[],
  { dateFrom, dateTo, sort, year }: DiaryPostFilters,
): readonly DiarySearchPost[] {
  const filtered = posts.filter((post) => {
    const date = diaryPostDate(post);
    return (
      (year === "all" || date.startsWith(year)) &&
      (dateFrom === "" || date >= dateFrom) &&
      (dateTo === "" || date <= dateTo)
    );
  });
  if (sort === "relevance") return filtered;

  return filtered.sort((left, right) => {
    const chronological = right.publishedAt.localeCompare(left.publishedAt);
    return sort === "newest" ? chronological : -chronological;
  });
}

export function diaryPostYear(post: DiarySearchPost): string {
  return diaryPostDate(post).slice(0, 4);
}

export function diaryPostDate(post: DiarySearchPost): string {
  const parts = searchDateKeyFormatter.formatToParts(new Date(post.publishedAt));
  const year = parts.find(({ type }) => type === "year")?.value;
  const month = parts.find(({ type }) => type === "month")?.value;
  const day = parts.find(({ type }) => type === "day")?.value;
  if (year === undefined || month === undefined || day === undefined) {
    throw new TypeError(`Unable to format diary date: ${post.publishedAt}`);
  }
  return `${year}-${month}-${day}`;
}

export function extractDiaryHighlightTerms(query: string): readonly string[] {
  const parsed = parseDiaryQuery(query);
  const seen = new Set<string>();
  return parsed.groups.flatMap((group) =>
    group.flatMap((term) => {
      if (seen.has(term.normalizedValue)) return [];
      seen.add(term.normalizedValue);
      return [term.value];
    }),
  );
}

export function suggestDiaryQueries(posts: readonly DiarySearchPost[], query: string, limit = 5): readonly string[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery === "" || limit < 1 || suggestionSegmenter === undefined) return [];
  if (parseDiaryQuery(query).advanced) return [];

  const queryTerms = normalizedQuery.split(" ");
  const targetTerm = queryTerms.at(-1) ?? "";
  const prefix = queryTerms.slice(0, -1).join(" ");
  const candidates = collectSuggestionCandidates(posts.slice(0, maximumSuggestionPosts));

  return [...candidates.values()]
    .flatMap((candidate) => {
      if (candidate.normalizedValue === targetTerm) return [];
      const termScore = scoreSuggestionTerm(candidate.normalizedValue, targetTerm);
      if (termScore === undefined) return [];
      const value = prefix === "" ? candidate.value : `${prefix} ${candidate.value}`;
      if (normalizeSearchText(value) === normalizedQuery) return [];
      return [
        {
          length: [...candidate.normalizedValue].length,
          ordinal: candidate.ordinal,
          score: termScore + Math.min(candidate.frequency, 20) * 10,
          value,
        },
      ];
    })
    .sort((left, right) => right.score - left.score || left.length - right.length || left.ordinal - right.ordinal)
    .slice(0, limit)
    .map(({ value }) => value);
}

function parseDiaryQuery(query: string): ParsedDiaryQuery {
  const groups: DiaryQueryTerm[][] = [];
  const exclusions: DiaryQueryTerm[] = [];
  let currentGroup: DiaryQueryTerm[] = [];
  let advanced = false;

  for (const match of query.matchAll(/(-?)"([^"]+)"|(\S+)/gu)) {
    const quoted = match[2];
    const token = match[3];
    if (quoted === undefined && token !== undefined && normalizeSearchText(token) === "or") {
      advanced = true;
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
        currentGroup = [];
      }
      continue;
    }

    const quotedExclusion = quoted !== undefined && match[1] === "-";
    const tokenExclusion = quoted === undefined && token !== undefined && token.startsWith("-") && token.length > 1;
    const value = quoted ?? (tokenExclusion ? token?.slice(1) : token) ?? "";
    const normalizedValue = normalizeSearchText(value);
    if (normalizedValue === "") continue;
    const term = { exact: quoted !== undefined, normalizedValue, value };
    if (quoted !== undefined || quotedExclusion || tokenExclusion) advanced = true;
    if (quotedExclusion || tokenExclusion) exclusions.push(term);
    else currentGroup.push(term);
  }

  if (currentGroup.length > 0) groups.push(currentGroup);
  return { advanced, exclusions, groups };
}

function scoreSearchGroup(text: string, terms: readonly DiaryQueryTerm[]): number | undefined {
  let score = 0;
  const phrase = terms.map(({ normalizedValue }) => normalizedValue).join(" ");
  const phraseIndex = text.indexOf(phrase);
  if (phraseIndex >= 0) score += 100_000 - Math.min(phraseIndex, 10_000);

  for (const term of terms) {
    if (term.exact) {
      const exactIndex = text.indexOf(term.normalizedValue);
      if (exactIndex < 0) return undefined;
      score += 20_000 - Math.min(exactIndex, 1_000);
    } else {
      const termScore = scoreSearchTerm(text, term.normalizedValue);
      if (termScore === undefined) return undefined;
      score += termScore;
    }
  }
  return score;
}

function scoreSuggestionTerm(candidate: string, term: string): number | undefined {
  if (candidate.startsWith(term)) return 10_000;
  if (/\d/u.test(term)) return undefined;

  const approximate = approximateSubstring(candidate, term);
  if (approximate !== undefined && approximate.start === 0) return 7_000 - approximate.distance * 1_000;

  const span = subsequenceSpan(candidate, term);
  if (span !== undefined && span.start === 0 && span.length <= [...term].length * 4) {
    return 4_000 - Math.min(span.length - [...term].length, 1_000);
  }
  return undefined;
}

interface SuggestionCandidate {
  readonly frequency: number;
  readonly normalizedValue: string;
  readonly ordinal: number;
  readonly value: string;
}

function collectSuggestionCandidates(posts: readonly DiarySearchPost[]): ReadonlyMap<string, SuggestionCandidate> {
  const candidates = new Map<string, SuggestionCandidate>();
  let ordinal = 0;

  for (const post of posts) {
    for (const value of extractSuggestionPhrases(post.text)) {
      const normalizedValue = normalizeSearchText(value);
      const existing = candidates.get(normalizedValue);
      if (existing !== undefined) {
        candidates.set(normalizedValue, { ...existing, frequency: existing.frequency + 1 });
      } else if (candidates.size < maximumSuggestionRecords) {
        candidates.set(normalizedValue, { frequency: 1, normalizedValue, ordinal, value });
        ordinal += 1;
      }
    }
  }
  return candidates;
}

function extractSuggestionPhrases(text: string): readonly string[] {
  if (suggestionSegmenter === undefined) return [];
  const phrases: string[] = [];

  for (const line of text.split(/\r?\n/gu)) {
    let run: { readonly end: number; readonly start: number }[] = [];
    for (const part of suggestionSegmenter.segment(line)) {
      if (part.isWordLike) {
        run.push({ end: part.index + part.segment.length, start: part.index });
      } else if (part.segment.trim() !== "") {
        appendSuggestionPhrases(line, run, phrases);
        run = [];
      }
    }
    appendSuggestionPhrases(line, run, phrases);
  }
  return phrases;
}

function appendSuggestionPhrases(
  line: string,
  words: readonly { readonly end: number; readonly start: number }[],
  phrases: string[],
) {
  for (let start = 0; start < words.length; start += 1) {
    for (let size = 1; size <= maximumSuggestionWords && start + size <= words.length; size += 1) {
      const first = words[start];
      const last = words[start + size - 1];
      if (first === undefined || last === undefined) continue;
      const phrase = line.slice(first.start, last.end).replace(/\s+/gu, " ").trim();
      const length = [...normalizeSearchText(phrase)].length;
      if (length >= 2 && length <= 30) phrases.push(phrase);
    }
  }
}

function scoreSearchTerm(text: string, term: string): number | undefined {
  const exactIndex = text.indexOf(term);
  if (exactIndex >= 0) return 10_000 - Math.min(exactIndex, 1_000);
  if (/\d/u.test(term)) return undefined;

  const approximate = approximateSubstring(text, term);
  if (approximate !== undefined) {
    return 7_000 - approximate.distance * 1_000 - Math.min(approximate.start, 500);
  }

  const span = subsequenceSpan(text, term);
  if (span !== undefined && span.length <= [...term].length * 4) {
    return 4_000 - Math.min(span.length - [...term].length, 1_000) - Math.min(span.start, 500);
  }
  return undefined;
}

function approximateSubstring(
  text: string,
  term: string,
): { readonly distance: number; readonly start: number } | undefined {
  const termCharacters = [...term];
  const maximumDistance = maximumEditDistance(termCharacters.length);
  if (maximumDistance === 0 || termCharacters.length > 32) return undefined;

  const textCharacters = [...text];
  let previous = Array.from({ length: textCharacters.length + 1 }, () => 0);
  for (let termIndex = 1; termIndex <= termCharacters.length; termIndex += 1) {
    const current = [termIndex];
    for (let textIndex = 1; textIndex <= textCharacters.length; textIndex += 1) {
      const substitutionCost = termCharacters[termIndex - 1] === textCharacters[textIndex - 1] ? 0 : 1;
      current.push(
        Math.min(
          (current[textIndex - 1] ?? termCharacters.length) + 1,
          (previous[textIndex] ?? termCharacters.length) + 1,
          (previous[textIndex - 1] ?? termCharacters.length) + substitutionCost,
        ),
      );
    }
    previous = current;
  }

  let distance = maximumDistance + 1;
  let end = 0;
  for (const [index, candidate] of previous.entries()) {
    if (candidate < distance) {
      distance = candidate;
      end = index;
    }
  }
  return distance <= maximumDistance ? { distance, start: Math.max(0, end - termCharacters.length) } : undefined;
}

function maximumEditDistance(length: number): number {
  if (length < 3) return 0;
  if (length <= 5) return 1;
  if (length <= 12) return 2;
  return 3;
}

function subsequenceSpan(text: string, term: string): { readonly length: number; readonly start: number } | undefined {
  const textCharacters = [...text];
  const termCharacters = [...term];
  let first = -1;
  let cursor = 0;

  for (const character of termCharacters) {
    const index = textCharacters.indexOf(character, cursor);
    if (index === -1) return undefined;
    if (first === -1) first = index;
    cursor = index + 1;
  }
  return { length: cursor - first, start: first };
}
