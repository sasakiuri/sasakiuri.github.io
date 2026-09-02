import { diaryArchivePath, type DiaryPost } from "@/content/diary-archive";
import { diaryAtomFeedPath } from "@/lib/diary-atom-feed";
import { diaryPostDate } from "@/lib/diary-search";
import { diaryJsonArchiveFilename, diaryTextArchiveFilename, diaryTextArchivePath } from "@/lib/diary-text-archive";
import { DiaryEntries } from "./diary-entries";
import { DiaryExplorer } from "./diary-explorer";

interface DiaryPageProps {
  readonly archiveYear?: string;
  readonly posts: readonly DiaryPost[];
  readonly totalPosts: number;
  readonly years: readonly string[];
}

export function DiaryPage({ archiveYear, posts, totalPosts, years }: DiaryPageProps) {
  const heading = archiveYear === undefined ? "日記" : `${archiveYear}年の日記`;
  const months = archiveYear === undefined ? [] : diaryMonthLinks(posts);

  return (
    <main id="page-top">
      <header>
        <nav aria-label="パンくずリスト">
          <a href="/sasakiuri/">ホームページ</a>
          {archiveYear === undefined ? null : (
            <>
              {" / "}
              <a href="/sasakuri/diary/">日記</a>
            </>
          )}
        </nav>

        <hr />

        <nav aria-label="ページ内移動">
          <a href="#diary-results">{archiveYear === undefined ? "検索結果へ移動" : "日記本文へ移動"}</a>
        </nav>

        <h1 id="diary-heading">{heading}</h1>
        <p>{totalPosts}件</p>
      </header>

      <hr />

      <nav aria-label="年別の日記">
        <ul>
          {years.map((year) => (
            <li key={year}>
              <a aria-current={year === archiveYear ? "page" : undefined} href={diaryArchivePath(year)}>
                {year}年
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <hr />

      <section aria-label="日記データ">
        <ul>
          <li>
            <a href={diaryAtomFeedPath} rel="alternate" type="application/atom+xml">
              Atomフィード
            </a>
          </li>
          <li>
            <a download={diaryTextArchiveFilename} href={diaryTextArchivePath}>
              テキスト版を保存
            </a>
          </li>
          <li>
            <a download={diaryJsonArchiveFilename} href="/sasakuri/diary/search-index.json">
              JSON版を保存
            </a>
          </li>
        </ul>
      </section>

      {archiveYear === undefined ? null : (
        <>
          <hr />
          <nav aria-labelledby="diary-months-heading">
            <h2 id="diary-months-heading">月別目次</h2>
            <ul>
              {months.map(({ entryId, key, label }) => (
                <li key={key}>
                  <a href={`#entry-${entryId}`}>{label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}

      <hr />

      {archiveYear === undefined ? (
        <DiaryExplorer
          initialPosts={posts.map(({ id, publishedAt, text }) => ({ id, publishedAt, text }))}
          totalPosts={totalPosts}
          years={years}
        />
      ) : (
        <DiaryEntries label={`${archiveYear}年の日記`} posts={posts} />
      )}

      <p>
        <a href="#page-top">ページ上部へ戻る</a>
      </p>
    </main>
  );
}

interface DiaryMonthLink {
  readonly entryId: string;
  readonly key: string;
  readonly label: string;
}

function diaryMonthLinks(posts: readonly DiaryPost[]): readonly DiaryMonthLink[] {
  const months = new Map<string, DiaryMonthLink>();
  for (const post of posts) {
    const key = diaryPostDate(post).slice(0, 7);
    if (!months.has(key)) {
      months.set(key, { entryId: post.id, key, label: `${Number(key.slice(5))}月` });
    }
  }
  return [...months.values()];
}
