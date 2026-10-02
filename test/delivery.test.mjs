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
const template = readFileSync(
  new URL("../src/metadata.txt", import.meta.url),
  "utf8",
);
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("installable bundle carries the exact human-maintained header and no development imports", () => {
  const header = template.replace("{{VERSION}}", version).trimEnd();
  assert.ok(bundle.startsWith(`${header}\n\n`));
  assert.equal((bundle.match(/==UserScript==/g) || []).length, 1);
  assert.doesNotMatch(
    bundle,
    /Development bundle only|^\s*(?:import|export)\s|\bmodule\.exports\b|sourceMappingURL/m,
  );
  assert.equal(bundle.includes("{{VERSION}}"), false);
});

test("installable version agrees with the dependency lockfile", () => {
  assert.equal(lock.version, version);
  assert.equal(lock.packages[""].version, version);
});

test("installable bundle initializes from its metadata-bearing single file", () => {
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

test("installable bundle handles another host, both streams, category navigation and exit", async () => {
  const friend = html.replace(
    /<div class="columns columns-center">[\s\S]*?(?=<div id="footer">)/,
    '<div class="columns clearit"><div id="columnUserSingle" class="column"><ul id="memberUserList"><li>好友</li></ul></div></div>',
  );
  const dom = new JSDOM(friend, {
    url: "https://chii.in/user/sai/friends#posts",
    runScripts: "outside-only",
  });
  dom.window.scrollTo = () => {};
  const requests = [];
  dom.window.fetch = async (url, init) => {
    const u = new URL(url);
    requests.push({
      kind: u.pathname.endsWith("group-topics") ? "group" : "subject",
      credentials: init.credentials,
    });
    return {
      ok: true,
      json: async () => ({
        data: [],
        pagination: {
          total: 0,
          offset: Number(u.searchParams.get("offset")),
          limit: Number(u.searchParams.get("limit")),
          totalIsEstimate: false,
        },
        meta: { executionMs: 0 },
      }),
    };
  };
  const columns = dom.window.document.querySelector(".columns");
  dom.window.eval(bundle);
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(requests, [
    { kind: "group", credentials: "omit" },
    { kind: "subject", credentials: "omit" },
  ]);
  assert.equal(
    dom.window.document.querySelectorAll("[data-user-topics-subnav] a").length,
    4,
  );
  dom.window.location.hash = "#posts/group";
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  for (let i = 0; i < 4; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    dom.window.document.querySelector("[data-user-topics-subnav] a.focus").hash,
    "#posts/group",
  );
  dom.window.location.hash = "#elsewhere";
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  assert.equal(dom.window.document.querySelector(".columns"), columns);
  assert.equal(
    dom.window.document.querySelector("[data-user-topics-view]"),
    null,
  );
  dom.window.close();
});

test("installed all-posts view retries a failed stream without refetching the other, then survives leaving", async () => {
  const dom = new JSDOM(html, {
    url: "https://bangumi.tv/user/sai/blog#posts",
    runScripts: "outside-only",
  });
  dom.window.scrollTo = () => {};
  let failSubject = true;
  const requests = [];
  dom.window.fetch = async (url, init) => {
    const query = new URL(url);
    const group = query.pathname.endsWith("group-topics");
    const offset = Number(query.searchParams.get("offset"));
    const limit = Number(query.searchParams.get("limit"));
    requests.push({ group, offset, credentials: init.credentials });
    if (!group && failSubject) throw Error("subject unavailable");
    return {
      ok: true,
      json: async () => ({
        data: Array.from({ length: limit }, (_, i) => ({
          id: offset + i + 1,
          kind: group ? 0 : 1,
          parentID: group ? 2 : 307,
          title: `讨论 ${offset + i + 1}`,
          replyCount: 0,
          createdAt: group ? 2000 - offset - i : 1000 - offset - i,
          updatedAt: 2000,
        })),
        pagination: { offset, limit, total: 100, totalIsEstimate: false },
        meta: { executionMs: 0 },
      }),
    };
  };
  const tick = async () => {
    for (let i = 0; i < 6; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const columns = dom.window.document.querySelector(".columns");
  dom.window.eval(bundle);
  await tick();
  assert.equal(dom.window.document.querySelector(".entry-list .item"), null);
  assert.match(
    dom.window.document.querySelector("[role=status]").textContent,
    /subject unavailable/,
  );
  failSubject = false;
  dom.window.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(
    dom.window.document.querySelectorAll("[data-user-topics-view] .item")
      .length,
    10,
  );
  assert.equal(requests.filter((request) => request.group).length, 1);
  assert.ok(requests.every((request) => request.credentials === "omit"));
  dom.window.location.hash = "#posts/subject";
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    dom.window.document.querySelector("[data-user-topics-view] a.l").href,
    "https://bangumi.tv/subject/topic/1",
  );
  dom.window.location.hash = "#elsewhere";
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  assert.equal(dom.window.document.querySelector(".columns"), columns);
  dom.window.close();
});

test("installed merged pagination keeps an in-flight result for return without reopening the host", async () => {
  const dom = new JSDOM(html, {
    url: "https://bgm.tv/user/sai/blog#posts",
    runScripts: "outside-only",
  });
  dom.window.scrollTo = () => {};
  let release;
  const requests = [];
  dom.window.fetch = async (url, init) => {
    const query = new URL(url);
    const group = query.pathname.endsWith("group-topics");
    const offset = Number(query.searchParams.get("offset"));
    const limit = Number(query.searchParams.get("limit"));
    requests.push({ group, offset, credentials: init.credentials });
    if (group && offset === 11)
      await new Promise((resolve) => {
        release = resolve;
      });
    return {
      ok: true,
      json: async () => ({
        data: Array.from({ length: limit }, (_, i) => ({
          id: offset + i + 1,
          kind: group ? 0 : 1,
          parentID: group ? 2 : 307,
          title: `主题 ${offset + i + 1}`,
          replyCount: 0,
          createdAt: 2000 - 2 * (offset + i) + (group ? 1 : 0),
          updatedAt: 2000,
        })),
        pagination: { offset, limit, total: 100, totalIsEstimate: false },
        meta: { executionMs: 0 },
      }),
    };
  };
  const tick = async () => {
    for (let i = 0; i < 6; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const columns = dom.window.document.querySelector(".columns");
  dom.window.eval(bundle);
  await tick();
  assert.equal(
    dom.window.document.querySelectorAll("[data-user-topics-view] .item")
      .length,
    10,
  );
  dom.window.document.querySelector("[data-next]").click();
  await tick();
  assert.equal(typeof release, "function");
  dom.window.location.hash = "#other";
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  release();
  await tick();
  assert.equal(
    dom.window.document.querySelector("[data-user-topics-view]"),
    null,
  );
  assert.equal(dom.window.document.querySelector(".columns"), columns);
  const completed = requests.length;
  dom.window.location.hash = "#posts";
  dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    dom.window.document.querySelector("[data-page]").textContent,
    "2",
  );
  assert.equal(
    dom.window.document.querySelector("[data-user-topics-view] a.l").href,
    "https://bgm.tv/group/topic/6",
  );
  assert.equal(requests.length, completed);
  assert.ok(requests.every((request) => request.credentials === "omit"));
  dom.window.close();
});

test("installable bundle completes the group reading and pagination journey", async () => {
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
        meta: { executionMs: 0 },
      }),
    };
  };
  dom.window.eval(bundle);
  dom.window.location.hash = "#posts/group";
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
