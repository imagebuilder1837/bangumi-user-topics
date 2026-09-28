import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { start } from "../src/entry.mjs";

const blog = readFileSync(
  new URL("./fixtures/blog.html", import.meta.url),
  "utf8",
);
// Representative shapes observed in the production host pages (see docs/external/bangumi.md); preserve the common profile,
// wrapper and footer from the anonymized blog fixture, varying the actual host columns.
const shapes = {
  home: '<div class="columns clearit"><div id="columnA" class="column"><div id="user_home"><input></div></div><div id="columnB" class="column">home sidebar</div></div>',
  index:
    '<div class="columns columns-center"><div id="columnA" class="column column-main"><div id="timeline" class="index-list"></div></div><div id="columnB" class="column column-side-md"></div></div>',
  friends:
    '<div class="columns clearit"><div id="columnUserSingle" class="column"><ul id="memberUserList"><li><input></li></ul></div></div>',
  overview:
    '<div class="columns clearit"><div id="columnA" class="column"><h2 class="title">收藏概览</h2><div class="horizontalOptions clearit"></div></div><div id="columnB" class="column"></div></div>',
  state:
    '<div class="columns clearit"><div id="columnSubjectBrowserA" class="column"><div id="browserTools"></div></div><div id="columnSubjectBrowserB" class="column">collection statistics</div></div>',
  timeline:
    '<div class="columns clearit"><div id="columnTimelineA" class="column"><div id="columnTimelineInnerWrapper" class="clearit"><ul id="timelineTabs" class="timelineTabs clearit"><li><input></li></ul></div></div><div id="columnTimelineB" class="column">timeline sidebar</div></div>',
  groups:
    '<div class="columns clearit"><div id="columnUserSingle" class="column"><ul id="memberGroupList" class="browserMedium"><li><input></li></ul></div></div>',
  mono: '<div class="columns clearit"><div id="columnA" class="column"><div class="section"><input></div></div></div>',
  wiki: '<div class="columns clearit"><div id="columnA" class="column">wiki content</div></div>',
  wikiWide:
    '<div class="columns clearit"><div id="columnA" class="column">wiki content</div><div id="columnB" class="column">wiki sidebar</div></div>',
  blog: null,
};
function markup(shape, subnav = false) {
  const source = shapes[shape]
    ? blog.replace(
        /<div class="columns columns-center">[\s\S]*?(?=<div id="footer">)/,
        shapes[shape],
      )
    : blog;
  return subnav
    ? source
        .replace('<div class="navTabsWrapper">', '<div class="navTabsWrapper">')
        .replace(
          "</ul>\n</div>\n\n</div>",
          '</ul>\n</div><div class="navSubTabsWrapper"><ul class="navSubTabs"><li><a class="focus" href="/user/sai/index"><span>原生子项</span></a></li></ul></div>\n\n</div>',
        )
    : source;
}
function open(
  path,
  shape,
  { subnav = false, source, origin = "bgm.tv", respond } = {},
) {
  const dom = new JSDOM(source || markup(shape, subnav), {
    url: `https://${origin}${path}`,
  });
  dom.window.scrollTo = () => {};
  const requests = [];
  start(dom.window, {
    fetch: async (url, init) => {
      requests.push({ url: new URL(url), init });
      const u = new URL(url);
      const offset = Number(u.searchParams.get("offset"));
      const limit = Number(u.searchParams.get("limit"));
      return {
        ok: true,
        json: async () =>
          respond?.(u) || {
            data:
              offset === 0
                ? [
                    {
                      id: 42,
                      kind: u.pathname.endsWith("group-topics") ? 0 : 1,
                      parentID: 2,
                      title: "示例",
                      replyCount: 0,
                      createdAt: 1697285544,
                      updatedAt: 1697285544,
                    },
                  ]
                : [],
            pagination: { total: 1, offset, limit, totalIsEstimate: false },
            meta: { executionMs: 0 },
          },
      };
    },
  });
  return { dom, window: dom.window, document: dom.window.document, requests };
}
const tick = async () => {
  for (let i = 0; i < 6; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
};
function enter(app) {
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
}

test("every observed host shape reads the target user and preserves original columns and footer on exit", async () => {
  for (const [path, shape, subnav] of [
    ["/user/sai", "home", false],
    ["/user/sai/index", "index", true],
    ["/user/sai/friends", "friends", false],
    ["/anime/list/sai", "overview", true],
    ...["anime", "book", "music", "game", "real"].map((type) => [
      `/${type}/list/sai/collect`,
      "state",
      true,
    ]),
  ]) {
    const origin =
      shape === "index"
        ? "bangumi.tv"
        : shape === "friends"
          ? "chii.in"
          : "bgm.tv";
    const app = open(`${path}?mode=1`, shape, { subnav, origin });
    const d = app.document;
    const columns = d.querySelector(".columns");
    const footer = d.querySelector("#footer");
    const oldSub = d.querySelector(".navSubTabsWrapper");
    assert.equal(!!oldSub, subnav, path);
    const input = columns.querySelector("input");
    if (input) {
      input.value = "preserve";
      input.addEventListener("custom", () => {
        input.value += "!";
      });
    }
    assert.equal(d.querySelectorAll("[data-user-topics-link]").length, 1, path);
    assert.equal(app.requests.length, 0, path);
    enter(app);
    await tick();
    assert.equal(app.requests[0].init.credentials, "omit", path);
    const postsRoot = d.querySelector("[data-user-topics-view]");
    assert.equal(postsRoot.nextElementSibling, footer, path);
    assert.equal(
      app.window.getComputedStyle(postsRoot).paddingTop,
      "10px",
      path,
    );
    assert.equal(d.querySelector(".columns"), columns, path);
    assert.equal(d.querySelector("#footer"), footer, path);
    assert.equal(
      d.querySelector("[data-user-topics-view] .entry-list a.l")?.href,
      `https://${origin}/group/topic/42`,
      `${path}: ${d.querySelector("[role=status]")?.textContent}`,
    );
    assert.equal(
      d.querySelectorAll(".navSubTabsWrapper[data-user-topics-subnav]").length,
      1,
      path,
    );
    assert.equal(
      d.querySelector("[data-user-topics-subnav]").previousElementSibling,
      oldSub || d.querySelector(".navTabsWrapper"),
      path,
    );
    app.window.location.hash = "#other";
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.equal(d.querySelector("[data-user-topics-view]"), null, path);
    assert.equal(d.querySelector("[data-user-topics-subnav]"), null, path);
    assert.equal(oldSub?.isConnected ?? true, true, path);
    if (input) {
      input.dispatchEvent(new app.window.Event("custom"));
      assert.equal(input.value, "preserve!");
    }
    app.dom.window.close();
  }
});

test("existing extension focus is temporarily transferred without replacing its node or state", async () => {
  const source = markup("friends")
    .replace('href="/user/sai/blog" class="focus"', 'href="/user/sai/blog"')
    .replace(
      '<li><a href="/user/sai/index">目录</a></li>',
      '<li><a href="/user/sai/index">目录</a></li><li><a class="focus" href="/user/sai/rev_friends">反向好友</a><input value="kept"></li>',
    );
  const app = open("/user/sai/friends", "friends", { source });
  const ext = app.document.querySelector('.navTabs a[href$="rev_friends"]');
  const field = ext.nextElementSibling;
  enter(app);
  await tick();
  assert.equal(ext.classList.contains("focus"), false);
  assert.equal(
    app.document
      .querySelector("[data-user-topics-link] a")
      .classList.contains("focus"),
    true,
  );
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(ext.classList.contains("focus"), true);
  assert.equal(ext.nextElementSibling, field);
  field.value = "still running";
  enter(app);
  await tick();
  ext.classList.add("external-update");
  await tick();
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(ext.classList.contains("focus"), false);
  assert.equal(ext.classList.contains("external-update"), true);
  assert.equal(field.value, "still running");
  app.dom.window.close();
});

test("a friend's sorting control keeps its listener and hidden-list updates across entry", async () => {
  for (const beforeStart of [true, false]) {
    const app = open("/user/sai/friends", "friends");
    const list = app.document.querySelector("#memberUserList");
    const button = app.document.createElement("button");
    button.textContent = "排序";
    const sort = () => list.append(list.firstElementChild);
    button.addEventListener("click", sort);
    const addSorter = () => list.parentElement.prepend(button);
    if (beforeStart) addSorter();
    enter(app);
    await tick();
    if (!beforeStart) addSorter();
    const last = app.document.createElement("li");
    last.textContent = "new friend";
    list.append(last);
    button.click();
    assert.equal(list.firstElementChild, last);
    app.window.location.hash = "#other";
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.equal(button.isConnected, true);
    assert.equal(list.firstElementChild, last);
    button.click();
    assert.equal(list.lastElementChild, last);
    app.dom.window.close();
  }
});

test("async results do not discard keyboard focus on the category link", async () => {
  let finish;
  const app = open("/user/sai/friends#posts/group", "friends", {
    respond: (u) =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            data: [],
            pagination: {
              total: 0,
              offset: Number(u.searchParams.get("offset")),
              limit: Number(u.searchParams.get("limit")),
              totalIsEstimate: false,
            },
            meta: { executionMs: 0 },
          });
      }),
  });
  const link = app.document.querySelector(
    '[data-user-topics-subnav] a[href="#posts/group"]',
  );
  link.focus();
  await tick();
  finish();
  await tick();
  assert.equal(app.document.activeElement, link);
  assert.equal(link.isConnected, true);
  app.dom.window.close();
});

test("removing the host's original subnavigation ends takeover without resurrecting it", async () => {
  const app = open("/anime/list/sai/collect#posts/group", "state", {
    subnav: true,
  });
  await tick();
  const columns = app.document.querySelector(".columns");
  const nativeSub = app.document.querySelector(
    ".navSubTabsWrapper:not([data-user-topics-subnav])",
  );
  nativeSub.remove();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(app.document.querySelector("[data-user-topics-subnav]"), null);
  assert.equal(app.document.querySelector(".columns"), columns);
  app.dom.window.close();
});

test("a later extension subnavigation remains visible during takeover", async () => {
  const app = open("/anime/list/sai/collect#posts/group", "state", {
    subnav: true,
  });
  await tick();
  const native = app.document.querySelector(
    ".navSubTabsWrapper:not([data-user-topics-subnav])",
  );
  const extension = app.document.createElement("div");
  extension.className = "navSubTabsWrapper";
  extension.innerHTML = '<ul class="navSubTabs"><li>扩展导航</li></ul>';
  native.after(extension);
  await tick();
  assert.equal(app.window.getComputedStyle(native).display, "none");
  assert.notEqual(app.window.getComputedStyle(extension).display, "none");
  assert.ok(app.document.querySelector("[data-user-topics-view]"));
  app.dom.window.close();
});

test("external changes to the original subnavigation marker end takeover without overwriting them", async () => {
  const app = open("/anime/list/sai/collect#posts/group", "state", {
    subnav: true,
  });
  await tick();
  const native = app.document.querySelector(
    ".navSubTabsWrapper[data-user-topics-original-subnav]",
  );
  native.dataset.userTopicsOriginalSubnav = "external";
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(native.dataset.userTopicsOriginalSubnav, "external");
  app.dom.window.close();
});

test("the entry follows the matched path even where takeover cannot be verified", () => {
  const stripped = blog.replace(
    /<div class="columns columns-center">[\s\S]*?(?=<div id="footer">)/,
    "",
  );
  for (const path of ["/user/sai#posts", "/user/sai/timeline#posts"]) {
    const app = open(path, "home", { source: stripped });
    assert.equal(
      app.document.querySelectorAll("[data-user-topics-link]").length,
      1,
      path,
    );
    assert.equal(app.requests.length, 0, path);
    app.dom.window.close();
  }
});

test("path and markup disagreement no longer blocks takeover", async () => {
  for (const [path, shape, source] of [
    ["/user/sai/timeline#posts", "home", undefined],
    ["/anime/list/sai/wish#posts", "overview", undefined],
    ["/anime/list/sai#posts", "state", undefined],
    [
      "/user/sai#posts",
      "home",
      markup("home").replace('<div id="user_home"><input></div>', ""),
    ],
  ]) {
    const app = open(path, shape, { source });
    await tick();
    assert.ok(app.requests[0], path);
    assert.ok(app.document.querySelector("[data-user-topics-view]"), path);
    app.dom.window.close();
  }
});

test("identity mismatch and out-of-scope paths never insert an entry", () => {
  for (const [path, shape, source] of [
    ["/user/other/friends#posts", "friends", undefined],
    ["/user/sai/doujin#posts", "home", undefined],
    ["/user/sai/whatever#posts", "home", undefined],
  ]) {
    const app = open(path, shape, { source });
    assert.equal(
      app.document.querySelector("[data-user-topics-link]"),
      null,
      path,
    );
    assert.equal(app.requests.length, 0, path);
    app.dom.window.close();
  }
});

test("every matched user page shows the entry before any takeover", () => {
  for (const [path, shape] of [
    ["/user/sai/mono", "mono"],
    ["/user/sai/mono/character", "mono"],
    ["/user/sai/mono/person", "mono"],
    ["/user/sai/groups", "groups"],
    ["/user/sai/wiki", "wiki"],
    ["/user/sai/wiki/character_cast", "wiki"],
    ["/user/sai/timeline", "timeline"],
    ["/user/sai/rev_friends", "friends"],
    ["/user/sai/index/collect", "index"],
    ["/user/sai/blog/tag/alter", "blog"],
  ]) {
    const app = open(path, shape);
    assert.equal(
      app.document.querySelectorAll("[data-user-topics-link]").length,
      1,
      path,
    );
    assert.equal(app.requests.length, 0, path);
    app.dom.window.close();
  }
});

test("newly scoped pages take over and restore like the original shapes", async () => {
  for (const [path, shape, subnav] of [
    ["/user/sai/timeline", "timeline", false],
    ["/user/sai/groups", "groups", false],
    ["/user/sai/mono", "mono", true],
    ["/user/sai/wiki", "wiki", true],
    ["/user/sai/wiki/character_cast", "wikiWide", true],
    ["/user/sai/rev_friends", "friends", false],
    ["/user/sai/index/collect", "index", true],
    ["/user/sai/blog/tag/alter", "blog", false],
  ]) {
    const app = open(`${path}#posts/group`, shape, { subnav });
    await tick();
    const d = app.document;
    const columns = d.querySelector(".columns");
    const footer = d.querySelector("#footer");
    assert.ok(app.requests[0], path);
    assert.equal(!!d.querySelector("[data-user-topics-view]"), true, path);
    assert.equal(app.window.getComputedStyle(columns).display, "none", path);
    app.window.location.hash = "#other";
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.equal(d.querySelector("[data-user-topics-view]"), null, path);
    assert.equal(d.querySelector(".columns"), columns, path);
    assert.equal(d.querySelector("#footer"), footer, path);
    assert.equal(
      d.querySelector(".columns").parentElement.querySelector(".columns"),
      columns,
      path,
    );
    app.dom.window.close();
  }
});

test("a sibling component bar before the columns is hidden during takeover and restored on exit", async () => {
  const source = markup("friends").replace(
    '<div class="columns clearit"><div id="columnUserSingle"',
    '<div class="friend-sorter-bar">排序条</div><div class="columns clearit"><div id="columnUserSingle"',
  );
  const app = open("/user/sai/friends#posts/group", "friends", { source });
  await tick();
  const d = app.document;
  const bar = d.querySelector(".friend-sorter-bar");
  const columns = d.querySelector(".columns");
  assert.equal(bar.previousElementSibling, null);
  assert.ok(app.requests[0]);
  assert.equal(!!d.querySelector("[data-user-topics-view]"), true);
  assert.equal(app.window.getComputedStyle(columns).display, "none");
  assert.equal(app.window.getComputedStyle(bar).display, "none");
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(d.querySelector(".columns"), columns);
  assert.equal(bar.isConnected, true);
  assert.notEqual(app.window.getComputedStyle(bar).display, "none");
  app.dom.window.close();
});

test("a component column inside the columns does not block takeover", async () => {
  // bangumi-friend-tag inserts its panel column inside .columns after
  // #columnUserSingle; takeover only needs the footer boundary, so the
  // friend-tag scenario must mount.
  const app = open("/user/sai/friends", "friends");
  const columns = app.document.querySelector(".columns");
  const panel = app.document.createElement("div");
  panel.id = "friendTagPanelColumn";
  panel.className = "column";
  columns.querySelector("#columnUserSingle").after(panel);
  enter(app);
  await tick();
  const d = app.document;
  assert.ok(app.requests[0]);
  assert.equal(!!d.querySelector("[data-user-topics-view]"), true);
  assert.equal(d.querySelector("[data-user-topics-error]"), null);
  assert.equal(app.window.getComputedStyle(columns).display, "none");
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(d.querySelector(".columns"), columns);
  assert.equal(panel.isConnected, true);
  app.dom.window.close();
});

test("an extension subnavigation before the native one does not block takeover", async () => {
  const source = markup("state", true).replace(
    '<div class="navSubTabsWrapper">',
    '<div class="navSubTabsWrapper"><ul class="navSubTabs"><li><a href="#ext">扩展导航</a></li></ul></div><div class="navSubTabsWrapper">',
  );
  const app = open("/anime/list/sai/collect#posts/group", "state", { source });
  await tick();
  const d = app.document;
  const extension = d.querySelector(".navSubTabsWrapper");
  const native = extension.nextElementSibling;
  assert.ok(app.requests[0]);
  assert.ok(d.querySelector("[data-user-topics-view]"));
  assert.equal(app.window.getComputedStyle(extension).display, "none");
  assert.notEqual(app.window.getComputedStyle(native).display, "none");
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.notEqual(app.window.getComputedStyle(extension).display, "none");
  app.dom.window.close();
});

test("an unverifiable page keeps the entry but surfaces a visible mount error on demand", async () => {
  const source = blog.replace(
    /<div class="columns columns-center">[\s\S]*?(?=<div id="footer">)/,
    "",
  );
  const app = open("/user/sai#posts", "home", { source });
  const d = app.document;
  await tick();
  assert.equal(d.querySelector(".columns"), null);
  assert.equal(app.requests.length, 0);
  const panel = d.querySelector("[data-user-topics-error]");
  assert.equal(panel?.textContent, "无法安全挂载帖子视图");
  assert.equal(panel.style.textAlign, "center");
  assert.equal(panel.style.margin, "6px auto 0px");
  assert.equal(d.querySelector("[data-user-topics-view]"), null);
  assert.equal(d.querySelector("[data-user-topics-subnav]"), null);
  d.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.equal(d.querySelectorAll("[data-user-topics-error]").length, 1);
  assert.equal(app.requests.length, 0);
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(d.querySelector("[data-user-topics-error]"), null);
  app.dom.window.close();
});

test("repairing the structure lets the same-hash entry click mount the view", async () => {
  const source = blog.replace(
    /<div class="columns columns-center">[\s\S]*?(?=<div id="footer">)/,
    "",
  );
  const app = open("/user/sai#posts", "home", { source });
  const d = app.document;
  await tick();
  assert.equal(!!d.querySelector("[data-user-topics-error]"), true);
  const footer = d.querySelector("#footer");
  const columns = d.createElement("div");
  columns.className = "columns";
  columns.innerHTML = '<div id="columnA" class="column"></div>';
  footer.before(columns);
  d.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.equal(d.querySelector("[data-user-topics-error]"), null);
  assert.ok(app.requests[0]);
  assert.equal(!!d.querySelector("[data-user-topics-view]"), true);
  app.dom.window.close();
});
