import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setup,
  enter,
  tick,
  hit,
  envelope,
  html,
} from "./support/posts-page.mjs";
import { start } from "../src/entry.mjs";

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

test("removing the footer while active leaves the view until a normal exit", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  const columns = app.document.querySelector(".columns");
  const root = app.document.querySelector("[data-user-topics-view]");
  app.document.querySelector("#footer").remove();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.notEqual(app.window.getComputedStyle(columns).display, "none");
  assert.equal(root.isConnected, false);
  app.dom.window.close();
});

test("an active same-hash entry click neither revalidates the host nor scrolls", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts" });
  await tick();
  const root = app.document.querySelector("[data-user-topics-view]");
  app.document
    .querySelector(".columns")
    .parentElement.classList.remove("mainWrapper");
  const before = app.scrolls.length;
  app.document.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
  assert.equal(app.document.querySelector("[data-user-topics-error]"), null);
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
  assert.equal(app.requests.length, 4);
  app.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(app.requests.length, 4);
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  const main = app.document.querySelector(".columns").parentElement;
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  main.classList.remove("mainWrapper");
  app.window.location.hash = "#posts";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  main.classList.add("mainWrapper");
  const before = app.scrolls.length;
  app.document.querySelector("[data-user-topics-link] a").click();
  await tick();
  assert.ok(app.document.querySelector("[data-user-topics-view]"));
  assert.equal(app.requests.length, 4);
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(app.scrolls.length, before);
  app.dom.window.close();
});

test("host class and ID changes do not suspend the view or expose hidden content", async () => {
  for (const [selector, attribute, value] of [
    [".mainWrapper:has(> .columns)", "class", "not-mainWrapper"],
    ["#headerProfile", "id", "not-headerProfile"],
  ]) {
    const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
    const columns = app.document.querySelector(".columns");
    const root = app.document.querySelector("[data-user-topics-view]");
    app.document.querySelector(selector).setAttribute(attribute, value);
    await tick();
    assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
    assert.equal(app.window.getComputedStyle(columns).display, "none");
    app.window.location.hash = "#other";
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.notEqual(app.window.getComputedStyle(columns).display, "none");
    app.dom.window.close();
  }
});

test("moving the personal navigation does not suspend the active view", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  const nav = app.document.querySelector("#headerProfile .navTabs");
  const root = app.document.querySelector("[data-user-topics-view]");
  app.document.body.append(nav);
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(root.isConnected, false);
  assert.equal(nav.isConnected, true);
  app.dom.window.close();
});

test("a moved owned view is still removed on normal exit, not automatically", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  await tick();
  const columns = app.document.querySelector(".columns");
  const root = app.document.querySelector("[data-user-topics-view]");
  app.document.body.append(root);
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(root.isConnected, false);
  assert.notEqual(app.window.getComputedStyle(columns).display, "none");
  app.dom.window.close();
});

test("removing category navigation does not suspend or automatically repair the view", async () => {
  const app = setup({ url: "https://bgm.tv/user/sai/blog#posts/group" });
  await tick();
  const root = app.document.querySelector("[data-user-topics-view]");
  app.document.querySelector("[data-user-topics-subnav]").remove();
  await tick();
  assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
  assert.equal(app.document.querySelector("[data-user-topics-subnav]"), null);
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(root.isConnected, false);
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

test("missing mounting structure keeps the entry but fails visibly without requests", () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    markup: html.replace('id="footer"', 'id="missing-footer"'),
  });
  assert.equal(
    app.document.querySelectorAll("[data-user-topics-link]").length,
    1,
  );
  assert.equal(app.requests.length, 0);
  assert.equal(
    app.document.querySelector("[data-user-topics-error]")?.textContent,
    "帖子视图挂载失败：未找到正文中的 footer 挂载边界。",
  );
  assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
  assert.equal(app.document.querySelector("[data-user-topics-subnav]"), null);
  assert.equal(app.document.querySelector("[data-user-topics-active]"), null);
  app.dom.window.close();
});
