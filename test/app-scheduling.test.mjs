import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, enter, tick, hit, envelope } from "./app-support.mjs";

test("a switched foreground stream starts before background continuation", async () => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("group-topics") && offset === 0
        ? new Promise((resolve) => {
            release = () => resolve(envelope([hit(1)], offset, limit));
          })
        : envelope([], offset, limit),
  });
  await tick();
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  release();
  await tick();
  assert.deepEqual(
    app.requests.slice(0, 2).map(({ request }) => request.pathname),
    ["/v1/search/group-topics", "/v1/search/subject-topics"],
  );
  app.dom.window.close();
});

test("timeout frees the stream even when fetch ignores abort", async () => {
  let expire;
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers: {
      setTimeout: (fn) => {
        expire = fn;
        return 1;
      },
      clearTimeout: () => {},
    },
    fetchOverride: async (input) => {
      calls++;
      if (calls === 1) return new Promise(() => {});
      const url = new URL(input);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 1);
  expire();
  await tick();
  assert.match(app.document.querySelector("[role=status]").textContent, /超时/);
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(calls, 2);
  app.dom.window.close();
});

test("an all-target failure stops further requests for that target while caching in-flight success", async () => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("group-topics")
        ? Promise.reject(Error("group failed"))
        : new Promise((resolve) => {
            release = () =>
              resolve(envelope([hit(1, { kind: 1 })], offset, limit));
          }),
  });
  await tick();
  release();
  await tick();
  assert.deepEqual(
    app.requests.map(({ request }) => request.pathname),
    ["/v1/search/group-topics", "/v1/search/subject-topics"],
  );
  app.dom.window.close();
});

test("Retry-After zero permits immediate explicit retry but never auto-resumes", async () => {
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers: { now: () => 1000 },
    fetchOverride: async (input) => {
      calls++;
      if (calls === 1)
        return { ok: false, status: 429, headers: { get: () => "0" } };
      const url = new URL(input);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 1);
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(calls, 2);
  app.dom.window.close();
});

test("429 pauses queued work until explicit retry after Retry-After", async () => {
  let now = 0;
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers: { now: () => now },
    fetchOverride: async (input) => {
      calls++;
      const url = new URL(input);
      if (calls === 1)
        return { ok: false, status: 429, headers: { get: () => "2" } };
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([hit(1)], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 1);
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(calls, 1);
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(calls, 1);
  now = 2000;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.ok(calls > 1);
  app.dom.window.close();
});

test("concurrent 429 responses keep the longest cooldown", async () => {
  let now = 0;
  let calls = 0;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    timers: { now: () => now },
    fetchOverride: async (input) => {
      calls++;
      const url = new URL(input);
      if (calls <= 2)
        return {
          ok: false,
          status: 429,
          headers: {
            get: () => (url.pathname.endsWith("group-topics") ? "10" : "3"),
          },
        };
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return { ok: true, json: async () => envelope([], offset, limit) };
    },
  });
  await tick();
  assert.equal(calls, 2);
  now = 3000;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.equal(calls, 2);
  now = 10000;
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.ok(calls > 2);
  app.dom.window.close();
});

test("switching while a request is pending reuses its result without freezing an unseen page", async () => {
  let deliver;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("group-topics") && offset === 0
        ? new Promise((resolve) => {
            deliver = () => resolve(envelope([hit(1)], offset, limit));
          })
        : envelope([], offset, limit),
  });
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  deliver();
  await tick();
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(
    app.document.querySelector(".entry-list a.l")?.textContent,
    "Topic 1",
  );
  assert.equal(
    app.requests.filter(
      ({ request }) =>
        request.pathname.endsWith("group-topics") &&
        request.searchParams.get("offset") === "0",
    ).length,
    1,
  );
  app.dom.window.close();
});

test("background pagination commits on return without stealing scroll", async () => {
  let release;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit) =>
      offset === 11
        ? new Promise((resolve) => {
            release = () =>
              resolve(
                envelope(
                  Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
                  offset,
                  limit,
                ),
              );
          })
        : envelope(
            Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
            offset,
            limit,
          ),
  });
  await tick();
  app.document.querySelector("[data-next]").click();
  await tick();
  app.window.location.hash = "#posts/subject";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  release();
  await tick();
  const before = app.scrolls.length;
  app.window.location.hash = "#posts/group";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "2");
  assert.equal(app.scrolls.length, before);
  app.dom.window.close();
});

test("leaving and reentering a depleted target does not reset its budget", async () => {
  const app = setup({
    respond: (offset, limit) => envelope([hit(1)], offset, limit),
  });
  enter(app);
  await tick();
  assert.equal(app.requests.length, 3);
  app.window.location.hash = "#other";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  enter(app);
  await tick();
  assert.equal(app.requests.length, 3);
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /无法确定/,
  );
  app.dom.window.close();
});
