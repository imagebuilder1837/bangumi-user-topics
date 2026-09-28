import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, enter, tick, hit, envelope } from "./app-support.mjs";

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
  const pageLinks = () =>
    [
      ...app.document.querySelectorAll(
        "[data-user-topics-view] .page_inner a.p",
      ),
    ].map((a) => a.textContent);
  assert.deepEqual(pageLinks(), ["2", "››"]);
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
  assert.deepEqual(pageLinks(), ["‹‹", "1", "3", "››"]);
  app.document
    .querySelector("[data-user-topics-view] [data-page-link='1']")
    .click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  assert.deepEqual(pageLinks(), ["2", "3", "››"]);
  app.document
    .querySelector("[data-user-topics-view] [data-page-link='3']")
    .click();
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "3");
  assert.equal(
    app.document.querySelector(".entry-list a.l").textContent,
    "Topic 21",
  );
  app.dom.window.close();
});

test("confirmed pages slide in a ten-number window and allow distant jumps", async () => {
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
  const numbers = () =>
    [
      ...app.document.querySelectorAll(
        "[data-user-topics-view] .page_inner [data-page], [data-user-topics-view] .page_inner [data-page-link]",
      ),
    ].map((node) => Number(node.textContent));
  const jump = async (number) => {
    app.document
      .querySelector(`[data-user-topics-view] [data-page-link='${number}']`)
      .click();
    await tick();
  };
  for (let page = 1; page < 13; page++) {
    app.document.querySelector("[data-user-topics-view] [data-next]").click();
    await tick();
  }
  assert.deepEqual(numbers(), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  await jump(5);
  assert.deepEqual(numbers(), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(app.document.querySelector("[data-page]").textContent, "5");
  await jump(3);
  assert.deepEqual(numbers(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await jump(1);
  assert.deepEqual(numbers(), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await jump(10);
  assert.deepEqual(numbers(), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
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
