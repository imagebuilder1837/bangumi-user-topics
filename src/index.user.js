// ==UserScript==
// @name         Bangumi 用户帖子
// @namespace    https://github.com/imagebuilder1837/bangumi-user-topics
// @version      0.1.0
// @description  在 Bangumi 用户页个人导航中增加“帖子”入口，查看该用户发起的小组话题与条目讨论。
// @author       imagebuilder1837
// @match        https://bgm.tv/user/*
// @match        https://bgm.tv/anime/list/*
// @match        https://bgm.tv/book/list/*
// @match        https://bgm.tv/music/list/*
// @match        https://bgm.tv/game/list/*
// @match        https://bgm.tv/real/list/*
// @match        https://bangumi.tv/user/*
// @match        https://bangumi.tv/anime/list/*
// @match        https://bangumi.tv/book/list/*
// @match        https://bangumi.tv/music/list/*
// @match        https://bangumi.tv/game/list/*
// @match        https://bangumi.tv/real/list/*
// @match        https://chii.in/user/*
// @match        https://chii.in/anime/list/*
// @match        https://chii.in/book/list/*
// @match        https://chii.in/music/list/*
// @match        https://chii.in/game/list/*
// @match        https://chii.in/real/list/*
// @run-at       document-end
// @grant        none
// @license      MIT
// @downloadURL  https://raw.githubusercontent.com/imagebuilder1837/bangumi-user-topics/refs/heads/main/src/index.user.js
// @updateURL    https://raw.githubusercontent.com/imagebuilder1837/bangumi-user-topics/refs/heads/main/src/index.user.js
// ==/UserScript==

// Generated from src/main.mjs. Do not edit; run npm run build.
(function () {
  "use strict";

  const userPath = /^\/user\/([^/]+)(?:\/(blog|index|friends))?\/?$/;
  const collectionPath =
    /^\/(anime|book|music|game|real)\/list\/([^/]+)(?:\/(wish|collect|do|on_hold|dropped))?\/?$/;
  const columnShapes = {
    home: ["columnA", "columnB"],
    blog: ["columnA", "columnB"],
    index: ["columnA", "columnB"],
    friends: ["columnUserSingle"],
    overview: ["columnA", "columnB"],
    state: ["columnSubjectBrowserA", "columnSubjectBrowserB"],
  };
  const css = `
[data-user-topics-active="on"] > #headerProfile + .mainWrapper > .columns,
[data-user-topics-active="on"] > #headerProfile > .subjectNav > .navSubTabsWrapper[data-user-topics-original-subnav="on"] { display: none !important; }
[data-user-topics-active="on"] { min-width: 0 !important; }
[data-user-topics-active="on"] > #headerProfile + .mainWrapper { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-active="on"] > #headerNeue2 { min-width: 0 !important; }
[data-user-topics-view] { width: 100%; max-width: 750px; margin: 0 auto; min-height: 200px; box-sizing: border-box; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;
  function inspectHost(window) {
    const { document, location } = window;
    if (
      !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.hostname) ||
      location.protocol !== "https:"
    )
      return null;
    const userMatch = userPath.exec(location.pathname);
    const collectionMatch = collectionPath.exec(location.pathname);
    if (!userMatch && !collectionMatch) return null;
    const rawKey = userMatch?.[1] || collectionMatch[2];
    let user;
    try {
      user = decodeURIComponent(rawKey);
    } catch {
      return null;
    }
    if (!user || !/^[\p{L}\p{N}_-]+$/u.test(user)) return null;
    const shape = userMatch
      ? userMatch[2] || "home"
      : collectionMatch[3]
        ? "state"
        : "overview";
    const wrapper = document.querySelector("#wrapperNeue");
    const profile = wrapper?.querySelector(":scope > #headerProfile");
    const nav = profile?.querySelector(
      ":scope > .subjectNav > .navTabsWrapper > .navTabs",
    );
    const blogs = [...(nav?.children || [])].filter((li) => {
      if (li.tagName !== "LI" || !li.firstElementChild?.matches("a[href]"))
        return false;
      const url = new URL(li.firstElementChild.href);
      return (
        url.origin === location.origin &&
        /^\/user\/[^/]+\/blog\/?$/.test(url.pathname)
      );
    });
    if (blogs.length !== 1) return null;
    const blog = blogs[0].firstElementChild;
    if (new URL(blog.href).pathname.split("/")[2] !== rawKey) return null;
    const main = profile?.nextElementSibling;
    const columns = main?.firstElementChild;
    const footer = columns?.nextElementSibling;
    const header = profile?.querySelector("h1 .name > a");
    const subnavs = profile?.querySelectorAll(
      ":scope > .subjectNav > .navSubTabsWrapper",
    );
    const originalSub = subnavs?.[0];
    const evidence = {
      home: "#columnA #user_home",
      blog: "#columnA #entry_list",
      index: "#columnA #timeline.index-list",
      friends: "#columnUserSingle #memberUserList",
      overview: "#columnA .horizontalOptions",
      state: "#columnSubjectBrowserA #browserTools",
    };
    if (
      !wrapper ||
      !wrapper.contains(document.querySelector("#headerNeue2")) ||
      !main?.matches(".mainWrapper") ||
      !columns?.matches(".columns") ||
      !footer?.matches("#footer") ||
      columns.parentElement !== footer.parentElement ||
      !header ||
      !nav ||
      !profile.querySelector(":scope > .subjectNav > .navTabsWrapper") ||
      subnavs.length > 1 ||
      (originalSub && !originalSub.querySelector(":scope > .navSubTabs")) ||
      [...columns.children].map((child) => child.id).join(",") !==
        columnShapes[shape].join(",") ||
      !columns.querySelector(evidence[shape])
    )
      return null;
    return {
      profile,
      nav,
      blog,
      columns,
      footer,
      wrapper,
      user,
      nickname: header.textContent.trim(),
      originalSub,
      bodyEvidence: columns.querySelector(evidence[shape]),
    };
  }

  function createHostView(window, host) {
    const { document } = window;
    const style = document.createElement("style");
    style.dataset.userTopicsStyle = "";
    style.textContent = css;
    let root = null,
      subnav = null,
      focus = null,
      previousScroll = null,
      previousFocus = null,
      previousMarker = null,
      markerOwned = false,
      focusOwned = false,
      subnavMarkerOwned = false,
      previousSubnavMarker = null;
    const markerObserver = new window.MutationObserver(() => {
      markerOwned = false;
    });
    const focusObserver = new window.MutationObserver(() => {
      focusOwned = false;
    });
    const subnavObserver = new window.MutationObserver(() => {
      subnavMarkerOwned = false;
    });
    function show() {
      if (root) return { root, subnav };
      previousScroll = window.scrollY;
      previousFocus = host.columns.contains(document.activeElement)
        ? document.activeElement
        : null;
      focus = host.nav.querySelector(":scope > li > a.focus");
      if (focus) {
        focus.classList.remove("focus");
        focusOwned = true;
        focusObserver.observe(focus, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }
      previousMarker = host.wrapper.getAttribute("data-user-topics-active");
      host.wrapper.dataset.userTopicsActive = "on";
      markerOwned = true;
      markerObserver.observe(host.wrapper, {
        attributes: true,
        attributeFilter: ["data-user-topics-active"],
      });
      if (host.originalSub) {
        previousSubnavMarker = host.originalSub.getAttribute(
          "data-user-topics-original-subnav",
        );
        host.originalSub.dataset.userTopicsOriginalSubnav = "on";
        subnavMarkerOwned = true;
        subnavObserver.observe(host.originalSub, {
          attributes: true,
          attributeFilter: ["data-user-topics-original-subnav"],
        });
      }
      document.head.append(style);
      subnav = document.createElement("div");
      subnav.className = "navSubTabsWrapper";
      subnav.dataset.userTopicsSubnav = "";
      (host.originalSub || host.nav.parentElement).after(subnav);
      root = document.createElement("section");
      root.dataset.userTopicsView = "";
      host.footer.before(root);
      return { root, subnav };
    }
    function hide() {
      if (!root) return;
      const active = document.activeElement;
      const releaseFocus =
        active === document.body ||
        root.contains(active) ||
        subnav.contains(active) ||
        active === host.nav.querySelector("[data-user-topics-link] a");
      root.remove();
      subnav.remove();
      root = subnav = null;
      if (markerObserver.takeRecords().length) markerOwned = false;
      markerObserver.disconnect();
      if (focusObserver.takeRecords().length) focusOwned = false;
      focusObserver.disconnect();
      if (subnavObserver.takeRecords().length) subnavMarkerOwned = false;
      subnavObserver.disconnect();
      style.remove();
      if (
        subnavMarkerOwned &&
        host.originalSub?.dataset.userTopicsOriginalSubnav === "on"
      ) {
        if (previousSubnavMarker === null)
          delete host.originalSub.dataset.userTopicsOriginalSubnav;
        else
          host.originalSub.setAttribute(
            "data-user-topics-original-subnav",
            previousSubnavMarker,
          );
      }
      subnavMarkerOwned = false;
      if (
        focusOwned &&
        focus?.isConnected &&
        !host.nav.querySelector(":scope > li > a.focus")
      )
        focus.classList.add("focus");
      focusOwned = false;
      if (markerOwned && host.wrapper.dataset.userTopicsActive === "on") {
        if (previousMarker === null)
          delete host.wrapper.dataset.userTopicsActive;
        else
          host.wrapper.setAttribute("data-user-topics-active", previousMarker);
      }
      markerOwned = false;
      if (
        releaseFocus &&
        previousFocus?.isConnected &&
        host.columns.contains(previousFocus)
      )
        previousFocus.focus();
      previousFocus = null;
      const hash = window.location.hash.slice(1);
      const nativeAnchor = hash && document.getElementById(hash);
      if (
        !nativeAnchor &&
        previousScroll != null &&
        typeof window.scrollTo === "function"
      ) {
        try {
          window.scrollTo(0, previousScroll);
        } catch {
          /* jsdom has no scroll implementation */
        }
      }
    }
    function intact() {
      return (
        root?.parentElement === host.footer.parentElement &&
        root.previousElementSibling === host.columns &&
        root.nextElementSibling === host.footer &&
        subnav?.parentElement === host.nav.parentElement.parentElement
      );
    }
    return { show, hide, intact };
  }

  const safeID = (value) => Number.isSafeInteger(value) && value >= 0;

  function normalizeBatch(payload, { offset, limit, origin, kind = "group" }) {
    if (
      !payload ||
      !Array.isArray(payload.data) ||
      !payload.pagination ||
      !payload.meta ||
      typeof payload.meta !== "object" ||
      Array.isArray(payload.meta) ||
      !safeID(payload.meta.executionMs) ||
      payload.pagination.offset !== offset ||
      payload.pagination.limit !== limit ||
      !safeID(payload.pagination.total) ||
      typeof payload.pagination.totalIsEstimate !== "boolean"
    ) {
      throw new Error("SearchEncore 返回格式无效");
    }
    const topics = payload.data.map((row) => {
      if (
        !row ||
        !safeID(row.id) ||
        !safeID(row.parentID) ||
        row.id === 0 ||
        row.parentID === 0 ||
        row.kind !== (kind === "group" ? 0 : 1) ||
        typeof row.title !== "string" ||
        !safeID(row.replyCount) ||
        !safeID(row.createdAt) ||
        !safeID(row.updatedAt) ||
        row.createdAt > 8_639_999_999_999 ||
        row.updatedAt > 8_639_999_999_999 ||
        (row.parentName != null && typeof row.parentName !== "string") ||
        (row.creatorID != null && !safeID(row.creatorID)) ||
        (row.creatorName != null && typeof row.creatorName !== "string")
      ) {
        throw new Error("SearchEncore 主题数据无效");
      }
      return {
        key: `${kind}:${row.id}`,
        kind,
        title: row.title || "无标题",
        parent: row.parentName || (kind === "group" ? "小组话题" : "条目讨论"),
        replies: row.replyCount,
        createdAt: row.createdAt,
        url: `${origin}/${kind}/topic/${row.id}`,
        parentURL: `${origin}/${kind}/${row.parentID}`,
      };
    });
    if (topics.length > limit) throw new Error("SearchEncore 返回过多数据");
    return topics;
  }

  class RateLimitError extends Error {
    constructor(retryAfter) {
      super("SearchEncore 请求过于频繁，请稍后重试");
      this.retryAfter = retryAfter;
    }
  }

  function createSearchEncore(
    fetch,
    {
      setTimeout: delay = setTimeout,
      clearTimeout: clear = clearTimeout,
      now = Date.now,
    } = {},
  ) {
    return async ({ user, offset, limit, origin, kind = "group" }) => {
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 5000 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50
      )
        throw new Error("请求超出检索范围");
      if (kind !== "group" && kind !== "subject")
        throw new Error("未知主题来源");
      const url = new URL(`https://bgmdb.ry.mk/v1/search/${kind}-topics`);
      url.search = new URLSearchParams({
        q: `user:${user}`,
        sort: "newest",
        limit: String(limit),
        offset: String(offset),
      }).toString();
      const controller = new AbortController();
      let timeout;
      try {
        return await Promise.race([
          (async () => {
            const response = await fetch(url.href, {
              credentials: "omit",
              signal: controller.signal,
            });
            if (response.status === 429) {
              const value = response.headers?.get("Retry-After");
              const seconds =
                value != null && /^\d+(?:\.\d+)?$/.test(value.trim())
                  ? Number(value.trim()) * 1000
                  : NaN;
              const date = value ? Date.parse(value) - now() : NaN;
              const wait = Number.isFinite(seconds) ? seconds : date;
              throw new RateLimitError(
                now() + (Number.isFinite(wait) && wait >= 0 ? wait : 60000),
              );
            }
            if (!response.ok)
              throw new Error(`SearchEncore HTTP ${response.status}`);
            return normalizeBatch(await response.json(), {
              offset,
              limit,
              origin,
              kind,
            });
          })(),
          new Promise((_, reject) => {
            timeout = delay(() => {
              controller.abort();
              reject(new Error("SearchEncore 请求超时，请重试"));
            }, 15000);
          }),
        ]);
      } finally {
        clear(timeout);
      }
    };
  }

  // Service cursors are shared; displayed identities and late exclusions belong to a category.
  const kinds = ["group", "subject"];
  const order = (a, b) =>
    b.createdAt - a.createdAt ||
    kinds.indexOf(a.kind) - kinds.indexOf(b.kind) ||
    a.received - b.received;
  const unavailable = (stream) =>
    new Error(
      stream.offset > 5000
        ? "已达到服务检索上限，可能仍有更早的帖子"
        : "无法确定当前页，请继续重试",
    );

  function createTopicFeed(search, { user, origin, now = Date.now }) {
    const streams = Object.fromEntries(
      kinds.map((kind) => [
        kind,
        { offset: 0, exhausted: false, pending: null, rows: [] },
      ]),
    );
    const known = new Map();
    const views = Object.fromEntries(
      ["all", ...kinds].map((kind) => [
        kind,
        { pages: new Map(), excluded: new Set(), targets: new Map() },
      ]),
    );
    let received = 0;
    let foreground = null;
    let inFlight = 0;
    let cooldown = 0;
    let paused = false;
    const queue = [];
    const active = new Set();
    let scheduled = false;

    function setForeground(category) {
      foreground = category;
      schedule();
    }
    function schedule() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        dispatch();
      });
    }
    function dispatch() {
      if (paused) return;
      while (inFlight < 2 && queue.length) {
        const front = queue.findIndex((job) => job.categories.has(foreground));
        // A foreground target waiting for a response or its next request owns free slots.
        if (
          front < 0 &&
          [...active].some((target) => target.category === foreground)
        )
          return;
        const job = queue.splice(front < 0 ? 0 : front, 1)[0];
        inFlight++;
        search({
          user,
          origin,
          kind: job.kind,
          offset: job.offset,
          limit: job.limit,
        })
          .then(job.resolve, (error) => {
            if (error instanceof RateLimitError) {
              paused = true;
              cooldown = Math.max(cooldown, error.retryAfter);
              for (const waiting of queue.splice(0)) waiting.reject(error);
            }
            job.reject(error);
          })
          .finally(() => {
            inFlight--;
            schedule();
          });
      }
    }
    function request(kind, offset, limit, category) {
      const job = { kind, offset, limit, categories: new Set([category]) };
      const promise = new Promise((resolve, reject) => {
        job.resolve = resolve;
        job.reject = reject;
      });
      streams[kind].pending = { promise, job };
      schedule();
      return streams[kind].pending;
    }
    function candidates(category) {
      const view = views[category];
      const displayed = new Set([...view.pages.values()].flat());
      const boundary = view.pages.size
        ? known.get(view.pages.get(Math.max(...view.pages.keys())).at(-1))
        : null;
      const result = [];
      for (const kind of category === "all" ? kinds : [category]) {
        for (const topic of streams[kind].rows) {
          if (view.excluded.has(topic.key)) continue;
          if (
            boundary &&
            !displayed.has(topic.key) &&
            order(topic, boundary) <= 0
          ) {
            view.excluded.add(topic.key);
            continue;
          }
          result.push(topic);
        }
      }
      result.sort(order);
      return result;
    }

    async function fill(category, count, target) {
      const required = category === "all" ? kinds : [category];
      active.add(target);
      try {
        const outcomes = await Promise.allSettled(
          required.map(async (kind) => {
            const stream = streams[kind];
            try {
              while (true) {
                if (target.blocked) throw target.blocked;
                const available = candidates(category).filter(
                  (t) => t.kind === kind,
                ).length;
                if (available >= count || stream.exhausted) return;
                if (paused) throw new Error("请求已暂停，请稍后重试");
                if (stream.offset > 5000 || target.requests[kind] >= 3)
                  throw unavailable(stream);
                let pending = stream.pending;
                if (!pending) {
                  const offset = stream.offset;
                  const limit = Math.min(50, Math.max(1, count - available));
                  pending = request(kind, offset, limit, category);
                  queue.push(pending.job);
                  schedule();
                  // The cursor and cache update exactly once, regardless of how many targets await this job.
                  pending.promise = pending.promise
                    .then((batch) => {
                      if (!Array.isArray(batch) || batch.length > limit)
                        throw new Error("SearchEncore 返回格式无效");
                      for (const item of batch) {
                        if (!known.has(item.key)) {
                          item.received = received++;
                          known.set(item.key, item);
                          stream.rows.push(item);
                        }
                      }
                      stream.offset += batch.length;
                      if (!batch.length) stream.exhausted = true;
                    })
                    .finally(() => {
                      if (stream.pending === pending) stream.pending = null;
                    });
                }
                pending.job.categories.add(category);
                target.requests[kind]++;
                await pending.promise;
              }
            } catch (error) {
              target.blocked ||= error;
              throw error;
            }
          }),
        );
        const failed = outcomes.find(
          (outcome) => outcome.status === "rejected",
        );
        if (failed) throw failed.reason;
      } finally {
        active.delete(target);
        schedule();
      }
    }

    async function prepare(category, page, retry = false) {
      const view = views[category];
      if (!view || !Number.isInteger(page) || page < 1)
        throw new Error("无效分类或页码");
      const id = String(page);
      let target = view.targets.get(id);
      if (!target) {
        target = {
          category,
          requests: { group: 0, subject: 0 },
          failure: null,
          blocked: null,
          pending: null,
        };
        view.targets.set(id, target);
      }
      if (target.pending) return target.pending;
      if (retry) {
        if (paused && now() < cooldown)
          return { error: new Error("请求冷却中，请稍后重试") };
        paused = false;
        target.requests = { group: 0, subject: 0 };
        target.failure = null;
        target.blocked = null;
        schedule();
      }
      const work = async () => {
        if (view.pages.has(page) && !retry) {
          const entries = candidates(category);
          return {
            items: view.pages.get(page).map((key) => known.get(key)),
            next:
              entries.length > page * 10
                ? "yes"
                : (category === "all" ? kinds : [category]).every(
                      (k) => streams[k].exhausted,
                    )
                  ? "no"
                  : "unknown",
          };
        }
        if (target.failure) return { error: target.failure };
        const goal = page * 10;
        let problem = null;
        try {
          const cached = candidates(category);
          const required = category === "all" ? kinds : [category];
          if (
            !required.every(
              (kind) =>
                streams[kind].exhausted ||
                cached.filter((item) => item.kind === kind).length >= goal + 1,
            )
          ) {
            if (paused) throw new Error("请求已暂停，请稍后重试");
            await fill(category, goal + 1, target);
          }
        } catch (error) {
          problem = error;
        }
        let entries = candidates(category);
        const required = category === "all" ? kinds : [category];
        const exhausted = () => required.every((k) => streams[k].exhausted);
        const reliable = (count) =>
          required.every(
            (k) =>
              streams[k].exhausted ||
              entries.filter((t) => t.kind === k).length >= count,
          );
        const start = (page - 1) * 10;
        if (!reliable(goal)) {
          target.failure =
            problem ||
            unavailable(streams[category === "all" ? "group" : category]);
          return { error: target.failure };
        }
        if (entries.length <= start) return { items: [], next: "no" };
        const keys = entries.slice(start, goal).map((t) => t.key);
        entries = candidates(category);
        return {
          items: (view.pages.get(page) || keys).map((key) => known.get(key)),
          next:
            reliable(goal + 1) && entries.length > goal
              ? "yes"
              : exhausted()
                ? "no"
                : "unknown",
          warning: problem,
        };
      };
      target.pending = work().finally(() => {
        target.pending = null;
      });
      return target.pending;
    }
    function commit(category, page, items) {
      const view = views[category];
      if (!view.pages.has(page))
        view.pages.set(
          page,
          items.map((topic) => topic.key),
        );
    }
    return { prepare, commit, setForeground };
  }

  function el(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function renderPostsNav(tabs, category) {
    const d = tabs.ownerDocument;
    let nav = tabs.querySelector(":scope > ul.navSubTabs");
    if (!nav) {
      nav = el(d, "ul", "navSubTabs");
      tabs.replaceChildren(nav);
    }
    for (const [filter, label, hash] of [
      ["all", "全部帖子", "#posts"],
      ["group", "小组话题", "#posts/group"],
      ["subject", "条目讨论", "#posts/subject"],
    ]) {
      let li = nav.querySelector(
        `:scope > li > a[href="${hash}"]`,
      )?.parentElement;
      if (!li) {
        li = el(d, "li");
        const a = el(d, "a", "", label);
        a.href = hash;
        li.append(a);
        nav.append(li);
      }
      li.firstElementChild.classList.toggle("focus", filter === category);
    }
  }
  function postsTitle(nickname, category) {
    const label = {
      all: "帖子",
      group: "小组话题",
      subject: "条目讨论",
    }[category];
    return `${nickname}的${label}`;
  }
  function renderPosts(
    root,
    { nickname, category = "group", state, page, onNext, onPrevious, onRetry },
  ) {
    const d = root.ownerDocument;
    root.replaceChildren();
    const title = el(d, "h2", "title", postsTitle(nickname, category));
    root.append(title);
    const status = el(d, "div", "grey");
    status.setAttribute("role", "status");
    root.append(status);
    if (state.loading) status.textContent = "正在加载帖子…";
    if (state.items?.length) {
      const list = el(d, "div", "entry-list");
      for (const topic of state.items) {
        const item = el(d, "div", "item clearit");
        const entry = el(d, "div", "entry");
        const heading = el(d, "h2", "title");
        const link = el(d, "a", "l", topic.title);
        link.href = topic.url;
        heading.append(link);
        const tools = el(d, "div", "tools");
        const parent = el(d, "a", "", topic.parent);
        parent.href = topic.parentURL;
        const time = el(d, "div", "time");
        const replies = el(d, "a", "l", `${topic.replies} 回复`);
        replies.href = topic.url;
        time.append(parent, " · ", formatTime(topic.createdAt), " · ", replies);
        tools.append(time);
        entry.append(heading, tools);
        item.append(entry);
        list.append(item);
      }
      root.append(list);
    } else if (!state.loading && !state.error)
      status.textContent = "没有找到已收录的帖子";
    if (state.error || state.warning) {
      status.textContent =
        state.error?.message ||
        `无法确认是否还有下一页：${state.warning?.message || "请继续重试"}`;
      const retry = el(d, "button", "", "重试");
      retry.type = "button";
      retry.addEventListener("click", onRetry);
      status.append(" ", retry);
    }
    if (state.items?.length) {
      const pages = el(d, "div", "page_inner");
      if (page > 1) {
        const previous = el(d, "a", "p", "上一页");
        previous.href = category === "all" ? "#posts" : `#posts/${category}`;
        if (state.loading) previous.setAttribute("aria-disabled", "true");
        previous.addEventListener("click", (event) => {
          event.preventDefault();
          if (!state.loading) onPrevious();
        });
        pages.append(previous);
      }
      const current = el(d, "strong", "p_cur", String(page));
      current.dataset.page = "";
      pages.append(current);
      if (state.next !== "no") {
        const next = el(
          d,
          "a",
          "p",
          state.next === "unknown" ? "下一页（未确认）" : "下一页",
        );
        next.dataset.next = "";
        next.href = category === "all" ? "#posts" : `#posts/${category}`;
        if (state.loading) next.setAttribute("aria-disabled", "true");
        next.addEventListener("click", (event) => {
          event.preventDefault();
          if (!state.loading) onNext();
        });
        pages.append(next);
      }
      root.append(pages);
    }
  }
  function formatTime(seconds) {
    const date = new Date((seconds + 8 * 3600) * 1000);
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
  }

  const categories = {
    "#posts": "all",
    "#posts/group": "group",
    "#posts/subject": "subject",
  };

  // Application boundary: a real Window and one replaceable network boundary.
  function start(window, { fetch = window.fetch.bind(window), timers } = {}) {
    const host = inspectHost(window);
    if (!host) {
      if (categories[window.location.hash])
        console.warn("用户帖子：当前页面无法安全挂载");
      return;
    }
    const { document } = window;
    const main = host.columns.parentElement;
    const navWrapper = host.nav.parentElement;
    const subjectNav = navWrapper.parentElement;
    if (host.nav.querySelector("[data-user-topics-link]")) return;
    const entry = document.createElement("li");
    entry.dataset.userTopicsLink = "";
    const anchor = document.createElement("a");
    anchor.textContent = "帖子";
    anchor.href = "#posts";
    entry.append(anchor);
    host.blog.parentElement.after(entry);
    const view = createHostView(window, host);
    const feed = createTopicFeed(createSearchEncore(fetch, timers), {
      user: host.user,
      origin: window.location.origin,
      now: timers?.now,
    });
    const states = Object.fromEntries(
      Object.keys(categories).map((hash) => [
        categories[hash],
        {
          page: 1,
          current: { loading: false },
          pending: null,
          ready: null,
          started: false,
          target: 1,
        },
      ]),
    );
    let explicitNavigation = false;
    anchor.addEventListener("click", (event) => {
      if (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        explicitNavigation = window.location.hash !== "#posts";
        if (!explicitNavigation && suspended) route(true);
      }
    });
    let visible = false,
      suspended = false,
      category = null,
      routeVersion = 0,
      takeoverEpoch = 0,
      previousTitle = null,
      ownedTitle = null;
    function updateTitle(next) {
      if (previousTitle === null) previousTitle = document.title;
      if (ownedTitle === null || document.title === ownedTitle) {
        ownedTitle = postsTitle(host.nickname, next);
        document.title = ownedTitle;
      }
    }
    function restoreTitle() {
      if (ownedTitle !== null && document.title === ownedTitle)
        document.title = previousTitle;
      previousTitle = ownedTitle = null;
    }
    const mounted = () =>
      host.wrapper.matches("#wrapperNeue") &&
      host.profile.matches("#headerProfile") &&
      host.profile.parentElement === host.wrapper &&
      main.matches(".mainWrapper") &&
      host.profile.nextElementSibling === main &&
      host.columns.parentElement === main &&
      host.columns.classList.contains("columns") &&
      host.footer.matches("#footer") &&
      host.footer.parentElement === main &&
      host.bodyEvidence.isConnected &&
      host.columns.contains(host.bodyEvidence) &&
      (!host.originalSub ||
        (host.originalSub.isConnected &&
          host.originalSub.parentElement === subjectNav)) &&
      subjectNav.matches(".subjectNav") &&
      subjectNav.parentElement === host.profile &&
      navWrapper.matches(".navTabsWrapper") &&
      navWrapper.parentElement === subjectNav &&
      host.nav.matches(".navTabs") &&
      host.nav.parentElement === navWrapper;
    const activeHostValid = () =>
      mounted() &&
      host.wrapper.dataset.userTopicsActive === "on" &&
      view.intact() &&
      (!host.originalSub ||
        host.originalSub.dataset.userTopicsOriginalSubnav === "on") &&
      window.getComputedStyle(host.columns).display === "none" &&
      (!host.originalSub ||
        window.getComputedStyle(host.originalSub).display === "none");
    function paint() {
      if (!visible) return;
      const root = document.querySelector("[data-user-topics-view]");
      const state = states[category];
      const subnav = document.querySelector("[data-user-topics-subnav]");
      if (subnav) renderPostsNav(subnav, category);
      if (root)
        renderPosts(root, {
          nickname: host.nickname,
          category,
          state: state.current,
          page: state.page,
          onNext: () => load(category, state.page + 1),
          onPrevious: () => load(category, state.page - 1),
          onRetry: () =>
            load(category, state.current.target || state.page, true),
        });
    }
    function publish(filter) {
      const state = states[filter];
      if (!state.ready || !visible || category !== filter) return;
      if (!activeHostValid()) {
        route();
        return;
      }
      const { target, result, scroll, version } = state.ready;
      state.ready = null;
      const previousPage = state.page;
      if (result.error)
        state.current = {
          ...state.current,
          loading: false,
          error: result.error,
          target,
        };
      else if (result.items.length) {
        feed.commit(filter, target, result.items);
        state.page = target;
        state.current = { ...result, loading: false };
      } else
        state.current = {
          ...state.current,
          loading: false,
          next: "no",
          error: null,
        };
      paint();
      if (
        scroll &&
        version === routeVersion &&
        target !== previousPage &&
        state.page === target
      ) {
        window.scrollTo(0, 0);
      }
    }
    async function load(filter, target, retry = false) {
      if (!visible || category !== filter) return;
      if (!activeHostValid()) {
        route();
        return;
      }
      const state = states[filter];
      if (state.pending) return;
      state.started = true;
      state.target = target;
      state.ready = null;
      const scroll = target !== state.page;
      const version = routeVersion;
      const epoch = takeoverEpoch;
      state.current = {
        ...state.current,
        loading: true,
        error: null,
        warning: null,
        target,
      };
      paint();
      const job = feed.prepare(filter, target, retry);
      state.pending = job;
      let result;
      try {
        result = await job;
      } catch (error) {
        result = { error };
      }
      if (state.pending !== job || epoch !== takeoverEpoch) return;
      state.pending = null;
      state.ready = { target, result, scroll, version };
      publish(filter);
    }
    // An explicit click on the entry can reenter after a suspended host recovers.
    function route(explicit = false) {
      const next = categories[window.location.hash];
      const invalid = !mounted() || (visible && !activeHostValid());
      if (!next || invalid) {
        explicitNavigation = false;
        if (visible) {
          routeVersion++;
          visible = false;
          suspended = Boolean(next && invalid);
          if (suspended) takeoverEpoch++;
          category = null;
          feed.setForeground(null);
          if (suspended)
            for (const state of Object.values(states)) {
              if (state.ready || state.pending || state.current.loading)
                state.started = false;
              state.ready = null;
              state.pending = null;
              state.current = { ...state.current, loading: false };
            }
          anchor.classList.remove("focus");
          view.hide();
          restoreTitle();
        } else if (!next) suspended = false;
        return;
      }
      if (suspended && !explicit && !explicitNavigation) return;
      suspended = false;
      if (visible && category === next) {
        explicitNavigation = false;
        return;
      }
      routeVersion++;
      visible = true;
      category = next;
      updateTitle(next);
      feed.setForeground(next);
      view.show();
      anchor.classList.add("focus");
      paint();
      explicitNavigation = false;
      if (states[next].ready) publish(next);
      else if (!states[next].started) load(next, states[next].page);
      else if (states[next].pending) {
        states[next].current = { ...states[next].current, loading: true };
        paint();
      }
    }
    const observer = new window.MutationObserver(() => {
      if (visible && !activeHostValid()) route();
    });
    observer.observe(main, {
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observer.observe(navWrapper, {
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(host.profile, {
      childList: true,
      attributes: true,
      attributeFilter: ["id"],
    });
    observer.observe(subjectNav, {
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(host.nav, {
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(host.footer, {
      attributes: true,
      attributeFilter: ["id"],
    });
    observer.observe(host.columns, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    observer.observe(host.wrapper, {
      childList: true,
      attributes: true,
      attributeFilter: ["data-user-topics-active", "id"],
    });
    if (host.originalSub)
      observer.observe(host.originalSub, {
        attributes: true,
        attributeFilter: ["data-user-topics-original-subnav", "class", "style"],
      });
    window.addEventListener("hashchange", () => route());
    route();
  }

  start(window);
})();
