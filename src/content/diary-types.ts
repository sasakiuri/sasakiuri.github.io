export interface DiarySearchPost {
  readonly id: string;
  readonly publishedAt: string;
  readonly text: string;
}

export interface DiarySearchIndex {
  readonly posts: readonly DiarySearchPost[];
  readonly version: 1;
}
