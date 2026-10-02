import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, enter, tick, hit, envelope, html } from "./app-support.mjs";
import { start } from "../src/entry.mjs";

test("subject direct link and four exact category hashes use the subject endpoint", async () => {
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
    ["#posts", "#posts/group", "#posts/subject", "#posts/replies"],
  );
  app.dom.window.close();
});

test("category heading and browser title follow the active category and restore on exit", async () => {
  const app = setup();
  app.document.title = "Sai🖖的日志";
  const heading = () =>
    app.document.querySelector(
      "[data-user-topics-view] > .flex-center-v > h2.title",
    )?.textContent;
  app.window.location.hash = "#posts";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  assert.equal(heading(), "Sai🖖的帖子");
  assert.equal(app.document.title, "Sai🖖的帖子");
  for (const [hash, expected] of [
    ["#posts/group", "Sai🖖的小组话题"],
    ["#posts/subject", "Sai🖖的条目讨论"],
    ["#posts/replies", "Sai🖖的评论回复"],
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
