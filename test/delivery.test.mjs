import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const html = readFileSync(
  new URL("./fixtures/blog.html", import.meta.url),
  "utf8",
);
const bundle = readFileSync(
  new URL("../src/index.user.js", import.meta.url),
  "utf8",
);

test("development bundle initializes against a real blog structure without metadata or imports", () => {
  assert.match(bundle, /Development bundle only/);
  assert.doesNotMatch(bundle, /==UserScript==|\bimport\s+.*from/);
  const dom = new JSDOM(html, {
    url: "https://chii.in/user/sai/blog",
    runScripts: "outside-only",
  });
  dom.window.fetch = () => {
    throw new Error("ordinary page must not fetch");
  };
  dom.window.eval(bundle);
  assert.equal(
    dom.window.document.querySelector("[data-user-topics-link] a").textContent,
    "帖子",
  );
  dom.window.close();
});

test("development bundle completes the group reading and pagination journey", async () => {
  const dom = new JSDOM(html, {
    url: "https://bgm.tv/user/sai/blog",
    runScripts: "outside-only",
  });
  dom.window.scrollTo = () => {};
  const requests = [];
  dom.window.fetch = async (url) => {
    const query = new URL(url);
    const offset = Number(query.searchParams.get("offset"));
    const limit = Number(query.searchParams.get("limit"));
    requests.push({ offset, limit });
    return {
      ok: true,
      json: async () => ({
        data: Array.from({ length: limit }, (_, i) => ({
          id: offset + i + 1,
          kind: 0,
          parentID: 2,
          title: `讨论 ${offset + i + 1}`,
          replyCount: 0,
          createdAt: 1697285544 - offset - i,
          updatedAt: 1697285544,
        })),
        pagination: { offset, limit, total: 100, totalIsEstimate: false },
        meta: {},
      }),
    };
  };
  dom.window.eval(bundle);
  dom.window.document.querySelector("[data-user-topics-link] a").click();
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    dom.window.document.querySelectorAll("[data-user-topics-view] .item")
      .length,
    10,
  );
  dom.window.document.querySelector("[data-next]").click();
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    dom.window.document.querySelector("[data-page]").textContent,
    "2",
  );
  assert.equal(
    dom.window.document.querySelector("[data-user-topics-view] a.l")
      .textContent,
    "讨论 11",
  );
  assert.deepEqual(requests, [
    { offset: 0, limit: 11 },
    { offset: 11, limit: 10 },
  ]);
  dom.window.close();
});
