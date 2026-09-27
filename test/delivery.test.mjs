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
