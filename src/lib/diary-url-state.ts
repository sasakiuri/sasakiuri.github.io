export const diaryPageSizes = [10, 25, 50, 100] as const;
const diarySortOrders = ["relevance", "newest", "oldest"] as const;

type DiaryPageSize = (typeof diaryPageSizes)[number];
export type DiarySortOrder = (typeof diarySortOrders)[number];

export interface DiaryUrlState {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly page: number;
  readonly pageSize: DiaryPageSize;
  readonly query: string;
  readonly sort: DiarySortOrder;
  readonly year: string;
}

export const defaultDiaryUrlState: DiaryUrlState = Object.freeze({
  dateFrom: "",
  dateTo: "",
  page: 1,
  pageSize: 50,
  query: "",
  sort: "relevance",
  year: "all",
});

export function parseDiaryUrlState(search: string, years: readonly string[]): DiaryUrlState {
  const parameters = new URLSearchParams(search);
  const query = (parameters.get("q") ?? "").slice(0, 100);
  const requestedYear = parameters.get("year") ?? "all";
  const requestedSort = parameters.get("sort") ?? "relevance";
  let dateFrom = validIsoDate(parameters.get("from"));
  let dateTo = validIsoDate(parameters.get("to"));
  const requestedPageSize = Number(parameters.get("size"));
  const requestedPage = Number(parameters.get("page"));

  if (dateFrom !== "" && dateTo !== "" && dateFrom > dateTo) {
    dateFrom = "";
    dateTo = "";
  }

  return {
    dateFrom,
    dateTo,
    page: positiveInteger(requestedPage) ? requestedPage : defaultDiaryUrlState.page,
    pageSize: isDiaryPageSize(requestedPageSize) ? requestedPageSize : defaultDiaryUrlState.pageSize,
    query,
    sort: isDiarySortOrder(requestedSort) ? requestedSort : defaultDiaryUrlState.sort,
    year: requestedYear === "all" || years.includes(requestedYear) ? requestedYear : defaultDiaryUrlState.year,
  };
}

export function serializeDiaryUrlState(state: DiaryUrlState): string {
  const parameters = new URLSearchParams();
  if (state.query !== "") parameters.set("q", state.query);
  if (state.year !== defaultDiaryUrlState.year) parameters.set("year", state.year);
  if (state.dateFrom !== "") parameters.set("from", state.dateFrom);
  if (state.dateTo !== "") parameters.set("to", state.dateTo);
  if (state.sort !== defaultDiaryUrlState.sort) parameters.set("sort", state.sort);
  if (state.pageSize !== defaultDiaryUrlState.pageSize) parameters.set("size", String(state.pageSize));
  if (state.page !== defaultDiaryUrlState.page) parameters.set("page", String(state.page));
  const serialized = parameters.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

function isDiaryPageSize(value: number): value is DiaryPageSize {
  return diaryPageSizes.some((pageSize) => pageSize === value);
}

function isDiarySortOrder(value: string): value is DiarySortOrder {
  return diarySortOrders.some((sort) => sort === value);
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10_000;
}

function validIsoDate(value: string | null): string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return "";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value ? "" : value;
}
