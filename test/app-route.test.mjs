import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, enter, tick, hit, envelope, html } from "./app-support.mjs";
import { start } from "../src/entry.mjs";

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
