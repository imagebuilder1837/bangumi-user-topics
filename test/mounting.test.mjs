import { test } from "node:test";
import assert from "node:assert/strict";
import {
  setup,
  enter,
  tick,
  html,
  hit,
  envelope,
} from "./support/posts-page.mjs";

const failureText = (app) =>
  app.document.querySelector("[data-user-topics-error]")?.textContent;

test("a recognizable navigation reports why the entry cannot be inserted", () => {
  const app = setup({
    markup: html.replace('href="/user/sai/blog"', 'href="/user/sai/friends"'),
  });
  try {
    assert.equal(app.document.querySelector("[data-user-topics-link]"), null);
    assert.equal(app.requests.length, 0);
    assert.equal(
      failureText(app),
      "帖子入口插入失败：个人导航中未找到目标用户的日志链接。",
    );
    assert.equal(
      app.document
        .querySelector("[data-user-topics-error]")
        .getAttribute("role"),
      "alert",
    );
  } finally {
    app.dom.window.close();
  }
});

test("mount failures update one reason panel and the entry retries without scrolling", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    markup: html.replace('id="footer"', 'id="missing-footer"'),
  });
  try {
    assert.equal(
      failureText(app),
      "帖子视图挂载失败：未找到正文中的 footer 挂载边界。",
    );
    const panel = app.document.querySelector("[data-user-topics-error]");
    const main = app.document.querySelector(".columns").parentElement;
    const entry = app.document.querySelector("[data-user-topics-link] a");
    main.classList.remove("mainWrapper");
    entry.click();
    await tick();
    assert.equal(
      failureText(app),
      "帖子视图挂载失败：未找到可挂载的正文容器。",
    );
    assert.equal(app.document.querySelector("[data-user-topics-error]"), panel);
    assert.equal(
      app.document.querySelectorAll("[data-user-topics-error]").length,
      1,
    );
    assert.equal(app.requests.length, 0);
    assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
    assert.notEqual(
      app.window.getComputedStyle(app.document.querySelector(".columns"))
        .display,
      "none",
    );
    main.classList.add("mainWrapper");
    app.document.querySelector("#missing-footer").id = "footer";
    entry.click();
    await tick();
    assert.equal(failureText(app), undefined);
    assert.ok(app.document.querySelector("[data-user-topics-view]"));
    assert.equal(app.scrolls.length, 0);
  } finally {
    app.dom.window.close();
  }
});

test("active DOM changes do not suspend publication or category switches", async () => {
  let deliver;
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    respond: (offset, limit, url) =>
      url.pathname.endsWith("subject-topics") || offset
        ? envelope([], offset, limit)
        : new Promise((resolve) => {
            deliver = () => resolve(envelope([hit(1)], offset, limit));
          }),
  });
  try {
    await tick();
    const root = app.document.querySelector("[data-user-topics-view]");
    app.document.querySelector("#footer").remove();
    await tick();
    assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
    deliver();
    await tick();
    assert.equal(root.querySelector(".entry-list a.l")?.textContent, "Topic 1");
    app.window.location.hash = "#posts/subject";
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    await tick();
    assert.equal(app.document.querySelector("[data-user-topics-view]"), root);
    assert.equal(failureText(app), undefined);
    app.window.location.hash = "#other";
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
    enter(app);
    await tick();
    assert.equal(
      failureText(app),
      "帖子视图挂载失败：未找到正文中的 footer 挂载边界。",
    );
  } finally {
    deliver?.();
    app.dom.window.close();
  }
});

test("optional host shapes do not block mounting or reversible hiding", async () => {
  const markup = html
    .replace('id="headerNeue2"', 'id="other-header"')
    .replace('class="subjectNav"', 'class="extension-profile-layout"')
    .replace('class="navTabsWrapper"', 'class="extension-tabs-layout"')
    .replace('class="columns columns-center"', 'class="extension-content"')
    .replace(
      '<li><a href="/user/sai/blog"',
      '<li><span>装饰</span><a href="/user/sai/blog"',
    )
    .replace(
      '</div><div class="mainWrapper mainXL">',
      '</div><aside>其他组件</aside><div class="mainWrapper mainXL">',
    );
  const app = setup({ markup });
  try {
    const content = app.document.querySelector(".extension-content");
    const field = content.querySelector("input");
    field.value = "preserved";
    field.focus();
    enter(app);
    await tick();
    assert.ok(app.document.querySelector("[data-user-topics-view]"));
    assert.equal(app.window.getComputedStyle(content).display, "none");
    field.blur();
    app.window.location.hash = "#other";
    app.window.dispatchEvent(new app.window.HashChangeEvent("hashchange"));
    assert.notEqual(app.window.getComputedStyle(content).display, "none");
    assert.equal(field.value, "preserved");
    assert.equal(app.document.activeElement, field);
    assert.equal(content.isConnected, true);
  } finally {
    app.dom.window.close();
  }
});

test("equivalent key encodings and duplicate same-user blog links share one entry", async () => {
  const app = setup({
    url: "https://bgm.tv/user/%73ai/blog#posts/group",
    markup: html.replace(
      '<li><a href="/user/sai/index">目录</a></li>',
      '<li><a href="/user/%73ai/blog">日志副本</a></li><li><a href="/user/sai/index">目录</a></li>',
    ),
  });
  try {
    await tick();
    assert.equal(
      app.document.querySelectorAll("[data-user-topics-link]").length,
      1,
    );
    assert.equal(
      app.document.querySelector("[data-user-topics-link]")
        .previousElementSibling.textContent,
      "日志",
    );
    assert.ok(app.document.querySelector("[data-user-topics-view]"));
    assert.equal(app.requests[0].request.searchParams.get("q"), "user:sai");
  } finally {
    app.dom.window.close();
  }
});

test("a malformed navigation URL reports a controlled entry failure", () => {
  const app = setup({
    markup: html.replace('href="/user/sai/blog"', 'href="http://["'),
  });
  try {
    assert.equal(app.document.querySelector("[data-user-topics-link]"), null);
    assert.equal(app.requests.length, 0);
    assert.equal(
      failureText(app),
      "帖子入口插入失败：个人导航中未找到目标用户的日志链接。",
    );
  } finally {
    app.dom.window.close();
  }
});

test("missing personal navigation remains silent even on a direct posts hash", () => {
  for (const markup of [
    html.replace('id="headerProfile"', 'id="other-profile"'),
    html.replace('class="navTabs"', 'class="other-tabs"'),
  ]) {
    const warnings = [];
    const app = setup({
      markup,
      url: "https://bgm.tv/user/sai/blog#posts",
      beforeStart: (window) => {
        window.console.warn = (...args) => warnings.push(args);
      },
    });
    try {
      assert.equal(app.document.querySelector("[data-user-topics-link]"), null);
      assert.equal(failureText(app), undefined);
      assert.equal(app.requests.length, 0);
      assert.deepEqual(warnings, []);
    } finally {
      app.dom.window.close();
    }
  }
});

test("nickname de-linking after entry insertion and after activation never blocks posts", async () => {
  for (const afterActivation of [false, true]) {
    const app = setup();
    try {
      if (afterActivation) {
        enter(app);
        await tick();
      }
      const nickname = app.document.querySelector("h1 .name > a");
      nickname.replaceWith(app.document.createTextNode(nickname.textContent));
      if (!afterActivation) enter(app);
      await tick();
      assert.ok(app.document.querySelector("[data-user-topics-view]"));
      assert.equal(app.requests[0].request.searchParams.get("q"), "user:sai");
      assert.equal(app.document.title, "Sai🖖的小组话题");
      assert.equal(failureText(app), undefined);
    } finally {
      app.dom.window.close();
    }
  }
});

test("missing nickname falls back to the user key without including username badges", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    markup: html.replace('<a href="/user/sai">Sai🖖</a>', ""),
  });
  try {
    await tick();
    assert.equal(app.document.title, "sai的小组话题");
    assert.equal(
      app.document.querySelector("[data-user-topics-view] h2.title")
        .textContent,
      "sai的小组话题",
    );
    assert.equal(app.requests[0].request.searchParams.get("q"), "user:sai");
  } finally {
    app.dom.window.close();
  }
});

test("identity changes are diagnosed at entry insertion and view activation", async () => {
  for (const beforeEntry of [true, false]) {
    const app = setup({
      markup: beforeEntry
        ? html.replace('href="/user/sai/blog"', 'href="/user/other/blog"')
        : html,
    });
    try {
      if (!beforeEntry) {
        app.document.querySelector('.navTabs a[href="/user/sai/blog"]').href =
          "/user/other/blog";
        enter(app);
        await tick();
      }
      const stage = beforeEntry ? "帖子入口插入" : "帖子视图挂载";
      assert.equal(
        failureText(app),
        `${stage}失败：个人导航中的日志链接与页面目标用户身份冲突。`,
      );
      assert.equal(app.requests.length, 0);
      assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
      assert.notEqual(
        app.window.getComputedStyle(app.document.querySelector(".columns"))
          .display,
        "none",
      );
    } finally {
      app.dom.window.close();
    }
  }
});

test("ambiguous footer boundaries never hide host content", () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts",
    markup: html.replace(
      '<div id="footer">',
      '<div id="footer"></div><div id="footer">',
    ),
  });
  try {
    assert.equal(
      failureText(app),
      "帖子视图挂载失败：正文存在多个 footer 挂载边界，无法确定挂载位置。",
    );
    assert.equal(app.requests.length, 0);
    assert.equal(app.document.querySelector("[data-user-topics-view]"), null);
    assert.notEqual(
      app.window.getComputedStyle(app.document.querySelector(".columns"))
        .display,
      "none",
    );
  } finally {
    app.dom.window.close();
  }
});

test("de-linked nicknames do not take text from neighboring action links", async () => {
  const app = setup({
    url: "https://bgm.tv/user/sai/blog#posts/group",
    markup: html.replace(
      '<a href="/user/sai">Sai🖖</a>',
      'Sai🖖 <a class="chiiBtn" href="/pm/compose/sai">发送短信</a>',
    ),
  });
  try {
    await tick();
    assert.equal(app.document.title, "Sai🖖的小组话题");
  } finally {
    app.dom.window.close();
  }
});

test("a nickname converted to plain text still mounts for the target user", async () => {
  // BGM用户名和条目标题去超链接 replaces the nickname anchor with its text.
  const app = setup({
    markup: html.replace('<a href="/user/sai">Sai🖖</a>', "Sai🖖"),
  });
  try {
    assert.ok(app.document.querySelector("[data-user-topics-link]"));
    enter(app);
    await tick();
    assert.ok(app.document.querySelector("[data-user-topics-view]"));
    assert.equal(app.requests[0].request.searchParams.get("q"), "user:sai");
    assert.equal(app.document.title, "Sai🖖的小组话题");
  } finally {
    app.dom.window.close();
  }
});
