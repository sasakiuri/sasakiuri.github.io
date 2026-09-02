import { Fragment } from "react";

import type { DiarySearchPost } from "@/content/diary-types";
import { diaryPostYear, extractDiaryHighlightTerms } from "@/lib/diary-search";

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  day: "numeric",
  month: "long",
  timeZone: "Asia/Tokyo",
  weekday: "short",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

interface DiaryEntriesProps {
  readonly highlightQuery?: string;
  readonly label: string;
  readonly posts: readonly DiarySearchPost[];
}

export function DiaryEntries({ highlightQuery = "", label, posts }: DiaryEntriesProps) {
  const highlightPatterns = createHighlightPatterns(highlightQuery);

  return (
    <section aria-label={label} id="diary-results">
      {posts.length === 0 ? (
        <p>該当する日記はありません。</p>
      ) : (
        posts.map((post, index) => {
          const publishedAt = new Date(post.publishedAt);
          const dateLabel = dateFormatter.format(publishedAt);
          const headingId = `entry-${post.id}`;
          return (
            <Fragment key={post.id}>
              <article aria-labelledby={headingId}>
                <h2 id={headingId}>
                  <a href={`/sasakuri/diary/${diaryPostYear(post)}/#${headingId}`}>
                    <time dateTime={post.publishedAt}>
                      {dateLabel} {timeFormatter.format(publishedAt)}
                    </time>
                  </a>
                </h2>
                <p>
                  <TextWithLineBreaks highlightPatterns={highlightPatterns} text={post.text} />
                </p>
              </article>
              {index < posts.length - 1 ? <hr /> : null}
            </Fragment>
          );
        })
      )}
    </section>
  );
}

interface TextWithLineBreaksProps {
  readonly highlightPatterns: HighlightPatterns | undefined;
  readonly text: string;
}

function TextWithLineBreaks({ highlightPatterns, text }: TextWithLineBreaksProps) {
  const lineBreak = text.indexOf("\n");
  if (lineBreak === -1) return <HighlightedText patterns={highlightPatterns} text={text} />;

  return (
    <>
      <HighlightedText patterns={highlightPatterns} text={text.slice(0, lineBreak)} />
      <br />
      <TextWithLineBreaks highlightPatterns={highlightPatterns} text={text.slice(lineBreak + 1)} />
    </>
  );
}

interface HighlightPatterns {
  readonly exact: RegExp;
  readonly split: RegExp;
}

interface HighlightedTextProps {
  readonly patterns: HighlightPatterns | undefined;
  readonly text: string;
}

function HighlightedText({ patterns, text }: HighlightedTextProps) {
  if (patterns === undefined) return text;
  let offset = 0;
  return text.split(patterns.split).map((part) => {
    const key = `${offset}-${part}`;
    offset += part.length;
    return patterns.exact.test(part) ? <mark key={key}>{part}</mark> : <Fragment key={key}>{part}</Fragment>;
  });
}

function createHighlightPatterns(query: string): HighlightPatterns | undefined {
  const terms = [...extractDiaryHighlightTerms(query)];
  if (terms.length === 0) return undefined;
  const expression = terms
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|");
  return {
    exact: new RegExp(`^(?:${expression})$`, "iu"),
    split: new RegExp(`(${expression})`, "giu"),
  };
}
