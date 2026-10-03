import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, tick, envelope, hit } from "./app-support.mjs";

const navigate = (app, hash) => {
  app.window.location.hash = hash;
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
};
const replyHit = (id, extras = {}) => ({
  source: "group",
  id,
  containerID: 123,
  containerTitle: "讨论",
  parentID: 2,
  parentName: "站务论坛",
  creatorID: 1,
  creatorName: "Sai",
  creatorUsername: "sai",
  excerpt: "本人发言",
  createdAt: 1697285544 - id,
  ...extras,
});

test("direct replies route queries the target author and exposes the fourth category", async () => {
  const app = setup({ url: "https://bangumi.tv/user/sai/blog#posts/replies" });
  await tick();
  assert.equal(app.requests.length, 1);
  const { request, init } = app.requests[0];
  assert.equal(request.pathname, "/v1/search/replies");
  assert.equal(request.searchParams.get("q"), "user:sai");
  assert.equal(request.searchParams.get("source"), "all");
  assert.equal(request.searchParams.get("sort"), "newest");
  assert.equal(request.searchParams.get("limit"), "50");
  assert.equal(init.credentials, "omit");
  assert.deepEqual(
    [...app.document.querySelectorAll("[data-user-topics-subnav] a")].map(
      (a) => a.hash,
    ),
    ["#posts", "#posts/group", "#posts/subject", "#posts/replies"],
  );
  assert.equal(app.document.title, "Sai🖖的评论回复");
  assert.equal(
    app.document.querySelector("[role=status]").textContent,
    "没有找到已收录的评论回复",
  );
  assert.equal(
    app.document.querySelector("[data-user-topics-link] a").textContent,
    "帖子",
  );
  app.dom.window.close();
});

test("six reply sources use native permalinks, plain excerpts and distinct identities", async () => {
  const rows = [
    replyHit(7, {
      createdAt: 1697285544,
      excerpt: "第一行\n<script>bad()</script> & 本人的文字",
    }),
    replyHit(7, {
      createdAt: 1697285544,
      source: "subject",
      parentID: 307,
      parentName: "红猪",
    }),
    replyHit(7, {
      createdAt: 1697285544,
      source: "episode",
      parentID: 307,
      parentName: "红猪",
    }),
    replyHit(7, {
      createdAt: 1697285544,
      source: "character",
      parentID: null,
      parentName: null,
    }),
    replyHit(7, {
      createdAt: 1697285544,
      source: "person",
      parentID: null,
      parentName: null,
    }),
    replyHit(7, {
      createdAt: 1697285544,
      source: "blog",
      parentID: null,
      parentName: null,
    }),
    replyHit(8, { createdAt: 1697285544 }),
  ];
  const app = setup({
    url: "https://chii.in/user/sai/blog#posts/replies",
    respond: (offset, limit) =>
      envelope(offset === 0 ? rows : [], offset, limit),
  });
  await tick();
  const entries = [
    ...app.document.querySelectorAll(
      "[data-user-topics-view] .entry-list .entry",
    ),
  ];
  assert.deepEqual(
    entries.map((entry) => entry.querySelector("h2 a").href),
    [
      "https://chii.in/group/topic/123#post_7",
      "https://chii.in/subject/topic/123#post_7",
      "https://chii.in/ep/123#post_7",
      "https://chii.in/character/123#post_7",
      "https://chii.in/person/123#post_7",
      "https://chii.in/blog/123#post_7",
      "https://chii.in/group/topic/123#post_8",
    ],
  );
  assert.equal(
    entries[0].querySelector(".content > a").textContent,
    "第一行\n<script>bad()</script> & 本人的文字",
  );
  for (const entry of entries) {
    assert.equal(
      entry.querySelector(".content > a").href,
      entry.querySelector("h2 a").href,
    );
    assert.equal(entry.querySelector("script, img, .avatar"), null);
    assert.doesNotMatch(entry.querySelector(".tools").textContent, /\\d+ 回复/);
  }
  assert.equal(
    entries[0].querySelector('.tools a[href="https://chii.in/group/2"]')
      .textContent,
    "站务论坛",
  );
  assert.equal(
    entries[2].querySelector('.tools a[href="https://chii.in/subject/307"]')
      .textContent,
    "红猪",
  );
  assert.match(entries[5].querySelector(".tools").textContent, /日志评论/);
  app.dom.window.close();
});

test("missing optional reply information degrades without detail requests", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    respond: (offset, limit) =>
      envelope(
        offset === 0
          ? [
              replyHit(1, {
                containerTitle: null,
                excerpt: " \n ",
                parentID: null,
                parentName: null,
                creatorID: null,
                creatorName: null,
                creatorUsername: null,
              }),
              replyHit(2, {
                source: "episode",
                containerTitle: "",
                parentID: null,
                parentName: "只有显示名称",
              }),
            ]
          : [],
        offset,
        limit,
      ),
  });
  await tick();
  const entries = [
    ...app.document.querySelectorAll("[data-user-topics-view] .entry"),
  ];
  assert.equal(entries[0].querySelector("h2 a").textContent, "小组话题 #123");
  assert.equal(
    entries[0].querySelector(".content a").textContent,
    "暂无可用摘要",
  );
  assert.equal(entries[0].querySelector(".tools a"), null);
  assert.equal(entries[1].querySelector("h2 a").textContent, "章节 #123");
  assert.equal(
    entries[1].querySelector(".tools span").textContent,
    "只有显示名称",
  );
  assert.equal(entries[1].querySelector(".tools a"), null);
  assert.ok(
    app.requests.every(
      ({ request }) => request.pathname === "/v1/search/replies",
    ),
  );
  app.dom.window.close();
});

test("reply cache cannot enter all topics or add topic excerpts", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    respond: (offset, limit, url) =>
      envelope(
        offset === 0
          ? url.pathname.endsWith("replies")
            ? [replyHit(7)]
            : [
                hit(7, {
                  kind: url.pathname.endsWith("subject-topics") ? 1 : 0,
                  title: url.pathname.endsWith("subject-topics")
                    ? "条目主题"
                    : "小组主题",
                }),
              ]
          : [],
        offset,
        limit,
      ),
  });
  await tick();
  navigate(app, "#posts");
  await tick();
  const view = app.document.querySelector("[data-user-topics-view]");
  assert.deepEqual(
    [...view.querySelectorAll("h2.title a")].map((a) => a.textContent),
    ["小组主题", "条目主题"],
  );
  assert.equal(view.querySelector(".content"), null);
  const before = app.requests.length;
  navigate(app, "#posts/replies");
  await tick();
  assert.equal(app.requests.length, before);
  assert.equal(
    view.querySelector("h2.title a").href,
    "https://bgm.tv/group/topic/123#post_7",
  );
  app.dom.window.close();
});

test("reply pages freeze, retain first data and advance raw cursors past duplicates and late replies", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    respond: (offset, limit) =>
      envelope(
        offset === 11
          ? [
              replyHit(1, { excerpt: "不应覆盖旧摘要" }),
              ...Array.from({ length: 9 }, (_, i) => replyHit(12 + i)),
            ]
          : offset === 21
            ? [replyHit(99, { createdAt: 1697299999 })]
            : Array.from({ length: offset ? limit : 11 }, (_, i) =>
                replyHit(offset + i + 1),
              ),
        offset,
        limit,
      ),
  });
  await tick();
  const view = app.document.querySelector("[data-user-topics-view]");
  const first = [...view.querySelectorAll("h2 a")].map((a) => a.href);
  assert.equal(first.length, 10);
  assert.equal(view.querySelector('[data-page-link="2"]').textContent, "2");
  assert.equal(view.querySelector('[data-page-link="3"]').textContent, "3");
  view.querySelector("[data-next]").click();
  await tick();
  assert.equal(view.querySelector("[data-page]").textContent, "2");
  assert.deepEqual(
    [...view.querySelectorAll("h2 a")].map((a) => a.hash),
    [
      "#post_11",
      "#post_12",
      "#post_13",
      "#post_14",
      "#post_15",
      "#post_16",
      "#post_17",
      "#post_18",
      "#post_19",
      "#post_20",
    ],
  );
  assert.deepEqual(
    app.requests.map(({ request }) => [
      request.searchParams.get("offset"),
      request.searchParams.get("limit"),
    ]),
    [
      ["0", "50"],
      ["11", "50"],
      ["21", "50"],
      ["22", "50"],
      ["72", "31"],
      ["103", "1"],
    ],
  );
  view.querySelector('[data-page-link="1"]').click();
  await tick();
  assert.deepEqual(
    [...view.querySelectorAll("h2 a")].map((a) => a.href),
    first,
  );
  assert.equal(view.querySelector(".content a").textContent, "本人发言");
  const before = app.requests.length;
  navigate(app, "#other");
  navigate(app, "#posts/replies");
  await tick();
  assert.equal(app.requests.length, before);
  app.dom.window.close();
});

test("reply expansion pauses after three duplicate batches and stays paused on reentry", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    respond: (offset, limit) => envelope([replyHit(1)], offset, limit),
  });
  await tick();
  assert.equal(app.requests.length, 4);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /连续三批没有有效新增/,
  );
  navigate(app, "#other");
  navigate(app, "#posts/replies");
  await tick();
  assert.equal(app.requests.length, 4);
  app.dom.window.close();
});

test("failed reply pagination retains the old page and explicitly retries the same cursor", async () => {
  let bad = true;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    respond: (offset, limit) =>
      envelope(
        offset === 11 && bad
          ? [replyHit(12, { id: Number.MAX_SAFE_INTEGER + 1 })]
          : Array.from({ length: offset ? limit : 11 }, (_, i) =>
              replyHit(offset + i + 1),
            ),
        offset,
        limit,
      ),
  });
  await tick();
  const view = app.document.querySelector("[data-user-topics-view]");
  view.querySelector("[data-next]").click();
  await tick();
  assert.equal(view.querySelector("[data-page]").textContent, "1");
  assert.equal(view.querySelectorAll(".item").length, 10);
  assert.match(
    view.querySelector("[role=status]").textContent,
    /评论回复数据无效/,
  );
  bad = false;
  view.querySelector("a.chiiBtn").click();
  await tick();
  assert.equal(view.querySelector("[data-page]").textContent, "2");
  assert.deepEqual(
    app.requests.map(({ request }) => request.searchParams.get("offset")),
    ["0", "11", "11", "61"],
  );
  assert.equal(app.scrolls.length, 1);
  app.dom.window.close();
});

test("a reply 429 pauses topic queries too and requires explicit retry after cooldown", async () => {
  let now = 0;
  const calls = [];
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    timers: { now: () => now },
    fetchOverride: async (input) => {
      const url = new URL(input);
      calls.push(url.pathname);
      if (calls.length === 1)
        return { ok: false, status: 429, headers: { get: () => null } };
      return {
        ok: true,
        json: async () =>
          envelope(
            [],
            Number(url.searchParams.get("offset")),
            Number(url.searchParams.get("limit")),
          ),
      };
    },
  });
  await tick();
  navigate(app, "#posts");
  await tick();
  assert.equal(calls.length, 1);
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(calls.length, 1);
  now = 60000;
  await tick();
  assert.equal(calls.length, 1);
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.deepEqual(calls, [
    "/v1/search/replies",
    "/v1/search/group-topics",
    "/v1/search/subject-topics",
  ]);
  app.dom.window.close();
});

for (const invalid of [
  { source: "future" },
  { source: "__proto__" },
  { containerID: 0 },
  { excerpt: null },
  { containerTitle: 123 },
  { parentID: -1 },
  { creatorUsername: 123 },
  { createdAt: 8_640_000_000_000 },
])
  test(`damaged reply batch is not partially accepted: ${JSON.stringify(invalid)}`, async () => {
    const app = setup({
      url: "https://bgm.tv/user/sai/blog#posts/replies",
      respond: (offset, limit) =>
        envelope([replyHit(1), replyHit(2, invalid)], offset, limit),
    });
    await tick();
    assert.equal(
      app.document.querySelector("[data-user-topics-view] .entry-list"),
      null,
    );
    assert.match(
      app.document.querySelector("[role=status]").textContent,
      /评论回复数据无效/,
    );
    app.dom.window.close();
  });

test("invalid reply source rejects the whole batch instead of guessing a link", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/replies",
    respond: (offset, limit) =>
      envelope(
        [replyHit(1), replyHit(2, { source: ["group"] })],
        offset,
        limit,
      ),
  });
  await tick();
  assert.equal(
    app.document.querySelector("[data-user-topics-view] .entry-list"),
    null,
  );
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /评论回复数据无效/,
  );
  app.dom.window.close();
});
