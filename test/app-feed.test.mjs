import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, enter, tick, hit, envelope } from "./app-support.mjs";

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
  assert.deepEqual(
    [
      ...app.document.querySelectorAll(
        "[data-user-topics-view] [data-page-link]",
      ),
    ].map((a) => a.textContent),
    ["1", "3"],
  );
  assert.equal(
    app.document.querySelector(".entry-list a.l").href,
    "https://bgm.tv/group/topic/11",
  );
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.deepEqual(
    [
      ...app.document.querySelectorAll(
        "[data-user-topics-view] [data-page-link]",
      ),
    ].map((a) => a.textContent),
    ["2"],
  );
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
  assert.deepEqual(
    [
      ...app.document.querySelectorAll(
        "[data-user-topics-view] [data-page-link]",
      ),
    ].map((a) => a.textContent),
    ["1", "3"],
  );
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
  app.document.querySelector("[role=status] a.chiiBtn").click();
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
  app.document.querySelector("[role=status] a.chiiBtn").click();
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
  app.document.querySelector("[role=status] a.chiiBtn").click();
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
  const status = app.document.querySelector(
    '[data-user-topics-view] > .flex-center-v > [role="status"]',
  );
  assert.match(
    status.firstChild.textContent,
    /无法确认是否还有下一页：temporary failure/,
  );
  assert.equal(status.querySelector("a.chiiBtn > span").textContent, "重试");
  assert.equal(app.document.querySelector("[data-next]").textContent, "››");
  assert.equal(
    app.document.querySelector("[data-user-topics-view] [data-page-link]"),
    null,
  );
  assert.equal(
    app.document.querySelector("[data-next]").getAttribute("aria-label"),
    "下一页（未确认）",
  );
  fail = false;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(app.requests.at(-1).request.searchParams.get("limit"), "1");
  assert.equal(app.document.querySelectorAll(".entry-list .item").length, 10);
  assert.equal(
    app.document.querySelector("[data-user-topics-view] [data-page-link]")
      .textContent,
    "2",
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
