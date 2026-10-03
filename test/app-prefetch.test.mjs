import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, tick, hit, envelope } from "./app-support.mjs";

const numbers = (app) =>
  [...app.document.querySelectorAll("[data-page], [data-page-link]")].map(
    (node) => Number(node.textContent),
  );
const rows = (offset, limit) =>
  Array.from({ length: limit }, (_, i) => hit(offset + i + 1));

test("the first page is usable while its 101-item target is still loading", async (t) => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      offset === 50
        ? new Promise((resolve) => {
            release = () =>
              resolve(envelope(rows(offset, limit), offset, limit));
          })
        : envelope(rows(offset, limit), offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(app.document.querySelector("[data-page]")?.textContent, "1");
  assert.deepEqual(numbers(app), [1, 2, 3, 4, 5]);
  assert.equal(
    app.document
      .querySelector("[data-page-link='3']")
      .hasAttribute("aria-disabled"),
    false,
  );
  app.document.querySelector("[data-page-link='3']").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "3");
  const focused = app.document.querySelector(
    "[data-user-topics-view] .entry-list a.l",
  );
  focused.focus();
  release();
  await tick();
  assert.deepEqual(numbers(app), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(app.document.querySelector("[data-page-link='11']"), null);
  assert.equal(app.document.activeElement.href, focused.href);
  assert.deepEqual(app.scrolls, [[0, 0]]);
  assert.deepEqual(
    app.requests.map(({ request }) => [
      request.searchParams.get("offset"),
      request.searchParams.get("limit"),
    ]),
    [
      ["0", "50"],
      ["50", "50"],
      ["100", "1"],
    ],
  );
});

test("pages 4 and 14 raise cumulative targets without freezing unvisited cached pages", async (t) => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) => envelope(rows(offset, limit), offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  const jump = async (page) => {
    app.document.querySelector(`[data-page-link='${page}']`).click();
    await tick();
  };
  await jump(3);
  assert.equal(app.requests.length, 3);
  await jump(4);
  assert.deepEqual(numbers(app), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(app.requests.at(-1).request.searchParams.get("offset"), "151");
  await jump(11);
  await jump(13);
  assert.equal(app.requests.length, 5);
  await jump(14);
  assert.deepEqual(numbers(app), [12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  assert.equal(app.requests.at(-1).request.searchParams.get("offset"), "251");
  await jump(12);
  await jump(10);
  await jump(8);
  await jump(6);
  await jump(4);
  await jump(2);
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 11",
  );
  await jump(1);
  assert.equal(app.requests.length, 7);
  assert.deepEqual(numbers(app), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("three successful duplicate batches pause expansion rather than claiming exhaustion", async (t) => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) => envelope(rows(0, 50), offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(app.requests.length, 4);
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.deepEqual(numbers(app), [1, 2, 3, 4, 5]);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /连续.*没有有效新增/,
  );
  assert.equal(
    app.document.querySelector("[data-next]").getAttribute("aria-label"),
    "下一页",
  );
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.requests.length, 4);
});

test("a higher target resumes failed work even while another source is still in flight", async (t) => {
  let release,
    bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const batch = () =>
        envelope(
          rows(offset, limit).map((row) => ({
            ...row,
            kind: group ? 0 : 1,
            createdAt: (group ? 6000 : 3000) - row.id,
          })),
          offset,
          limit,
        );
      if (offset === 50 && group)
        return new Promise((resolve) => {
          release = () => resolve(batch());
        });
      if (offset === 50 && bad)
        return envelope([hit(0, { kind: 1 })], offset, limit);
      return batch();
    },
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.match(app.document.querySelector("[role=status]").textContent, /无效/);
  app.document.querySelector("[data-page-link='2']").click();
  await tick();
  assert.equal(app.requests.length, 4);
  bad = false;
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "4");
  release();
  await tick();
  assert.deepEqual(numbers(app), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(
    app.requests.filter(
      ({ request }) =>
        request.pathname.endsWith("subject-topics") &&
        request.searchParams.get("offset") === "50",
    ).length,
    2,
  );
  assert.equal(
    app.requests
      .filter(({ request }) => request.pathname.endsWith("subject-topics"))
      .at(-1)
      .request.searchParams.get("offset"),
    "200",
  );
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /无效/,
  );
});

test("the unknown next-page action explicitly resumes an incomplete prefix", async (t) => {
  let bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      envelope(
        !offset ? rows(0, 10) : bad ? [hit(0)] : rows(offset, limit),
        offset,
        limit,
      ),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(
    app.document.querySelector("[data-next]").getAttribute("aria-label"),
    "下一页（未确认）",
  );
  bad = false;
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 11",
  );
  assert.deepEqual(app.scrolls, [[0, 0]]);
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "10", "10", "60"],
  );
});

test("raising a target also extends a source that already finished the earlier target", async (t) => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const batch = () =>
        envelope(
          rows(offset, limit).map((row) => ({ ...row, kind: group ? 0 : 1 })),
          offset,
          limit,
        );
      if (!group && offset === 50)
        return new Promise((resolve) => {
          release = () => resolve(batch());
        });
      return batch();
    },
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.equal(
    app.requests.filter(({ request }) =>
      request.pathname.endsWith("group-topics"),
    ).length,
    3,
  );
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  release();
  await tick();
  assert.equal(
    app.requests
      .filter(({ request }) => request.pathname.endsWith("group-topics"))
      .at(-1)
      .request.searchParams.get("offset"),
    "151",
  );
  assert.equal(
    app.requests
      .filter(({ request }) => request.pathname.endsWith("subject-topics"))
      .at(-1)
      .request.searchParams.get("offset"),
    "200",
  );
  assert.deepEqual(numbers(app), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test("a higher-target recovery waits for a partially cached confirmed page instead of returning the old failure", async (t) => {
  let release,
    bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const batch = () =>
        envelope(
          rows(offset, offset ? limit : 31).map((row) => ({
            ...row,
            kind: group ? 0 : 1,
            createdAt: (group ? 6000 : 3000) - row.id,
          })),
          offset,
          limit,
        );
      if (group && offset === 31)
        return new Promise((resolve) => {
          release = () => resolve(batch());
        });
      if (!group && offset === 31 && bad)
        return envelope([hit(0, { kind: 1 })], offset, limit);
      return batch();
    },
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.deepEqual(numbers(app), [1, 2, 3, 4]);
  assert.match(app.document.querySelector("[role=status]").textContent, /无效/);
  bad = false;
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.equal(
    app.document
      .querySelector("[data-page-link='4']")
      .getAttribute("aria-disabled"),
    "true",
  );
  release();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "4");
  assert.equal(
    app.document.querySelector("[data-user-topics-view] .entry-list a.l")
      .textContent,
    "Topic 31",
  );
  assert.deepEqual(numbers(app), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /无效/,
  );
  assert.deepEqual(app.scrolls, [[0, 0]]);
});

test("all four categories prepare bounded prefixes and raise them on page four", async () => {
  for (const hash of [
    "#posts",
    "#posts/group",
    "#posts/subject",
    "#posts/replies",
  ]) {
    const app = setup({
      url: `https://bgm.tv/user/sai/blog${hash}`,
      respond: (offset, limit, url) =>
        envelope(
          rows(offset, limit).map((row) =>
            url.pathname.endsWith("replies")
              ? {
                  source: "group",
                  id: row.id,
                  containerID: 123,
                  excerpt: "reply",
                  createdAt: row.createdAt,
                }
              : {
                  ...row,
                  kind: url.pathname.endsWith("subject-topics") ? 1 : 0,
                },
          ),
          offset,
          limit,
        ),
    });
    try {
      await tick();
      assert.deepEqual(numbers(app), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], hash);
      assert.equal(app.requests.length, hash === "#posts" ? 6 : 3, hash);
      app.document.querySelector("[data-page-link='4']").click();
      await tick();
      assert.deepEqual(numbers(app), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11], hash);
      assert.equal(app.requests.length, hash === "#posts" ? 10 : 5, hash);
    } finally {
      app.dom.window.close();
    }
  }
});

test("continuing an unknown next page can discover exhaustion without replacing the current page with an empty one", async (t) => {
  let bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      envelope(!offset ? rows(0, 10) : bad ? [hit(0)] : [], offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(
    app.document.querySelector("[data-next]").getAttribute("aria-label"),
    "下一页（未确认）",
  );
  bad = false;
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.equal(
    app.document.querySelectorAll("[data-user-topics-view] .entry-list .item")
      .length,
    10,
  );
  assert.equal(app.document.querySelector("[data-next]"), null);
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /无效|没有找到/,
  );
});
