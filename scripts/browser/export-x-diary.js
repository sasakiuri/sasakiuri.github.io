// Run this file as a DevTools Snippet on https://x.com/sasakiuri/with_replies.
// It reads rendered posts only. It does not access cookies, storage, or network responses.
(() => {
  const username = "sasakiuri";
  const mediaOnlyText = "画像または動画を投稿しました。";
  const defaultOptions = Object.freeze({
    autoDownload: true,
    delayMs: 1_200,
    idleRounds: 15,
    maxRounds: 5_000,
  });
  const suppliedOptions = globalThis.__SASAKIURI_DIARY_EXPORTER_OPTIONS__;
  const options = Object.freeze({
    autoDownload: suppliedOptions?.autoDownload ?? defaultOptions.autoDownload,
    delayMs: boundedInteger(suppliedOptions?.delayMs, defaultOptions.delayMs, 10, 10_000),
    idleRounds: boundedInteger(suppliedOptions?.idleRounds, defaultOptions.idleRounds, 1, 100),
    maxRounds: boundedInteger(suppliedOptions?.maxRounds, defaultOptions.maxRounds, 1, 20_000),
  });

  const hostname = location.hostname.toLowerCase();
  const pathSegments = location.pathname.split("/").filter(Boolean);
  if (!["x.com", "www.x.com"].includes(hostname) || pathSegments[0]?.toLowerCase() !== username) {
    throw new TypeError(`Open https://x.com/${username}/with_replies before running the diary exporter.`);
  }

  const previousController = globalThis.__sasakiuriDiaryExporter;
  if (previousController?.running === true) {
    throw new TypeError("The diary exporter is already running in this tab.");
  }

  if (pathSegments[1] !== "with_replies") {
    report("warn", `Open /${username}/with_replies to include authored replies as well as regular posts.`);
  }

  const posts = new Map();
  const state = {
    error: undefined,
    payload: undefined,
    rounds: 0,
    running: true,
    stopped: false,
  };
  const controller = {
    collectNow: collectVisiblePosts,
    download() {
      if (state.payload === undefined) throw new TypeError("The export is not ready yet.");
      downloadPayload(state.payload);
      return state.payload.posts.length;
    },
    get payload() {
      return state.payload;
    },
    get running() {
      return state.running;
    },
    status() {
      return Object.freeze({
        count: posts.size,
        error: state.error,
        rounds: state.rounds,
        running: state.running,
        stopped: state.stopped,
      });
    },
    stop() {
      state.stopped = true;
    },
  };
  Object.defineProperty(globalThis, "__sasakiuriDiaryExporter", {
    configurable: true,
    value: controller,
  });

  report(
    "info",
    "Started. Keep this tab open. Run __sasakiuriDiaryExporter.status() for progress or .stop() to finish early.",
  );
  const done = run().catch((error) => {
    state.error = error instanceof Error ? error.message : String(error);
    state.running = false;
    report("error", error);
    return undefined;
  });
  Object.defineProperty(controller, "done", {
    enumerable: true,
    value: done,
  });

  async function run() {
    let idleRounds = 0;
    let previousCount = -1;

    for (let round = 1; round <= options.maxRounds && !state.stopped; round += 1) {
      state.rounds = round;
      collectVisiblePosts();

      const beforeHeight = document.documentElement.scrollHeight;
      const beforeY = scrollY;
      scrollBy(0, Math.max(480, Math.floor(innerHeight * 0.8)));
      await delay(options.delayMs);
      collectVisiblePosts();

      const afterHeight = document.documentElement.scrollHeight;
      const atBottom = innerHeight + scrollY >= afterHeight - 4;
      const didMove = Math.abs(scrollY - beforeY) > 1;
      const didGrow = posts.size > previousCount;
      const heightChanged = afterHeight !== beforeHeight;
      idleRounds = !didGrow && !didMove && !heightChanged && atBottom ? idleRounds + 1 : 0;
      previousCount = posts.size;

      if (round === 1 || round % 10 === 0) {
        report("info", `Collected ${posts.size} posts after ${round} scroll steps.`);
      }
      if (idleRounds >= options.idleRounds) break;
    }

    collectVisiblePosts();
    const payload = Object.freeze({
      exportedAt: new Date().toISOString(),
      posts: [...posts.values()].sort(comparePostIdsDescending),
      source: Object.freeze({ kind: "x-browser-dom-v1", username }),
      version: 1,
    });
    state.payload = payload;
    state.running = false;

    if (payload.posts.length === 0) {
      throw new TypeError("No authored posts were found. Check the selected X tab and try again.");
    }

    if (options.autoDownload) downloadPayload(payload);
    report(
      "info",
      `Finished with ${payload.posts.length} posts. If no file downloaded, run __sasakiuriDiaryExporter.download().`,
    );
    return payload;
  }

  function collectVisiblePosts() {
    const articles = new Set([
      ...document.querySelectorAll('article[data-testid="tweet"]'),
      ...document.querySelectorAll("[data-href] article"),
    ]);

    for (const article of articles) {
      if (article.parentElement?.closest("article")) continue;
      const status = primaryStatus(article);
      if (status?.username !== username) continue;

      const textNode = [...article.querySelectorAll('[data-testid="tweetText"], div[dir="auto"]')].find(
        (candidate) =>
          candidate.closest("article") === article &&
          (candidate.matches('[data-testid="tweetText"]') ||
            (candidate.classList.contains("whitespace-pre-wrap") && candidate.classList.contains("text-body"))),
      );
      const renderedText = textNode === undefined ? "" : normalizeText(readText(textNode));
      const text = renderedText || (containsPostMedia(article) ? mediaOnlyText : undefined);
      if (text === undefined) continue;
      const existing = posts.get(status.id);
      if (existing === undefined || text.length > existing.text.length) {
        posts.set(status.id, Object.freeze({ id: status.id, text }));
      }
    }

    return posts.size;
  }

  function containsPostMedia(article) {
    return [
      ...article.querySelectorAll('video, img[src], [data-testid="tweetPhoto"], [data-testid="videoPlayer"]'),
    ].some((candidate) => {
      if (candidate.closest("article") !== article) return false;
      if (candidate.matches('video, [data-testid="tweetPhoto"], [data-testid="videoPlayer"]')) return true;
      const source = candidate.getAttribute("src") ?? "";
      return /^https:\/\/pbs\.twimg\.com\/(?:amplify_video_thumb|media)\//u.test(source);
    });
  }

  function primaryStatus(article) {
    const time = article.querySelector("time[datetime]");
    const timeLink = time?.closest('a[href*="/status/"]');
    const containingLink = article.closest("[data-href]");
    const reference = timeLink?.getAttribute("href") ?? containingLink?.getAttribute("data-href");
    if (reference === null || reference === undefined) return undefined;

    const pathname = new URL(reference, location.origin).pathname;
    const match = /^\/(?<username>[A-Za-z\d_]{1,15})\/status\/(?<id>[1-9]\d{5,24})(?:\/|$)/u.exec(pathname);
    const id = match?.groups?.id;
    const matchedUsername = match?.groups?.username?.toLowerCase();
    return id === undefined || matchedUsername === undefined ? undefined : { id, username: matchedUsername };
  }

  function readText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
    if (!(node instanceof Element)) return "";
    if (node.tagName === "BR") return "\n";
    if (node.tagName === "IMG") return node.getAttribute("alt") ?? "";
    return [...node.childNodes].map(readText).join("");
  }

  function normalizeText(value) {
    return value
      .replaceAll("\u00a0", " ")
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n")
      .split("\n")
      .map((line) => line.replace(/[\t ]+$/u, ""))
      .join("\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
  }

  function comparePostIdsDescending(left, right) {
    const leftId = BigInt(left.id);
    const rightId = BigInt(right.id);
    return leftId > rightId ? -1 : leftId < rightId ? 1 : 0;
  }

  function downloadPayload(payload) {
    const body = `${JSON.stringify(payload, undefined, 2)}\n`;
    const objectUrl = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.download = `${username}-posts-${payload.exportedAt.slice(0, 10)}.json`;
    anchor.href = objectUrl;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }

  function boundedInteger(value, fallback, minimum, maximum) {
    return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function report(level, ...values) {
    // biome-ignore lint/suspicious/noConsole: Progress is intentionally reported in the DevTools console.
    console[level]("[sasakiuri diary]", ...values);
  }
})();
