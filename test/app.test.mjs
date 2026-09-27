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
  start(dom.window, { fetch });
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
    [...app.document.querySelectorAll(".entry-list a.l")].map(
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
    [...app.document.querySelectorAll(".entry-list a.l")].map((a) => a.href),
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
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.requests[1].request.searchParams.get("offset"), "11");
  assert.equal(app.requests[1].request.searchParams.get("limit"), "10");
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 11",
  );
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
            meta: {},
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
  fail = false;
  app.document.querySelector("[role=status] button").click();
  await tick();
  assert.equal(app.requests.at(-1).request.searchParams.get("limit"), "1");
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
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

test("successful pagination scrolls to the list, while a native exit anchor keeps browser scroll", async () => {
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
  assert.ok(app.scrolls.length > before);
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
