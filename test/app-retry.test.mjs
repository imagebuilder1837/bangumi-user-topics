import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, tick, hit, envelope } from "./app-support.mjs";

function clock() {
  let now = 0,
    id = 0;
  const waiting = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      waiting.set(++id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (key) => waiting.delete(key),
    advance(ms) {
      now += ms;
      for (const [key, task] of [...waiting]) {
        if (task.at <= now) {
          waiting.delete(key);
          task.fn();
        }
      }
    },
  };
}

const response = (url) => {
  const offset = Number(url.searchParams.get("offset"));
  const limit = Number(url.searchParams.get("limit"));
  return {
    ok: true,
    json: async () =>
      envelope(
        Array.from({ length: limit }, (_, i) => hit(offset + i + 1)),
        offset,
        limit,
      ),
  };
};

test("a network request gets three attempts with 1s and 2s waits, successful batches are not capped", async (t) => {
  const timers = clock();
  const calls = [];
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers,
    fetchOverride: async (input) => {
      const url = new URL(input);
      calls.push(url);
      if (calls.length < 3) throw Error("offline");
      return response(url);
    },
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(calls.length, 1);
  timers.advance(999);
  await tick();
  assert.equal(calls.length, 1);
  timers.advance(1);
  await tick();
  assert.equal(calls.length, 2);
  timers.advance(1999);
  await tick();
  assert.equal(calls.length, 2);
  timers.advance(1);
  await tick();
  assert.equal(app.document.querySelector("[data-page]")?.textContent, "1");
  assert.deepEqual(
    calls.map((url) => url.searchParams.get("offset")),
    ["0", "0", "0", "50", "100"],
  );
  assert.equal(
    app.document.querySelectorAll("[data-page], [data-page-link]").length,
    10,
  );
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /offline/,
  );
});

test("background continuation can use a free slot while the foreground awaits its response", async (t) => {
  let releaseGroup, releaseReplies;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) => {
      if (url.pathname.endsWith("replies"))
        return new Promise((resolve) => {
          releaseReplies = () => resolve(envelope([], offset, limit));
        });
      if (!offset)
        return new Promise((resolve) => {
          releaseGroup = () =>
            resolve(
              envelope(
                Array.from({ length: limit }, (_, i) => hit(i + 1)),
                offset,
                limit,
              ),
            );
        });
      return response(url).json();
    },
  });
  t.after(async () => {
    releaseGroup?.();
    releaseReplies?.();
    await tick();
    app.dom.window.close();
  });
  await tick();
  app.window.location.hash = "#posts/replies";
  app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
  await tick();
  releaseGroup();
  await tick();
  assert.ok(
    app.requests.some(
      ({ request }) =>
        request.pathname.endsWith("group-topics") &&
        request.searchParams.get("offset") === "50",
    ),
  );
  assert.equal(app.document.title, "Sai🖖的评论回复");
  assert.equal(
    app.document.querySelector("[data-user-topics-view] .entry-list"),
    null,
  );
  releaseReplies();
  await tick();
});

test("only transient HTTP failures retry; malformed responses and 429 stay stopped", async () => {
  for (const [status, expected] of [
    [408, 3],
    [500, 3],
    [599, 3],
    [400, 1],
    [404, 1],
    [600, 1],
    [429, 1],
    [200, 1],
  ]) {
    const timers = clock();
    let calls = 0;
    const app = setup({
      url: "https://bgm.tv/user/sai/blog#posts/group",
      timers,
      fetchOverride: async () => {
        calls++;
        return {
          ok: status === 200,
          status,
          headers: { get: () => "60" },
          json: async () => ({ data: [], pagination: null, meta: {} }),
        };
      },
    });
    try {
      await tick();
      timers.advance(1000);
      await tick();
      timers.advance(2000);
      await tick();
      assert.equal(calls, expected, `HTTP ${status}`);
      assert.equal(app.document.querySelector("[data-page]"), null);
      assert.ok(app.document.querySelector("[role=status] a.chiiBtn"));
    } finally {
      app.dom.window.close();
    }
  }
});

test("a cached page does not hide cooldown errors or auto-resume when the cooldown ends", async (t) => {
  const timers = clock();
  const calls = [];
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    timers,
    fetchOverride: async (input) => {
      const url = new URL(input);
      calls.push(url);
      return calls.length === 2
        ? { ok: false, status: 429, headers: { get: () => "2" } }
        : response(url);
    },
  });
  t.after(() => app.dom.window.close());
  await tick();
  assert.equal(app.document.querySelector("[data-page]").textContent, "1");
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.match(
    app.document.querySelector("[role=status]").textContent,
    /冷却中/,
  );
  assert.equal(calls.length, 2);
  timers.advance(2000);
  await tick();
  assert.equal(calls.length, 2);
  app.document.querySelector("[role=status] a.chiiBtn").click();
  await tick();
  assert.deepEqual(
    calls.map((url) => url.searchParams.get("offset")),
    ["0", "50", "50", "100"],
  );
  assert.doesNotMatch(
    app.document.querySelector("[role=status]").textContent,
    /冷却|频繁/,
  );
  assert.equal(app.scrolls.length, 0);
});

test("response-body transport failures retry, while JSON syntax failures do not", async () => {
  for (const [name, retries] of [
    ["TypeError", true],
    ["AbortError", true],
    ["SyntaxError", false],
  ]) {
    const timers = clock();
    const calls = [];
    const app = setup({
      url: "https://bgm.tv/user/sai/blog#posts/group",
      timers,
      fetchOverride: async (input) => {
        const url = new URL(input);
        calls.push(url);
        if (calls.length < 3)
          return {
            ok: true,
            status: 200,
            json: async () => {
              const error = new Error("body read failed");
              error.name = name;
              throw error;
            },
          };
        return response(url);
      },
    });
    try {
      await tick();
      assert.equal(calls.length, 1, name);
      timers.advance(1000);
      await tick();
      assert.equal(calls.length, retries ? 2 : 1, name);
      timers.advance(2000);
      await tick();
      if (retries) {
        assert.deepEqual(
          calls.map((url) => url.searchParams.get("offset")),
          ["0", "0", "0", "50", "100"],
          name,
        );
        assert.equal(
          app.document.querySelector("[data-page]").textContent,
          "1",
        );
      } else {
        assert.equal(calls.length, 1);
        assert.match(
          app.document.querySelector("[role=status]").textContent,
          /body read failed/,
        );
      }
    } finally {
      app.dom.window.close();
    }
  }
});
