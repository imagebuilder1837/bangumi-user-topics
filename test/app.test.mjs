import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { start } from "../src/entry.mjs";

const html = readFileSync(
  new URL("./fixtures/blog.html", import.meta.url),
  "utf8",
);
const tick = async () => {
  for (let i = 0; i < 6; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
};
const hit = (id, extras = {}) => ({
  id,
  kind: 0,
  parentID: 2,
  title: `Topic ${id}`,
  replyCount: 0,
  createdAt: 1697285544 - id,
  updatedAt: 1697285550,
  parentName: "站务论坛",
  ...extras,
});
const envelope = (rows, offset, limit) => ({
  data: rows,
  pagination: { total: 400, offset, limit, totalIsEstimate: true },
  meta: { executionMs: 1 },
});
function setup({
  url = "https://bgm.tv/user/sai/blog?mode=1",
  respond = (offset, limit) => envelope([], offset, limit),
  markup = html,
  fetchOverride,
  timers,
} = {}) {
  const dom = new JSDOM(markup, { url });
  const scrolls = [];
  dom.window.scrollTo = (...point) => scrolls.push(point);
  const requests = [];
  const fetch = async (input, init) => {
    const request = new URL(input);
    requests.push({ request, init });
    const result = await respond(
      Number(request.searchParams.get("offset")),
      Number(request.searchParams.get("limit")),
      request,
    );
    return { ok: true, json: async () => result };
  };
  start(dom.window, { fetch: fetchOverride || fetch, timers });
  return {
    window: dom.window,
    document: dom.window.document,
    requests,
    scrolls,
    dom,
  };
}
function enter(app) {
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
}

test("subject direct link and three exact category hashes use the subject endpoint", async () => {
  const app = setup({
    url: "https://bangumi.tv/user/sai/blog#posts/subject",
    respond: (offset, limit, url) =>
      envelope(
        offset === 0 && url.pathname.endsWith("subject-topics")
          ? [
              hit(7, {
                kind: 1,
                parentID: 307,
                parentName: "红猪",
                title: "讨论",
              }),
            ]
          : [],
        offset,
        limit,
      ),
  });
  await tick();
  assert.equal(app.requests[0].request.pathname, "/v1/search/subject-topics");
  assert.equal(
    app.document.querySelector(".entry-list a.l").href,
    "https://bangumi.tv/subject/topic/7",
  );
  assert.equal(
    app.document.querySelector(
      '.entry-list a[href="https://bangumi.tv/subject/307"]',
    ).textContent,
    "红猪",
  );
  assert.deepEqual(
    [...app.document.querySelectorAll(".navSubTabs a")]
      .filter((a) => a.hash.startsWith("#posts"))
      .map((a) => a.hash),
    ["#posts", "#posts/group", "#posts/subject"],
  );
  app.dom.window.close();
});

test("category heading and browser title follow the active topic category and restore on exit", async () => {
  const app = setup();
  app.document.title = "Sai🖖的日志";
  const heading = () =>
    app.document.querySelector("[data-user-topics-view] > h2.title")
      ?.textContent;
  app.window.location.hash = "#posts";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(heading(), "Sai🖖的帖子");
  assert.equal(app.document.title, "Sai🖖的帖子");
  for (const [hash, expected] of [
    ["#posts/group", "Sai🖖的小组话题"],
    ["#posts/subject", "Sai🖖的条目讨论"],
  ]) {
    app.window.location.hash = hash;
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.equal(heading(), expected);
    assert.equal(app.document.title, expected);
  }
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(app.document.title, "Sai🖖的日志");
  app.dom.window.close();
});

test("all merges skewed streams, shares cached prefixes and keeps category pages independent", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) =>
      envelope(
        offset >= 26
          ? []
          : Array.from({ length: Math.min(limit, 26 - offset) }, (_, i) => {
              const group = url.pathname.endsWith("group-topics");
              return hit(offset + i + 1, {
                kind: group ? 0 : 1,
                parentID: group ? 2 : 307,
                createdAt: group ? 2000 - offset - i : 1000 - offset - i,
              });
            }),
        offset,
        limit,
      ),
  });
  await tick();
  assert.deepEqual(
    [...app.document.querySelectorAll(".entry-list h2.title > a.l")].map(
      (a) => a.textContent,
    ),
    Array.from({ length: 10 }, (_, i) => `Topic ${i + 1}`),
  );
  assert.deepEqual(
    app.requests.map((x) => x.request.pathname),
    ["/v1/search/group-topics", "/v1/search/subject-topics"],
  );
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(
    app.document.querySelector(".entry-list a.l").href,
    "https://bgm.tv/group/topic/11",
  );
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.equal(
    app.document.querySelector(".entry-list a.l").href,
    "https://bgm.tv/subject/topic/1",
  );
  assert.equal(
    app.requests.filter((x) => x.request.pathname.endsWith("subject-topics"))
      .length,
    2,
  );
  app.window.location.hash = "#posts";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(
    app.document.querySelector(".entry-list a.l").href,
    "https://bgm.tv/group/topic/11",
  );
  app.dom.window.close();
});

test("late insertions stay excluded only from frozen category; raw offsets advance past duplicates", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) => {
      if (url.pathname.endsWith("subject-topics"))
        return envelope([], offset, limit);
      const rows =
        offset === 0
          ? Array.from({ length: 11 }, (_, i) =>
              hit(i + 1, { createdAt: 100 - i }),
            )
          : offset === 11
            ? [
                hit(99, { createdAt: 200 }),
                hit(11, { title: "changed", createdAt: 90 }),
                ...Array.from({ length: 9 }, (_, i) =>
                  hit(i + 12, { createdAt: 89 - i }),
                ),
              ]
            : [hit(21, { createdAt: 80 })];
      return envelope(rows.slice(0, limit), offset, limit);
    },
  });
  await tick();
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 11",
  );
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
  assert.deepEqual(
    app.requests
      .filter((x) => x.request.pathname.endsWith("group-topics"))
      .map((x) => x.request.searchParams.get("offset")),
    ["0", "11", "21", "22"],
  );
  app.window.location.hash = "#posts";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 99",
  );
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 11",
  );
  app.dom.window.close();
});

test("all does not present one stream as complete when the other fails; retry reuses success", async () => {
  let failed = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) => {
      if (url.pathname.endsWith("subject-topics") && failed)
        throw Error("subject unavailable");
      return envelope(
        Array.from({ length: limit }, (_, i) =>
          hit(offset + i + 1, {
            kind: url.pathname.endsWith("subject-topics") ? 1 : 0,
            createdAt: url.pathname.endsWith("subject-topics")
              ? 200 - offset - i
              : 100 - offset - i,
          }),
        ),
        offset,
        limit,
      );
    },
  });
  await tick();
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 0);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /subject unavailable/,
  );
  failed = false;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(
    app.requests.filter((x) => x.request.pathname.endsWith("group-topics"))
      .length,
    1,
  );
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
  app.dom.window.close();
});

test("same-time topics retain source order and kind-qualified identity", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) =>
      envelope(
        offset
          ? []
          : url.pathname.endsWith("group-topics")
            ? [hit(1, { createdAt: 100 }), hit(2, { createdAt: 100 })]
            : [hit(1, { kind: 1, createdAt: 100 })],
        offset,
        limit,
      ),
  });
  await tick();
  assert.deepEqual(
    [...app.document.querySelectorAll(".entry-list h2.title > a.l")].map(
      (a) => a.href,
    ),
    [
      "https://bgm.tv/group/topic/1",
      "https://bgm.tv/group/topic/2",
      "https://bgm.tv/subject/topic/1",
    ],
  );
  assert.equal(app.document.querySelector("[data-next]"), null);
  app.dom.window.close();
});

test("a reliable page at offset ceiling stays visible with an explicit search-limit warning", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      envelope(
        offset === 5000
          ? [hit(1)]
          : Array.from({ length: offset === 4991 ? 9 : limit }, (_, i) =>
              hit(offset + i + 1, { createdAt: 6000 - offset - i }),
            ),
        offset,
        limit,
      ),
  });
  await tick();
  for (let page = 2; page <= 500; page++) {
    app.document.querySelector("[data-next]").click();
    await tick();
    assert.equal(
      app.document.querySelector("[data-page]").textContent,
      String(page),
    );
  }
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /已达到服务检索上限，可能仍有更早的帖子/,
  );
  assert.ok(
    app.requests.every(
      ({ request }) => Number(request.searchParams.get("offset")) <= 5000,
    ),
  );
  app.dom.window.close();
});

test("inserts one entry after native blog and does not request on ordinary pages", async () => {
  const app = setup();
  start(app.window, {
    fetch: () => {
      throw Error("unexpected request");
    },
  });
  const link = app.document.querySelector("[data-user-topics-link]");
  assert.equal(
    link.previousElementSibling.querySelector("a").textContent,
    "日志",
  );
  assert.equal(
    app.document.querySelectorAll("[data-user-topics-link]").length,
    1,
  );
  assert.equal(app.requests.length, 0);
  app.dom.window.close();
});

test("direct hash opens a sibling view and restores host nodes on exit", async () => {
  const app = setup({
    url: "https://bangumi.tv/user/sai/blog?mode=1#posts/group",
  });
  const columns = app.document.querySelector(".columns");
  const input = columns.querySelector("input");
  const blog = app.document.querySelector('.navTabs a[href="/user/sai/blog"]');
  input.value = "preserve";
  await tick();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].request.searchParams.get("q"), "user:sai");
  assert.equal(app.requests[0].init.credentials, "omit");
  assert.equal(app.window.getComputedStyle(columns).display, "none");
  assert.equal(blog.classList.contains("focus"), false);
  assert.equal(columns.nextElementSibling.dataset.userTopicsView, "");
  assert.equal(
    app.document.querySelector("#footer").previousElementSibling.dataset
      .userTopicsView,
    "",
  );
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(app.document.querySelector(".columns"), columns);
  assert.equal(input.value, "preserve");
  assert.equal(columns.style.display, "");
  assert.equal(blog.classList.contains("focus"), true);
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  app.dom.window.close();
});

test("restores previous host focus only when another control has not taken it", async () => {
  const app = setup();
  const input = app.document.querySelector(".columns input");
  input.focus();
  enter(app);
  await tick();
  input.blur(); // Simulate browser blur when an ancestor is hidden.
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(app.document.activeElement, input);
  enter(app);
  await tick();
  const nav = app.document.querySelector('.navTabs a[href="/user/sai/index"]');
  nav.focus();
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(app.document.activeElement, nav);
  app.dom.window.close();
});

test("eleventh hit is cached for next page, with safe text, timestamp and correct parent link", async () => {
  const app = setup({
    respond: (offset, limit) =>
      envelope(
        Array.from({ length: limit }, (_, i) =>
          hit(
            offset + i + 1,
            i === 0 && offset === 0
              ? { title: "<img src=x onerror=alert(1)>", parentName: null }
              : {},
          ),
        ),
        offset,
        limit,
      ),
  });
  enter(app);
  await tick();
  assert.equal(app.requests[0].request.searchParams.get("limit"), "11");
  assert.equal(
    app.document.querySelectorAll("[data-user-topics-view] .entry-list .item")
      .length,
    10,
  );
  assert.equal(app.document.querySelector("[data-user-topics-view] img"), null);
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "<img src=x onerror=alert(1)>",
  );
  assert.equal(
    app.document.querySelector('.entry-list a[href="https://bgm.tv/group/2"]')
      .textContent,
    "小组话题",
  );
  assert.match(
    app.document.querySelector(".entry-list .time").textContent,
    /2023-10-14/,
  );
  const next = app.document.querySelector("[data-next]");
  assert.equal(next.textContent, "››");
  assert.equal(next.className, "p");
  assert.equal(next.getAttribute("aria-label"), "下一页");
  assert.equal(
    app.document.querySelector(
      "[data-user-topics-view] .page_inner a.p:not([data-next])",
    ),
    null,
  );
  next.click();
  await tick();
  const previous = app.document.querySelector(
    "[data-user-topics-view] .page_inner a.p:not([data-next])",
  );
  assert.equal(previous.textContent, "‹‹");
  assert.equal(previous.getAttribute("aria-label"), "上一页");
  assert.equal(app.requests[1].request.searchParams.get("offset"), "11");
  assert.equal(app.requests[1].request.searchParams.get("limit"), "10");
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 11",
  );
  app.dom.window.close();
});

test("reply count links to its topic, alongside left-grouped metadata", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      envelope(offset === 0 ? [hit(7, { replyCount: 57 })] : [], offset, limit),
  });
  await tick();
  const tools = app.document.querySelector(".entry-list .tools");
  const reply = tools.querySelector("a[href='https://bgm.tv/group/topic/7']");
  assert.equal(reply?.textContent, "57 回复");
  assert.equal(reply?.className, "l");
  assert.equal(tools.querySelectorAll("a").length, 2);
  assert.equal(tools.children.length, 1);
  assert.equal(tools.firstElementChild.className, "time");
  assert.match(tools.textContent, /^站务论坛 · .* · 57 回复$/);
  app.dom.window.close();
});

test("bad batch is an error rather than an empty page; explicit retry succeeds", async () => {
  let bad = true;
  const app = setup({
    respond: (offset, limit) =>
      bad
        ? {
            data: [{ ...hit(1), id: Number.MAX_SAFE_INTEGER + 1 }],
            pagination: { offset, limit, total: 1, totalIsEstimate: false },
            meta: { executionMs: 0 },
          }
        : envelope(
            Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
            offset,
            limit,
          ),
  });
  enter(app);
  await tick();
  assert.match(app.document.querySelector("[role=status]").textContent, /无效/);
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 0);
  assert.equal(app.requests.length, 1);
  bad = false;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
  app.dom.window.close();
});

test("a malformed meta on an empty response is an error, not an empty archive", async () => {
  let meta = "invalid";
  const app = setup({
    respond: (offset, limit) => ({
      ...envelope([], offset, limit),
      meta,
    }),
  });
  enter(app);
  await tick();
  assert.match(app.document.querySelector("[role=status]").textContent, /无效/);
  assert.equal(app.requests.length, 1);
  meta = { executionMs: 0 };
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /没有找到已收录的帖子/,
  );
  app.dom.window.close();
});

test("invalid SearchEncore diagnostic objects cannot turn an empty batch into an empty archive", async () => {
  for (const meta of [{}, { executionMs: -1 }, { executionMs: 1.5 }, []]) {
    const app = setup({
      respond: (offset, limit) => ({ ...envelope([], offset, limit), meta }),
    });
    enter(app);
    await tick();
    assert.match(
      app.document.querySelector("[role=status]").textContent,
      /无效/,
      JSON.stringify(meta),
    );
    app.dom.window.close();
  }
});

test("a failed lookahead preserves the reliable ten hits and retry fetches only one", async () => {
  let fail = true;
  const app = setup({
    respond: (offset, limit) => {
      if (offset === 10 && fail) throw Error("temporary failure");
      return envelope(
        Array.from({ length: offset ? limit : 10 }, (_, i) =>
          hit(offset + i + 1),
        ),
        offset,
        limit,
      );
    },
  });
  enter(app);
  await tick();
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /无法确认是否还有下一页：temporary failure/,
  );
  assert.equal(app.document.querySelector("[data-next]").textContent, "››");
  assert.equal(
    app.document.querySelector("[data-next]").getAttribute("aria-label"),
    "下一页（未确认）",
  );
  fail = false;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(app.requests.at(-1).request.searchParams.get("limit"), "1");
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
  app.dom.window.close();
});

test("a switched foreground stream starts before background continuation", async () => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("group-topics") && offset === 0
        ? new Promise((resolve) => {
            release = () => resolve(envelope([hit(1)], offset, limit));
          })
        : envelope([], offset, limit),
  });
  await tick();
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  release();
  await tick();
  assert.deepEqual(
    app.requests.slice(0, 2).map(({ request }) => request.pathname),
    ["/v1/search/group-topics", "/v1/search/subject-topics"],
  );
  app.dom.window.close();
});

test("timeout frees the stream even when fetch ignores abort", async () => {
  let expire;
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers: {
      setTimeout: (fn) => {
        expire = fn;
        return 1;
      },
      clearTimeout: () => {},
    },
    fetchOverride: async (input) => {
      calls++;
      if (calls === 1) return new Promise(() => {});
      const url = new URL(input);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 1);
  expire();
  await tick();
  assert.match(app.document.querySelector("[role=status]").textContent, /超时/);
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(calls, 2);
  app.dom.window.close();
});

test("an all-target failure stops further requests for that target while caching in-flight success", async () => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("group-topics")
        ? Promise.reject(Error("group failed"))
        : new Promise((resolve) => {
            release = () =>
              resolve(envelope([hit(1, { kind: 1 })], offset, limit));
          }),
  });
  await tick();
  release();
  await tick();
  assert.deepEqual(
    app.requests.map(({ request }) => request.pathname),
    ["/v1/search/group-topics", "/v1/search/subject-topics"],
  );
  app.dom.window.close();
});

test("Retry-After zero permits immediate explicit retry but never auto-resumes", async () => {
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers: { now: () => 1000 },
    fetchOverride: async (input) => {
      calls++;
      if (calls === 1)
        return { ok: false, status: 429, headers: { get: () => "0" } };
      const url = new URL(input);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 1);
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(calls, 2);
  app.dom.window.close();
});

test("429 pauses queued work until explicit retry after Retry-After", async () => {
  let now = 0;
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers: { now: () => now },
    fetchOverride: async (input) => {
      calls++;
      const url = new URL(input);
      if (calls === 1)
        return { ok: false, status: 429, headers: { get: () => "2" } };
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([hit(1)], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 1);
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(calls, 1);
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(calls, 1);
  now = 2000;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.ok(calls > 1);
  app.dom.window.close();
});

test("concurrent 429 responses keep the longest cooldown", async () => {
  let now = 0;
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    timers: { now: () => now },
    fetchOverride: async (input) => {
      calls++;
      const url = new URL(input);
      if (calls <= 2)
        return {
          ok: false,
          status: 429,
          headers: {
            get: () => (url.pathname.endsWith("group-topics") ? "10" : "3"),
          },
        };
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 2);
  now = 3000;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(calls, 2);
  now = 10000;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.ok(calls > 2);
  app.dom.window.close();
});

test("switching while a request is pending reuses its result without freezing an unseen page", async () => {
  let deliver;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("group-topics") && offset === 0
        ? new Promise((resolve) => {
            deliver = () => resolve(envelope([hit(1)], offset, limit));
          })
        : envelope([], offset, limit),
  });
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  deliver();
  await tick();
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    app.document.querySelector(".entry-list a.l")?.textContent,
    "Topic 1",
  );
  assert.equal(
    app.requests.filter(
      ({ request }) =>
        request.pathname.endsWith("group-topics") &&
        request.searchParams.get("offset") === "0",
    ).length,
    1,
  );
  app.dom.window.close();
});

test("background pagination commits on return without stealing scroll", async () => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      offset === 11
        ? new Promise((resolve) => {
            release = () =>
              resolve(
                envelope(
                  Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
                  offset,
                  limit,
                ),
              );
          })
        : envelope(
            Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
            offset,
            limit,
          ),
  });
  await tick();
  app.document.querySelector("[data-next]").click();
  await tick();
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  release();
  await tick();
  const before = app.scrolls.length;
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(app.scrolls.length, before);
  app.dom.window.close();
});

test("late response after exit never reopens host or steals a newer route", async () => {
  let deliver;
  const app = setup({
    respond: (offset, limit) =>
      offset
        ? envelope([], offset, limit)
        : new Promise((resolve) => {
            deliver = () => resolve(envelope([hit(1)], offset, limit));
          }),
  });
  const columns = app.document.querySelector(".columns");
  enter(app);
  await tick();
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  deliver();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(columns.style.display, "");
  assert.equal(app.window.location.hash, "#other");
  app.dom.window.close();
});

test("leaving and reentering a depleted target does not reset its budget", async () => {
  const app = setup({
    respond: (offset, limit) => envelope([hit(1)], offset, limit),
  });
  enter(app);
  await tick();
  assert.equal(app.requests.length, 3);
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  enter(app);
  await tick();
  assert.equal(app.requests.length, 3);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /无法确定/,
  );
  app.dom.window.close();
});

test("duplicate batches advance raw offsets and stop at three requests without declaring an empty archive", async () => {
  const app = setup({
    respond: (offset, limit) => envelope([hit(1)], offset, limit),
  });
  enter(app);
  await tick();
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "1", "2"],
  );
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 0);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /无法确定/,
  );
  app.dom.window.close();
});

test("entering and switching categories keep scroll position", async () => {
  const app = setup();
  const entry = app.document.querySelector("[data-user-topics-link] a");
  app.window.location.hash = "#posts";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(app.scrolls.length, 0);
  for (const hash of ["#posts/group", "#posts/subject", "#posts"]) {
    app.window.location.hash = hash;
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.equal(app.scrolls.length, 0);
  }
  entry.click();
  await tick();
  assert.equal(app.scrolls.length, 0);
  app.dom.window.close();
});

test("retrying a failed next page does not scroll after it succeeds", async () => {
  let fail = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) => {
      if (offset === 11 && fail) throw Error("temporary failure");
      return envelope(
        Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
        offset,
        limit,
      );
    },
  });
  await tick();
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /temporary failure/,
  );
  const before = app.scrolls.length;
  fail = false;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(app.scrolls.length, before);
  app.dom.window.close();
});

test("successful pagination scrolls to page top, while a native exit anchor keeps browser scroll", async () => {
  const app = setup({
    respond: (offset, limit) =>
      envelope(
        Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
        offset,
        limit,
      ),
  });
  enter(app);
  await tick();
  const before = app.scrolls.length;
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.deepEqual(app.scrolls.slice(before), [[0, 0]]);
  app.document.querySelector("[data-user-topics-view] .page_inner a.p").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.deepEqual(app.scrolls.slice(before), [
    [0, 0],
    [0, 0],
  ]);
  const after = app.scrolls.length;
  app.window.location.hash = "#entry_list";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(app.scrolls.length, after);
  app.dom.window.close();
});

test("removing the host structure while active restores the remaining host state", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  const parent = app.document.querySelector(".columns").parentElement;
  const columns = app.document.querySelector(".columns");
  parent.querySelector("#footer").remove();
  await tick();
  assert.equal(columns.style.display, "");
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  app.dom.window.close();
});

test("a failed host hiding condition exits, and only an explicit same-hash click can reenter", async () => {
  let deliver;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("subject-topics")
        ? envelope([], offset, limit)
        : new Promise((resolve) => {
            deliver = () =>
              resolve(
                envelope(
                  Array.from({ length: limit }, (_, i) => hit(i + 1)),
                  offset,
                  limit,
                ),
              );
          }),
  });
  await tick();
  const columns = app.document.querySelector(".columns");
  columns.classList.remove("columns");
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(app.window.location.hash, "#posts/group");
  deliver();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  columns.classList.add("columns");
  app.window.location.hash = "#posts";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  app.document.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.equal(
    app.document.querySelector(".entry-list a.l")?.textContent,
    "Topic 1",
  );
  assert.equal(app.requests.length, 2);
  app.dom.window.close();
});

test("a recovered host reentry on the same hash does not scroll", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts" });
  const columns = app.document.querySelector(".columns");
  await tick();
  assert.ok(app.document.querySelector("[data-user-topics-view]"));
  columns.classList.remove("columns");
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  columns.classList.add("columns");
  const before = app.scrolls.length;
  app.document.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.ok(app.document.querySelector("[data-user-topics-view]"));
  assert.equal(app.scrolls.length, before);
  app.dom.window.close();
});

test("a still-broken host keeps the same-hash click suspended without scrolling", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts" });
  const columns = app.document.querySelector(".columns");
  await tick();
  columns.classList.remove("columns");
  await tick();
  const before = app.scrolls.length;
  app.document.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(app.scrolls.length, before);
  app.dom.window.close();
});

test("reentry after recovery repaints the cached page without new requests", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) =>
      envelope(
        Array.from({ length: limit }, (_, i) => {
          const group = url.pathname.endsWith("group-topics");
          return hit(offset + i + 1, {
            kind: group ? 0 : 1,
            parentID: group ? 2 : 307,
          });
        }),
        offset,
        limit,
      ),
  });
  await tick();
  assert.equal(app.requests.length, 2);
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.requests.length, 4);
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  const columns = app.document.querySelector(".columns");
  columns.classList.remove("columns");
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  columns.classList.add("columns");
  const before = app.scrolls.length;
  app.document.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.ok(app.document.querySelector("[data-user-topics-view]"));
  assert.equal(app.requests.length, 4);
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(app.scrolls.length, before);
  app.dom.window.close();
});

test("losing a host CSS hook exits before the original content is exposed", async () => {
  for (const [selector, attribute, value] of [
    [".mainWrapper:has(> .columns)", "class", "not-mainWrapper"],
    ["#headerProfile", "id", "not-headerProfile"],
  ]) {
    const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
    const columns = app.document.querySelector(".columns");
    await tick();
    assert.ok(app.document.querySelector("[data-user-topics-view]"));
    app.document.querySelector(selector).setAttribute(attribute, value);
    await tick();
    assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
    assert.equal(columns.isConnected, true);
    assert.equal(app.window.location.hash, "#posts/group");
    app.dom.window.close();
  }
});

test("moving the original primary navigation out of the profile ends takeover", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  const nav = app.document.querySelector("#headerProfile .navTabs");
  await tick();
  assert.ok(app.document.querySelector("[data-user-topics-view]"));
  app.document.body.append(nav);
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(nav.isConnected, true);
  app.dom.window.close();
});

test("moving the owned posts view outside its host slot ends takeover", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  await tick();
  const columns = app.document.querySelector(".columns");
  const root = app.document.querySelector("[data-user-topics-view]");
  app.document.body.append(root);
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(app.window.getComputedStyle(columns).display, "block");
  app.dom.window.close();
});

test("removing the owned category navigation ends takeover", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  await tick();
  const columns = app.document.querySelector(".columns");
  app.document.querySelector("[data-user-topics-subnav]").remove();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.notEqual(app.window.getComputedStyle(columns).display, "none");
  app.dom.window.close();
});

test("external display and active marker updates are not overwritten on exit", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  const columns = app.document.querySelector(".columns");
  columns.style.display = "grid";
  const wrapper = app.document.querySelector("#wrapperNeue");
  wrapper.dataset.userTopicsActive = "external";
  await tick();
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(columns.style.display, "grid");
  assert.equal(wrapper.dataset.userTopicsActive, "external");
  assert.equal(app.document.querySelector("[data-user-topics-style]"), null);
  app.dom.window.close();
});

test("rejects a foreign-origin blog anchor even if its path resembles the target user", () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    markup: html.replace(
      'href="/user/sai/blog"',
      'href="https://evil.example/user/sai/blog"',
    ),
  });
  assert.equal(app.document.querySelector("[data-user-topics-link]"), null);
  assert.equal(app.requests.length, 0);
  app.dom.window.close();
});

test("missing mounting structure never inserts entry or requests even with direct hash", () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    markup: html.replace('class="columns columns-center"', 'class="missing"'),
  });
  assert.equal(app.document.querySelector("[data-user-topics-link]"), null);
  assert.equal(app.requests.length, 0);
  app.dom.window.close();
});
