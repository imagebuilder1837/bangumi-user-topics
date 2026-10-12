import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, tick, hit, envelope, html } from "./support/posts-page.mjs";

const titles = (app) =>
  [
    ...app.document.querySelectorAll(
      "[data-user-topics-view] .entry-list h2.title > a",
    ),
  ].map((node) => node.textContent);
const rows = (offset, limit, extras = {}) =>
  Array.from({ length: limit }, (_, i) => hit(offset + i + 1, extras));
const stored = (app) => {
  const storage = app.window.localStorage;
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)).map(
    (key) => [key, storage.getItem(key)],
  );
};
const restore = (records) => (window) => {
  for (const [key, value] of records) window.localStorage.setItem(key, value);
};
const navigate = (app, hash) => {
  app.window.location.hash = hash;
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
};

async function seed(t, hash = "#posts/group", respond, pages = []) {
  const app = setup({
    url: `https://bgm.tv/user/sai/blog${hash}`,
    respond:
      respond ||
      ((offset, limit, url) =>
        envelope(
          rows(offset, limit, {
            kind: url.pathname.endsWith("subject-topics") ? 1 : 0,
          }),
          offset,
          limit,
        )),
  });
  t.after(() => app.dom.window.close());
  await tick();
  for (const page of pages) {
    app.document.querySelector(`[data-page-link='${page}']`).click();
    await tick();
  }
  return stored(app);
}

test("successful prefixes display immediately in a new document and an equal head needs no further requests", async (t) => {
  const records = await seed(t);
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      offset
        ? envelope(rows(offset, limit), offset, limit)
        : new Promise((resolve) => {
            release = () =>
              resolve(envelope(rows(offset, limit), offset, limit));
          }),
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.match(app.document.querySelector("[role=status]").textContent, /核验/);
  release();
  await tick();
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0"],
  );
  navigate(app, "#other");
  navigate(app, "#posts/group");
  await tick();
  assert.equal(app.requests.length, 1);
  assert.equal(titles(app)[0], "Topic 1");
});

test("changed display fields rebuild from the checked head and replace only after the preload target completes", async (t) => {
  const records = await seed(t);
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) => {
      const result = envelope(
        rows(offset, limit, { title: "Updated", replyCount: 7 }),
        offset,
        limit,
      );
      return offset === 50
        ? new Promise((resolve) => {
            release = () => resolve(result);
          })
        : result;
    },
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.equal(typeof release, "function");
  assert.deepEqual(stored(app), records);
  release();
  await tick();
  assert.equal(titles(app)[0], "Updated");
  assert.match(app.document.querySelector(".tools").textContent, /7 回复/);
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "50"],
  );
  const reloaded = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(stored(app)),
    respond: (offset, limit) =>
      envelope(
        rows(offset, limit, { title: "Updated", replyCount: 7 }),
        offset,
        limit,
      ),
  });
  t.after(() => reloaded.dom.window.close());
  await tick();
  assert.equal(titles(reloaded)[0], "Updated");
  assert.equal(reloaded.requests.length, 1);
});

test("all topics waits for both refresh outcomes and publishes the successful stream with the failed stream's old cache once", async (t) => {
  const records = await seed(t, "#posts");
  let failSubject;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      if (!group && offset === 50)
        return new Promise((resolve) => {
          failSubject = () =>
            resolve(envelope([hit(0, { kind: 1 })], offset, limit));
        });
      return envelope(
        rows(offset, limit, {
          kind: group ? 0 : 1,
          title: group ? "New group" : "New subject",
        }),
        offset,
        limit,
      );
    },
  });
  t.after(async () => {
    failSubject?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.equal(typeof failSubject, "function");
  assert.deepEqual(titles(app).slice(0, 4), [
    "Topic 1",
    "Topic 1",
    "Topic 2",
    "Topic 2",
  ]);
  app.document.querySelector("[data-page-link='2']").click();
  await tick();
  assert.deepEqual(titles(app).slice(0, 4), [
    "Topic 6",
    "Topic 6",
    "Topic 7",
    "Topic 7",
  ]);
  const displays = [];
  let displayedList = app.document.querySelector(
    "[data-user-topics-view] .entry-list",
  );
  const observer = new app.window.MutationObserver(() => {
    const list = app.document.querySelector(
      "[data-user-topics-view] .entry-list",
    );
    if (list !== displayedList) {
      displays.push(titles(app).join("|"));
      displayedList = list;
    }
  });
  observer.observe(app.document.querySelector("[data-user-topics-view]"), {
    childList: true,
    subtree: true,
  });
  failSubject();
  await tick();
  observer.disconnect();
  assert.deepEqual(titles(app).slice(0, 4), [
    "New group",
    "Topic 6",
    "New group",
    "Topic 7",
  ]);
  assert.equal(displays.length, 1);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /条目讨论.*无效/,
  );
  navigate(app, "#posts/group");
  await tick();
  assert.equal(titles(app)[0], "New group");
  assert.equal(app.requests.length, 4);
});

test("an incomplete persisted target is not treated as a reusable cache", async (t) => {
  const records = (await seed(t)).map(([key, value]) => {
    const record = JSON.parse(value);
    return [
      key,
      JSON.stringify({
        ...record,
        rows: record.rows.slice(0, 50),
        offset: 50,
        exhausted: false,
      }),
    ];
  });
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      offset
        ? envelope(rows(offset, limit), offset, limit)
        : new Promise((resolve) => {
            release = () =>
              resolve(envelope(rows(offset, limit), offset, limit));
          }),
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.equal(titles(app).length, 0);
  release();
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.equal(app.requests.length, 2);
});

test("failed cold targets and failed expansions never persist successful partial batches", async (t) => {
  const cold = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      envelope(offset ? [hit(0)] : rows(offset, limit), offset, limit),
  });
  t.after(() => cold.dom.window.close());
  await tick();
  assert.equal(titles(cold)[0], "Topic 1");
  assert.equal(stored(cold).length, 0);

  const records = await seed(t);
  const expansion = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      envelope(offset === 150 ? [hit(0)] : rows(offset, limit), offset, limit),
  });
  t.after(() => expansion.dom.window.close());
  await tick();
  expansion.document.querySelector("[data-page-link='4']").click();
  await tick();
  assert.match(
    expansion.document.querySelector("[role=status]").textContent,
    /无效/,
  );
  assert.deepEqual(stored(expansion), records);
  const reloaded = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(stored(expansion)),
    respond: (offset, limit) => envelope(rows(offset, limit), offset, limit),
  });
  t.after(() => reloaded.dom.window.close());
  await tick();
  assert.equal(reloaded.requests.length, 1);
  assert.equal(reloaded.document.querySelector("[data-page-link='11']"), null);
});

test("a failed rebuild keeps the old cache and explicit retry resumes the draft without another head request", async (t) => {
  const records = await seed(t);
  let bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      envelope(
        offset && bad ? [hit(0)] : rows(offset, limit, { title: "Rebuilt" }),
        offset,
        limit,
      ),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.deepEqual(stored(app), records);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /缓存更新失败/,
  );
  navigate(app, "#other");
  navigate(app, "#posts/group");
  await tick();
  assert.equal(app.requests.length, 2);
  bad = false;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(titles(app)[0], "Rebuilt");
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "50", "50"],
  );
});

test("rebuilding honors page 13's 200-item and page 14's 300-item targets before publishing", async (t) => {
  const records = await seed(t, "#posts/group", undefined, [4, 11, 14]);
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) => {
      const result = envelope(
        rows(offset, limit, { title: "Changed" }),
        offset,
        limit,
      );
      return offset === 50
        ? new Promise((resolve) => {
            release = () => resolve(result);
          })
        : result;
    },
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  for (const page of [4, 11, 13, 14]) {
    app.document.querySelector(`[data-page-link='${page}']`).click();
    await tick();
  }
  assert.equal(titles(app)[0], "Topic 131");
  assert.deepEqual(stored(app), records);
  const focus = app.document.querySelector(
    "[data-user-topics-view] .entry-list a",
  );
  focus.focus();
  const scrolls = [...app.scrolls];
  release();
  await tick();
  assert.equal(titles(app)[0], "Changed");
  assert.equal(app.document.querySelector("[data-page]").textContent, "14");
  assert.equal(app.document.activeElement.href, focus.href);
  assert.deepEqual(app.scrolls, scrolls);
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "50", "100", "150", "200", "250"],
  );
});

test("a smaller rebuilt prefix drops the old tail and natural exhaustion clamps the current page", async (t) => {
  const records = await seed(t, "#posts/group", undefined, [4, 11, 14]);
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      offset
        ? new Promise((resolve) => {
            release = () => resolve(envelope([], offset, limit));
          })
        : envelope(rows(0, 15, { title: "Short" }), offset, limit),
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  for (const page of [4, 11, 14]) {
    app.document.querySelector(`[data-page-link='${page}']`).click();
    await tick();
  }
  assert.equal(app.document.querySelector("[data-page]").textContent, "14");
  release();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(titles(app).length, 5);
  assert.equal(titles(app)[0], "Short");
  assert.equal(app.document.querySelector("[data-next]"), null);
  const reloaded = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(stored(app)),
    respond: (offset, limit) =>
      envelope(rows(0, 15, { title: "Short" }), offset, limit),
  });
  t.after(() => reloaded.dom.window.close());
  await tick();
  assert.equal(reloaded.requests.length, 1);
  assert.equal(reloaded.document.querySelector("[data-page-link='3']"), null);
});

test("requests beyond cached pages wait for verification and resume the raw service cursor past duplicates", async (t) => {
  const respond = (offset, limit) =>
    envelope(rows(offset < 100 ? 0 : offset - 50, limit), offset, limit);
  const records = await seed(t, "#posts/group", respond);
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      offset
        ? respond(offset, limit)
        : new Promise((resolve) => {
            release = () => resolve(respond(offset, limit));
          }),
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  app.document.querySelector("[data-page-link='10']").click();
  await tick();
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.requests.length, 1);
  assert.equal(app.document.querySelector("[data-page]").textContent, "10");
  release();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "11");
  assert.equal(titles(app)[0], "Topic 101");
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "150", "200"],
  );
});

test("returning to an invalidated high all-page resumes its prefix after an independent source recovers", async (t) => {
  const records = await seed(t, "#posts", undefined, [4, 11, 14]);
  let bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      return envelope(
        group && bad
          ? [hit(0)]
          : rows(
              offset,
              limit,
              group ? { title: "Recovered group" } : { kind: 1 },
            ),
        offset,
        limit,
      );
    },
  });
  t.after(() => app.dom.window.close());
  await tick();
  for (const page of [4, 11, 14]) {
    app.document.querySelector(`[data-page-link='${page}']`).click();
    await tick();
  }
  navigate(app, "#posts/group");
  await tick();
  bad = false;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(titles(app)[0], "Recovered group");
  navigate(app, "#posts");
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "14");
  assert.equal(titles(app)[0], "Recovered group");
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /失败/,
  );
  assert.deepEqual(
    app.requests
      .filter(({ request }) => request.pathname.endsWith("group-topics"))
      .map(({ request }) => request.searchParams.get("offset")),
    ["0", "0", "50", "100", "150", "200", "250"],
  );
});

test("a shared rebuild cannot publish or persist a lower category target while all requires a higher target", async (t) => {
  const records = await seed(t, "#posts", undefined, [4, 11, 14]);
  let releaseFirst, failNext;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      if (url.pathname.endsWith("subject-topics"))
        return envelope(rows(offset, limit, { kind: 1 }), offset, limit);
      const result = envelope(
        rows(offset, limit, { title: "Changed group" }),
        offset,
        limit,
      );
      if (offset === 50)
        return new Promise((resolve) => {
          releaseFirst = () => resolve(result);
        });
      if (offset === 100)
        return new Promise((resolve) => {
          failNext = () => resolve(envelope([hit(0)], offset, limit));
        });
      return result;
    },
  });
  t.after(async () => {
    releaseFirst?.();
    await tick();
    failNext?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  navigate(app, "#posts");
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  releaseFirst();
  await tick();
  assert.equal(typeof failNext, "function");
  assert.deepEqual(stored(app), records);
  failNext();
  await tick();
  assert.equal(titles(app)[0], "Topic 16");
  assert.deepEqual(stored(app), records);
});

test("network success still updates memory when storage writes fail and leaves the old disk cache intact", async (t) => {
  const records = await seed(t);
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: (window) => {
      restore(records)(window);
      window.Storage.prototype.setItem = () => {
        throw new Error("full");
      };
    },
    respond: (offset, limit) =>
      envelope(rows(offset, limit, { title: "Memory update" }), offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "Memory update");
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /缓存保存失败/,
  );
  assert.deepEqual(stored(app), records);
});

test("blocked localStorage property access degrades to normal memory browsing", async (t) => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: (window) =>
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("blocked");
        },
      }),
    respond: (offset, limit) => envelope(rows(offset, limit), offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.equal(app.requests.length, 2);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /缓存保存失败/,
  );
});

test("replies persist independently, verify once and rebuild changed excerpts without entering all topics", async (t) => {
  const replyRows = (offset, limit, excerpt = "Old excerpt") =>
    rows(offset, limit).map((row) => ({
      source: "group",
      id: row.id,
      containerID: 123,
      containerTitle: "Reply container",
      excerpt,
      createdAt: row.createdAt,
    }));
  const records = await seed(t, "#posts/replies", (offset, limit) =>
    envelope(replyRows(offset, limit), offset, limit),
  );
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    beforeStart: restore(records),
    respond: (offset, limit, url) =>
      envelope(
        url.pathname.endsWith("replies")
          ? replyRows(offset, limit, "New excerpt")
          : [],
        offset,
        limit,
      ),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(
    app.document.querySelector("[data-user-topics-view] .content a")
      .textContent,
    "New excerpt",
  );
  assert.equal(app.requests.length, 2);
  navigate(app, "#posts");
  await tick();
  assert.equal(titles(app).length, 0);
  navigate(app, "#posts/replies");
  await tick();
  assert.equal(
    app.requests.filter(({ request }) => request.pathname.endsWith("replies"))
      .length,
    2,
  );
  const reloaded = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    beforeStart: restore(stored(app)),
    respond: (offset, limit) =>
      envelope(replyRows(offset, limit, "New excerpt"), offset, limit),
  });
  t.after(() => reloaded.dom.window.close());
  await tick();
  assert.equal(reloaded.requests.length, 1);
});

test("an early failed source still waits for the other source's successful rebuild before changing all topics", async (t) => {
  const records = await seed(t, "#posts");
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      if (url.pathname.endsWith("group-topics"))
        return envelope([hit(0)], offset, limit);
      const result = envelope(
        rows(offset, limit, { kind: 1, title: "New subject" }),
        offset,
        limit,
      );
      return offset
        ? new Promise((resolve) => {
            release = () => resolve(result);
          })
        : result;
    },
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.deepEqual(titles(app).slice(0, 2), ["Topic 1", "Topic 1"]);
  release();
  await tick();
  assert.deepEqual(titles(app).slice(0, 2), ["Topic 1", "New subject"]);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /小组话题.*无效/,
  );
});

for (const [name, change, expectedRequests] of [
  ["title", (batch) => batch.map((row) => ({ ...row, title: "New" })), 2],
  [
    "reply count",
    (batch) => batch.map((row) => ({ ...row, replyCount: 9 })),
    2,
  ],
  [
    "parent name",
    (batch) => batch.map((row) => ({ ...row, parentName: "New parent" })),
    2,
  ],
  ["link target", (batch) => batch.map((row) => ({ ...row, parentID: 3 })), 2],
  [
    "creation time",
    (batch) => batch.map((row) => ({ ...row, createdAt: row.createdAt + 60 })),
    2,
  ],
  ["content order", (batch) => [...batch].reverse(), 2],
  [
    "undisplayed diagnostics",
    (batch) =>
      batch.map((row) => ({
        ...row,
        updatedAt: 1700000000,
        creatorName: "New author",
      })),
    1,
  ],
])
  test(`head verification compares ${name}`, async (t) => {
    const records = await seed(t);
    const app = setup({
      url: "https://bgm.tv/user/sai/blog#posts/group",
      beforeStart: restore(records),
      respond: (offset, limit) =>
        envelope(change(rows(offset, limit)), offset, limit),
    });
    t.after(() => app.dom.window.close());
    await tick();
    assert.equal(app.requests.length, expectedRequests);
  });

test("an empty successful cache is reusable and can be replaced by newly indexed content", async (t) => {
  const records = await seed(t, "#posts/group", (offset, limit) =>
    envelope([], offset, limit),
  );
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      envelope(offset ? [] : rows(0, 10), offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.equal(app.document.querySelector("[data-next]"), null);
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "10"],
  );
});

test("successful rebuilding discards a larger old tail instead of scanning merely to restore its size", async (t) => {
  const records = await seed(t, "#posts/group", undefined, [4, 11, 14]);
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      envelope(rows(offset, limit, { title: "New prefix" }), offset, limit),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "New prefix");
  assert.equal(app.requests.length, 2);
  assert.equal(app.document.querySelector("[data-page-link='11']"), null);
  const reloaded = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(stored(app)),
    respond: (offset, limit) =>
      envelope(rows(offset, limit, { title: "New prefix" }), offset, limit),
  });
  t.after(() => reloaded.dom.window.close());
  await tick();
  assert.equal(reloaded.requests.length, 1);
  assert.equal(reloaded.document.querySelector("[data-page-link='11']"), null);
});

test("another user's records never supply the current user's cache", async (t) => {
  const records = await seed(t);
  let release;
  const app = setup({
    url: "https://bgm.tv/user/alice/blog#posts/group",
    markup: html.replaceAll("/user/sai", "/user/alice"),
    beforeStart: restore(records),
    respond: (offset, limit) =>
      offset
        ? envelope(rows(offset, limit, { title: "Alice" }), offset, limit)
        : new Promise((resolve) => {
            release = () =>
              resolve(
                envelope(
                  rows(offset, limit, { title: "Alice" }),
                  offset,
                  limit,
                ),
              );
          }),
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.equal(titles(app).length, 0);
  assert.equal(app.requests[0].request.searchParams.get("q"), "user:alice");
  release();
  await tick();
  assert.equal(titles(app)[0], "Alice");
});

for (const corrupt of [
  () => "{",
  (value) => JSON.stringify({ ...JSON.parse(value), version: 999 }),
  (value) => {
    const record = JSON.parse(value);
    record.rows[0].id = Number.MAX_SAFE_INTEGER + 1;
    return JSON.stringify(record);
  },
])
  test("invalid or incompatible stored data falls back to validated network content", async (t) => {
    const records = (await seed(t)).map(([key, value]) => [
      key,
      corrupt(value),
    ]);
    const app = setup({
      url: "https://bgm.tv/user/sai/blog#posts/group",
      beforeStart: restore(records),
      respond: (offset, limit) => envelope(rows(offset, limit), offset, limit),
    });
    t.after(() => app.dom.window.close());
    await tick();
    assert.equal(titles(app)[0], "Topic 1");
    assert.equal(app.requests.length, 2);
  });

test("returning to the same user in one document reuses the already verified session", async (t) => {
  const records = await seed(t);
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit, url) =>
      envelope(
        rows(
          offset,
          limit,
          url.searchParams.get("q") === "user:sai"
            ? {}
            : { title: "Other user" },
        ),
        offset,
        limit,
      ),
  });
  t.after(() => app.dom.window.close());
  await tick();
  navigate(app, "#other");
  await tick();
  app.document.querySelector('.navTabs a[href="/user/sai/blog"]').href =
    "/user/other/blog";
  app.window.history.replaceState(null, "", "/user/other/blog#posts/group");
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(titles(app)[0], "Other user");
  navigate(app, "#other");
  await tick();
  app.document.querySelector('.navTabs a[href="/user/other/blog"]').href =
    "/user/sai/blog";
  app.window.history.replaceState(null, "", "/user/sai/blog#posts/group");
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.equal(
    app.requests.filter(
      ({ request }) => request.searchParams.get("q") === "user:sai",
    ).length,
    1,
  );
});

test("cached verification failures retain readable data and cannot bypass the shared 429 cooldown", async (t) => {
  const records = await seed(t);
  let now = 0;
  const calls = [];
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    timers: { now: () => now },
    fetchOverride: async (input) => {
      const url = new URL(input);
      calls.push(url);
      if (calls.length === 1)
        return { ok: false, status: 429, headers: { get: () => "2" } };
      return {
        ok: true,
        json: async () =>
          envelope(
            rows(0, 50),
            Number(url.searchParams.get("offset")),
            Number(url.searchParams.get("limit")),
          ),
      };
    },
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /缓存更新失败/,
  );
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(calls.length, 1);
  now = 2000;
  await tick();
  assert.equal(calls.length, 1);
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(titles(app)[0], "Topic 1");
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /失败/,
  );
});

for (const changed of [true, false])
  test(`a cached ${changed ? "changed" : "failed"} source joins a cold source only after both finish`, async (t) => {
    const records = await seed(t);
    let release;
    const app = setup({
      url: "https://bgm.tv/user/sai/blog#posts",
      beforeStart: restore(records),
      respond: (offset, limit, url) => {
        const group = url.pathname.endsWith("group-topics");
        if (group)
          return envelope(
            changed
              ? rows(offset, limit, { title: "Changed group" })
              : [hit(0)],
            offset,
            limit,
          );
        const result = envelope(
          rows(offset, limit, { kind: 1, title: "Fresh subject" }),
          offset,
          limit,
        );
        return offset
          ? new Promise((resolve) => {
              release = () => resolve(result);
            })
          : result;
      },
    });
    t.after(async () => {
      release?.();
      await tick();
      app.dom.window.close();
    });
    await tick();
    assert.equal(titles(app).length, 0);
    release();
    await tick();
    assert.deepEqual(titles(app).slice(0, 2), [
      changed ? "Changed group" : "Topic 1",
      "Fresh subject",
    ]);
  });

test("all topics reports storage failure even when another source also fails to update", async (t) => {
  const records = await seed(t, "#posts");
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: (window) => {
      restore(records)(window);
      window.Storage.prototype.setItem = () => {
        throw new Error("full");
      };
    },
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      return envelope(
        !group && offset
          ? [hit(0, { kind: 1 })]
          : rows(offset, limit, {
              kind: group ? 0 : 1,
              title: group ? "Memory group" : "Changed subject",
            }),
        offset,
        limit,
      );
    },
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "Memory group");
  const status = app.document.querySelector("[role=status]").textContent;
  assert.match(status, /条目讨论.*无效/);
  assert.match(status, /缓存保存失败/);
});

test("natural exhaustion after duplicate rebuild batches completes the target instead of pausing it", async (t) => {
  const records = await seed(t);
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      envelope(
        offset >= 150 ? [] : rows(0, 50, { title: "Naturally complete" }),
        offset,
        limit,
      ),
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(titles(app)[0], "Naturally complete");
  assert.equal(app.document.querySelector("[data-page-link='6']"), null);
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /失败|暂停|没有有效新增/,
  );
});

test("a lower consumer already in the same round cannot persist before its original higher target", async (t) => {
  const records = await seed(t, "#posts");
  let release100, release150;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const result = envelope(
        !group && offset === 100
          ? [hit(0, { kind: 1 })]
          : rows(offset, limit, { kind: group ? 0 : 1 }),
        offset,
        limit,
      );
      if (group && offset === 100)
        return new Promise((resolve) => {
          release100 = () => resolve(result);
        });
      if (group && offset === 150)
        return new Promise((resolve) => {
          release150 = () => resolve(result);
        });
      return result;
    },
  });
  t.after(async () => {
    release100?.();
    await tick();
    release150?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  navigate(app, "#posts/group");
  await tick();
  release100();
  await tick();
  assert.equal(typeof release150, "function");
  assert.deepEqual(stored(app), records);
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /失败|无效/,
  );
  release150();
  await tick();
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":group"))[1]).goal,
    200,
  );
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":subject"))[1]).goal,
    100,
  );
});

test("a smaller category cannot lower a source's failed target and retry the same target", async (t) => {
  const records = await seed(t, "#posts");
  let bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) =>
      envelope(
        bad && url.pathname.endsWith("group-topics") && offset === 150
          ? [hit(0)]
          : rows(offset, limit, {
              kind: url.pathname.endsWith("group-topics") ? 0 : 1,
            }),
        offset,
        limit,
      ),
  });
  t.after(() => app.dom.window.close());
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  navigate(app, "#posts/group");
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  assert.equal(
    app.requests.filter(
      ({ request }) =>
        request.pathname.endsWith("group-topics") &&
        request.searchParams.get("offset") === "150",
    ).length,
    1,
  );
  app.document.querySelector("[data-page-link='10']").click();
  await tick();
  bad = false;
  app.document.querySelector("[data-page-link='14']").click();
  await tick();
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":group"))[1]).goal,
    300,
  );
});

test("another source's failure cannot poison an independently usable cached source", async (t) => {
  const records = await seed(t, "#posts");
  let releaseGroup;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const result = envelope(
        !group && offset === 100
          ? [hit(0, { kind: 1 })]
          : rows(offset, limit, { kind: group ? 0 : 1 }),
        offset,
        limit,
      );
      return group && offset === 100
        ? new Promise((resolve) => {
            releaseGroup = () => resolve(result);
          })
        : result;
    },
  });
  t.after(async () => {
    releaseGroup?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  releaseGroup();
  await tick();
  navigate(app, "#posts/group");
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /失败|无效/,
  );
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":group"))[1]).goal,
    200,
  );
  assert.equal(
    app.requests.filter(
      ({ request }) =>
        request.pathname.endsWith("subject-topics") &&
        request.searchParams.get("offset") === "100",
    ).length,
    1,
  );
});

test("ordinary cached expansion still commits its completed source and higher targets recover the failed source", async (t) => {
  const records = await seed(t, "#posts");
  let releaseGroup,
    failSubject,
    bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const result = envelope(
        rows(offset, limit, { kind: group ? 0 : 1 }),
        offset,
        limit,
      );
      if (bad && group && offset === 150)
        return new Promise((resolve) => {
          releaseGroup = () => resolve(result);
        });
      if (bad && !group && offset === 150)
        return new Promise((resolve) => {
          failSubject = () =>
            resolve(envelope([hit(0, { kind: 1 })], offset, limit));
        });
      return result;
    },
  });
  t.after(async () => {
    failSubject?.();
    await tick();
    releaseGroup?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  failSubject();
  await tick();
  releaseGroup();
  await tick();
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":group"))[1]).goal,
    200,
  );
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":subject"))[1]).goal,
    100,
  );
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /条目讨论.*无效/,
  );
  app.document.querySelector("[data-page-link='10']").click();
  await tick();
  assert.equal(
    app.requests.filter(
      ({ request }) =>
        request.pathname.endsWith("subject-topics") &&
        request.searchParams.get("offset") === "150",
    ).length,
    1,
  );
  bad = false;
  app.document.querySelector("[data-page-link='14']").click();
  await tick();
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":subject"))[1]).goal,
    300,
  );
  assert.equal(app.document.querySelector("[data-page]").textContent, "14");
  assert.equal(
    app.requests.filter(
      ({ request }) => request.searchParams.get("offset") === "0",
    ).length,
    2,
  );
});

test("joining a cached source recovery never retries the other failed cold source", async (t) => {
  const records = await seed(t);
  let failedGroup = false,
    subjectFailed = true,
    releaseGroup;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      if (!group)
        return envelope(
          subjectFailed
            ? [hit(0, { kind: 1 })]
            : rows(offset, limit, { kind: 1, title: "Recovered subject" }),
          offset,
          limit,
        );
      if (offset === 50 && !failedGroup) {
        failedGroup = true;
        return envelope([hit(0)], offset, limit);
      }
      const result = envelope(
        rows(offset, limit, { title: "Recovered group" }),
        offset,
        limit,
      );
      return offset === 50
        ? new Promise((resolve) => {
            releaseGroup = () => resolve(result);
          })
        : result;
    },
  });
  t.after(async () => {
    releaseGroup?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  navigate(app, "#posts/group");
  await tick();
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  navigate(app, "#posts");
  await tick();
  releaseGroup();
  await tick();
  assert.equal(
    app.requests.filter(({ request }) =>
      request.pathname.endsWith("subject-topics"),
    ).length,
    1,
  );
  assert.deepEqual(titles(app), []);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /条目讨论.*无效/,
  );
  navigate(app, "#posts/subject");
  await tick();
  assert.equal(
    app.requests.filter(({ request }) =>
      request.pathname.endsWith("subject-topics"),
    ).length,
    1,
  );
  subjectFailed = false;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(titles(app)[0], "Recovered subject");
  assert.deepEqual(
    app.requests
      .filter(({ request }) => request.pathname.endsWith("subject-topics"))
      .map(({ request }) => request.searchParams.get("offset")),
    ["0", "0", "50"],
  );
});

test("an equal cached source still waits for the cold source's complete all-target", async (t) => {
  const records = await seed(t);
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const result = envelope(
        rows(offset, limit, { kind: group ? 0 : 1 }),
        offset,
        limit,
      );
      return !group && offset === 50
        ? new Promise((resolve) => {
            release = () => resolve(result);
          })
        : result;
    },
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.deepEqual(titles(app), []);
  release();
  await tick();
  assert.deepEqual(titles(app).slice(0, 2), ["Topic 1", "Topic 1"]);
});

test("a failed shared higher cold target cannot be persisted as a lower target", async (t) => {
  let release50, fail100;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const result = envelope(
        rows(offset, limit, { kind: group ? 0 : 1 }),
        offset,
        limit,
      );
      if (group && offset === 50)
        return new Promise((resolve) => {
          release50 = () => resolve(result);
        });
      if (group && offset === 100)
        return new Promise((resolve) => {
          fail100 = () => resolve(envelope([hit(0)], offset, limit));
        });
      return result;
    },
  });
  t.after(async () => {
    release50?.();
    await tick();
    fail100?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  release50();
  await tick();
  navigate(app, "#posts");
  await tick();
  fail100();
  await tick();
  assert.equal(
    stored(app).some(([key]) => key.endsWith(":group")),
    false,
  );
  assert.match(app.document.querySelector("[role=status]").textContent, /无效/);
});

test("a high all-page rejoins a source recovery before its lower target commits", async (t) => {
  const records = await seed(t, "#posts", undefined, [4, 11, 14]);
  let bad = true,
    release50,
    release150;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const result = envelope(
        group && bad
          ? [hit(0)]
          : rows(
              offset,
              limit,
              group ? { title: "Recovered group" } : { kind: 1 },
            ),
        offset,
        limit,
      );
      if (group && offset === 50)
        return new Promise((resolve) => {
          release50 = () => resolve(result);
        });
      if (group && offset === 150)
        return new Promise((resolve) => {
          release150 = () => resolve(result);
        });
      return result;
    },
  });
  t.after(async () => {
    release50?.();
    await tick();
    release150?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  for (const page of [4, 11, 14]) {
    app.document.querySelector(`[data-page-link='${page}']`).click();
    await tick();
  }
  navigate(app, "#posts/group");
  await tick();
  bad = false;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  navigate(app, "#posts");
  await tick();
  const link = app.document.querySelector(
    "[data-user-topics-view] .entry-list a",
  );
  link.focus();
  const scrolls = [...app.scrolls];
  release50();
  await tick();
  assert.equal(typeof release150, "function");
  assert.equal(titles(app)[0], "Topic 66");
  assert.equal(app.document.querySelector("[data-page]").textContent, "14");
  release150();
  await tick();
  assert.equal(titles(app)[0], "Recovered group");
  assert.equal(app.document.querySelector("[data-page]").textContent, "14");
  assert.deepEqual(app.scrolls, scrolls);
  assert.equal(app.document.activeElement.href, link.href);
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":group"))[1]).goal,
    300,
  );
});

test("all retains the whole snapshot until a shared source's higher target settles", async (t) => {
  const records = await seed(t, "#posts", undefined, [4]);
  let release50, release100;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit, url) => {
      const group = url.pathname.endsWith("group-topics");
      const result = envelope(
        rows(offset, limit, {
          kind: group ? 0 : 1,
          title: group ? "New group" : "New subject",
        }),
        offset,
        limit,
      );
      if (group && offset === 50)
        return new Promise((resolve) => {
          release50 = () => resolve(result);
        });
      if (group && offset === 100)
        return new Promise((resolve) => {
          release100 = () => resolve(result);
        });
      return result;
    },
  });
  t.after(async () => {
    release50?.();
    await tick();
    release100?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  app.document.querySelector("[data-page-link='4']").click();
  await tick();
  release50();
  await tick();
  navigate(app, "#posts");
  await tick();
  assert.deepEqual(titles(app).slice(0, 2), ["Topic 1", "Topic 1"]);
  const oldList = app.document.querySelector(
    "[data-user-topics-view] .entry-list",
  );
  release100();
  await tick();
  assert.deepEqual(titles(app).slice(0, 2), ["New group", "New subject"]);
  assert.notEqual(
    app.document.querySelector("[data-user-topics-view] .entry-list"),
    oldList,
  );
  assert.equal(
    JSON.parse(stored(app).find(([key]) => key.endsWith(":group"))[1]).goal,
    200,
  );
});

test("a cold user load that finishes while another user is selected remains usable on return", async (t) => {
  let finishSai;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) => {
      const sai = url.searchParams.get("q") === "user:sai";
      const result = envelope(
        rows(offset, limit, { title: sai ? "Sai data" : "Other data" }),
        offset,
        limit,
      );
      return sai && !offset
        ? new Promise((resolve) => {
            finishSai = () => resolve(result);
          })
        : result;
    },
  });
  t.after(async () => {
    finishSai?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  navigate(app, "#other");
  await tick();
  app.document.querySelector('.navTabs a[href="/user/sai/blog"]').href =
    "/user/other/blog";
  app.window.history.replaceState(null, "", "/user/other/blog#posts/group");
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  finishSai();
  await tick();
  assert.equal(titles(app)[0], "Other data");
  navigate(app, "#other");
  await tick();
  app.document.querySelector('.navTabs a[href="/user/other/blog"]').href =
    "/user/sai/blog";
  app.window.history.replaceState(null, "", "/user/sai/blog#posts/group");
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(titles(app)[0], "Sai data");
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(
    app.requests.filter(
      ({ request }) => request.searchParams.get("q") === "user:sai",
    ).length,
    2,
  );
});

test("a cache whose head disagrees with its displayed prefix is ignored", async (t) => {
  const records = (await seed(t)).map(([key, value]) => {
    const record = JSON.parse(value);
    record.rows[0].title = "Damaged prefix";
    return [key, JSON.stringify(record)];
  });
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    beforeStart: restore(records),
    respond: (offset, limit) =>
      offset
        ? envelope(rows(offset, limit), offset, limit)
        : new Promise((resolve) => {
            release = () =>
              resolve(envelope(rows(offset, limit), offset, limit));
          }),
  });
  t.after(async () => {
    release?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  assert.equal(titles(app).length, 0);
  release();
  await tick();
  assert.equal(titles(app)[0], "Topic 1");
  assert.equal(app.requests.length, 2);
});
