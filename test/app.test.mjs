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
  dom.window.scrollTo = () => {};
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
  return { window: dom.window, document: dom.window.document, requests, dom };
}
function enter(app) {
  app.document.querySelector("[data-user-topics-link] a").click();
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
}

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
  assert.equal(columns.style.display, "none");
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
    /无法确认/,
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

test("missing mounting structure never inserts entry or requests even with direct hash", () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    markup: html.replace('class="columns columns-center"', 'class="missing"'),
  });
  assert.equal(app.document.querySelector("[data-user-topics-link]"), null);
  assert.equal(app.requests.length, 0);
  app.dom.window.close();
});
