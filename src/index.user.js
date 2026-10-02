// ==UserScript==
// @name         Bangumi 用户帖子
// @namespace    https://github.com/imagebuilder1837/bangumi-user-topics
// @version      0.1.1
// @description  在 Bangumi 用户页个人导航中增加“帖子”入口，查看该用户发起的小组话题、条目讨论与评论回复。
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

  const userPath =
    /^\/user\/([^/]+)(?:\/(blog|index|friends|rev_friends|timeline|mono|groups|wiki)(?:\/[^/]+)*\/?)?$/;
  const collectionPath =
    /^\/(anime|book|music|game|real)\/list\/([^/]+)(?:\/(wish|collect|do|on_hold|dropped))?\/?$/;
  const css = `
[data-user-topics-active="on"] > #headerProfile + .mainWrapper > :not(#footer):not(#footer ~ *):not([data-user-topics-view]),
[data-user-topics-active="on"] > #headerProfile > .subjectNav > .navSubTabsWrapper[data-user-topics-original-subnav="on"] { display: none !important; }
[data-user-topics-active="on"] { min-width: 0 !important; }
[data-user-topics-active="on"] > #headerProfile + .mainWrapper { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-active="on"] > #headerNeue2 { min-width: 0 !important; }
[data-user-topics-view] { width: 100%; max-width: 750px; margin: 0 auto; padding-top: 10px; min-height: 200px; box-sizing: border-box; }
[data-user-topics-view] > .flex-center-v { flex-wrap: wrap; justify-content: flex-start; column-gap: .6em; }
[data-user-topics-view] > .flex-center-v > [role="status"] { color: #999; min-width: 0; max-width: 100%; overflow-wrap: anywhere; text-align: left; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;

  // Takeover-level verification: everything hiding and restoring the host
  // content depends on. Runs at activation time, not at entry insertion, so a
  // failed check can surface visibly instead of silently hiding the entry.
  // The takeover does not enumerate known page shapes: any page that offers a
  // .mainWrapper body with a #footer boundary can be taken over safely, and
  // everything before the footer is hidden and later restored as a whole.
  function verifyTakeover(window) {
    const base = locateProfile(window);
    if (!base) return null;
    const main = base.profile.nextElementSibling;
    // Sibling components may insert bars next to the columns; locate the
    // columns semantically instead of assuming it is the first child.
    const columns = main?.querySelector(":scope > .columns");
    const footer = main?.querySelector(":scope > #footer");
    // Components may add their own subnavigation wrappers; the first wrapper
    // that actually carries a subnavigation list is captured for hiding, extra
    // wrappers are tolerated and left visible.
    const originalSub = [
      ...base.profile.querySelectorAll(
        ":scope > .subjectNav > .navSubTabsWrapper",
      ),
    ].find((wrapper) => wrapper.querySelector(":scope > .navSubTabs"));
    if (
      !main?.matches(".mainWrapper") ||
      !columns ||
      !footer ||
      footer.parentElement !== main
    )
      return null;
    return { ...base, columns, footer, originalSub: originalSub || null };
  }

  function locateProfile(window) {
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
    const wrapper = document.querySelector("#wrapperNeue");
    const profile = wrapper?.querySelector(":scope > #headerProfile");
    const subjectNav = profile?.querySelector(":scope > .subjectNav");
    const navWrapper = subjectNav?.querySelector(":scope > .navTabsWrapper");
    const nav = navWrapper?.querySelector(":scope > .navTabs");
    const blogs = [...(nav?.children || [])].filter((li) => {
      if (li.dataset?.userTopicsLink !== undefined) return false;
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
    const header = profile?.querySelector("h1 .name > a");
    if (
      !wrapper ||
      !wrapper.contains(document.querySelector("#headerNeue2")) ||
      !subjectNav ||
      !navWrapper ||
      !nav ||
      !header
    )
      return null;
    return {
      wrapper,
      profile,
      subjectNav,
      navWrapper,
      nav,
      blog,
      user,
      nickname: header.textContent.trim(),
    };
  }

  // Entry-level inspection: only what inserting the navigation entry needs.
  // Entry appearance is path-scoped and does not depend on takeover checks.
  function inspectEntry(window) {
    return locateProfile(window);
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
      if (!root || root.parentElement !== host.footer.parentElement)
        return false;
      // Nodes inserted between the root and the footer stay hidden by the
      // takeover CSS, so only the relative order matters, not adjacency.
      return (
        !!(
          root.compareDocumentPosition(host.footer) &
          window.Node.DOCUMENT_POSITION_FOLLOWING
        ) && subnav?.parentElement === host.nav.parentElement.parentElement
      );
    }
    return { show, hide, intact };
  }

  const safeID = (value) => Number.isSafeInteger(value) && value >= 0;
  const replySources = {
    group: {
      path: "group/topic",
      container: "小组话题",
      label: "小组话题回复",
      parentPath: "group",
    },
    subject: {
      path: "subject/topic",
      container: "条目讨论",
      label: "条目讨论回复",
      parentPath: "subject",
    },
    episode: {
      path: "ep",
      container: "章节",
      label: "章节评论",
      parentPath: "subject",
    },
    character: { path: "character", container: "角色", label: "角色评论" },
    person: { path: "person", container: "人物", label: "人物评论" },
    blog: { path: "blog", container: "日志", label: "日志评论" },
  };

  function normalizeReply(row, origin) {
    const source =
      row &&
      typeof row.source === "string" &&
      Object.hasOwn(replySources, row.source)
        ? replySources[row.source]
        : null;
    if (
      !source ||
      !safeID(row.id) ||
      row.id === 0 ||
      !safeID(row.containerID) ||
      row.containerID === 0 ||
      !safeID(row.createdAt) ||
      row.createdAt > 8_639_999_999_999 ||
      typeof row.excerpt !== "string" ||
      (row.parentID != null && (!safeID(row.parentID) || row.parentID === 0)) ||
      (row.creatorID != null && !safeID(row.creatorID)) ||
      ["containerTitle", "parentName", "creatorName", "creatorUsername"].some(
        (field) => row[field] != null && typeof row[field] !== "string",
      )
    )
      throw new Error("SearchEncore 评论回复数据无效");
    return {
      key: `reply:${row.source}:${row.id}`,
      kind: "replies",
      title:
        row.containerTitle?.trim() || `${source.container} #${row.containerID}`,
      excerpt: row.excerpt.trim() || "暂无可用摘要",
      sourceLabel: source.label,
      parent: row.parentName?.trim() || null,
      parentURL:
        source.parentPath && row.parentID
          ? `${origin}/${source.parentPath}/${row.parentID}`
          : null,
      createdAt: row.createdAt,
      url: `${origin}/${source.path}/${row.containerID}#post_${row.id}`,
    };
  }

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
    const items = payload.data.map((row) => {
      if (kind === "replies") return normalizeReply(row, origin);
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
    if (items.length > limit) throw new Error("SearchEncore 返回过多数据");
    return items;
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
      if (!["group", "subject", "replies"].includes(kind))
        throw new Error("未知查询来源");
      const endpoint = kind === "replies" ? "replies" : `${kind}-topics`;
      const url = new URL(`https://bgmdb.ry.mk/v1/search/${endpoint}`);
      url.search = new URLSearchParams({
        q: `user:${user}`,
        sort: "newest",
        limit: String(limit),
        offset: String(offset),
      }).toString();
      if (kind === "replies") url.searchParams.set("source", "all");
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
  const topicKinds = ["group", "subject"];
  const kinds = [...topicKinds, "replies"];
  const requiredKinds = (category) =>
    category === "all" ? topicKinds : [category];
  const order = (a, b) =>
    b.createdAt - a.createdAt ||
    kinds.indexOf(a.kind) - kinds.indexOf(b.kind) ||
    a.received - b.received;
  const unavailable = (stream, category) =>
    new Error(
      stream.offset > 5000
        ? `已达到服务检索上限，可能仍有更早的${category === "replies" ? "评论回复" : "帖子"}`
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
      while (inFlight < 3 && queue.length) {
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
      for (const kind of requiredKinds(category)) {
        for (const item of streams[kind].rows) {
          if (view.excluded.has(item.key)) continue;
          if (
            boundary &&
            !displayed.has(item.key) &&
            order(item, boundary) <= 0
          ) {
            view.excluded.add(item.key);
            continue;
          }
          result.push(item);
        }
      }
      result.sort(order);
      return result;
    }

    async function fill(category, count, target) {
      const required = requiredKinds(category);
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
                  throw unavailable(stream, category);
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
          requests: { group: 0, subject: 0, replies: 0 },
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
        target.requests = { group: 0, subject: 0, replies: 0 };
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
                : requiredKinds(category).every((k) => streams[k].exhausted)
                  ? "no"
                  : "unknown",
          };
        }
        if (target.failure) return { error: target.failure };
        const goal = page * 10;
        let problem = null;
        try {
          const cached = candidates(category);
          const required = requiredKinds(category);
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
        const required = requiredKinds(category);
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
            unavailable(
              streams[category === "all" ? "group" : category],
              category,
            );
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
          items.map((item) => item.key),
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
      ["replies", "评论回复", "#posts/replies"],
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
      replies: "评论回复",
    }[category];
    return `${nickname}的${label}`;
  }
  function renderPosts(
    root,
    {
      nickname,
      category = "group",
      state,
      page,
      confirmedPage,
      onPage,
      onNext,
      onPrevious,
      onRetry,
    },
  ) {
    const d = root.ownerDocument;
    root.replaceChildren();
    const header = el(d, "div", "flex-center-v");
    const title = el(d, "h2", "title", postsTitle(nickname, category));
    const status = el(d, "span");
    status.setAttribute("role", "status");
    const message = d.createTextNode("");
    status.append(message);
    header.append(title, status);
    root.append(header);
    const contentName = category === "replies" ? "评论回复" : "帖子";
    if (state.loading) message.textContent = `正在加载${contentName}…`;
    if (state.items?.length) {
      const list = el(d, "div", "entry-list");
      for (const item of state.items) {
        const row = el(d, "div", "item clearit");
        const entry = el(d, "div", "entry");
        const heading = el(d, "h2", "title");
        const link = el(d, "a", "l", item.title);
        link.href = item.url;
        heading.append(link);
        const tools = el(d, "div", "tools");
        const time = el(d, "div", "time");
        entry.append(heading);
        if (item.kind === "replies") {
          const content = el(d, "div", "content");
          const excerpt = el(d, "a", "", item.excerpt);
          excerpt.href = item.url;
          content.append(excerpt);
          entry.append(content);
          time.append(item.sourceLabel, " · ");
        }
        if (item.parent) {
          const parent = el(d, item.parentURL ? "a" : "span", "", item.parent);
          if (item.parentURL) parent.href = item.parentURL;
          time.append(parent, " · ");
        }
        time.append(formatTime(item.createdAt));
        if (item.kind !== "replies") {
          const replies = el(d, "a", "l", `${item.replies} 回复`);
          replies.href = item.url;
          time.append(" · ", replies);
        }
        tools.append(time);
        entry.append(tools);
        row.append(entry);
        list.append(row);
      }
      root.append(list);
    } else if (!state.loading && !state.error)
      message.textContent = `没有找到已收录的${contentName}`;
    if (state.error || state.warning) {
      message.textContent =
        state.error?.message ||
        `无法确认是否还有下一页：${state.warning?.message || "请继续重试"}`;
      const retry = el(d, "a", "chiiBtn");
      retry.href = category === "all" ? "#posts" : `#posts/${category}`;
      retry.append(el(d, "span", "", "重试"));
      retry.addEventListener("click", (event) => {
        event.preventDefault();
        onRetry();
      });
      status.append(" ", retry);
    }
    if (state.items?.length) {
      const pages = el(d, "div", "page_inner");
      const pageHref = category === "all" ? "#posts" : `#posts/${category}`;
      if (page > 1) {
        const previous = el(d, "a", "p", "‹‹");
        previous.setAttribute("aria-label", "上一页");
        previous.href = pageHref;
        if (state.loading) previous.setAttribute("aria-disabled", "true");
        previous.addEventListener("click", (event) => {
          event.preventDefault();
          if (!state.loading) onPrevious();
        });
        pages.append(previous);
      }
      const first = Math.min(
        Math.max(1, page - 2),
        Math.max(1, confirmedPage - 9),
      );
      for (
        let number = first;
        number <= Math.min(confirmedPage, first + 9);
        number++
      ) {
        if (number === page) {
          const current = el(d, "strong", "p_cur", String(number));
          current.dataset.page = "";
          pages.append(current);
          continue;
        }
        const link = el(d, "a", "p", String(number));
        link.dataset.pageLink = String(number);
        link.href = pageHref;
        if (state.loading) link.setAttribute("aria-disabled", "true");
        link.addEventListener("click", (event) => {
          event.preventDefault();
          if (!state.loading) onPage(number);
        });
        pages.append(link);
      }
      if (state.next !== "no") {
        const next = el(d, "a", "p", "››");
        next.setAttribute(
          "aria-label",
          state.next === "unknown" ? "下一页（未确认）" : "下一页",
        );
        next.dataset.next = "";
        next.href = pageHref;
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
    "#posts/replies": "replies",
  };

  // Application boundary: a real Window and one replaceable network boundary.
  function start(window, { fetch = window.fetch.bind(window), timers } = {}) {
    const entryHost = inspectEntry(window);
    if (!entryHost) {
      if (categories[window.location.hash])
        console.warn("用户帖子：当前页面无法安全挂载");
      return;
    }
    const { document } = window;
    if (entryHost.nav.querySelector("[data-user-topics-link]")) return;
    const entry = document.createElement("li");
    entry.dataset.userTopicsLink = "";
    const anchor = document.createElement("a");
    anchor.textContent = "帖子";
    anchor.href = "#posts";
    entry.append(anchor);
    entryHost.blog.parentElement.after(entry);

    // Entry insertion is path-scoped. The takeover nodes, view, feed and
    // runtime guards only come together at the first verified activation, so a
    // page that cannot be verified surfaces a visible error instead of the
    // entry silently never working.
    let session = null;
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
        if (!explicitNavigation && !visible) route(true);
      }
    });
    let visible = false,
      suspended = false,
      category = null,
      takeoverEpoch = 0,
      previousTitle = null,
      ownedTitle = null;
    function updateTitle(next) {
      if (previousTitle === null) previousTitle = document.title;
      if (ownedTitle === null || document.title === ownedTitle) {
        ownedTitle = postsTitle(entryHost.nickname, next);
        document.title = ownedTitle;
      }
    }
    function restoreTitle() {
      if (ownedTitle !== null && document.title === ownedTitle)
        document.title = previousTitle;
      previousTitle = ownedTitle = null;
    }
    function establishSession(host) {
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
            confirmedPage: 0,
            current: { loading: false },
            pending: null,
            ready: null,
            started: false,
            target: 1,
          },
        ]),
      );
      return { host, view, feed, states, observer: watchHost(host) };
    }
    // Re-verification refreshes every takeover node reference; the runtime
    // guards and the view read them dynamically, the observer must be rebuilt.
    function rebindSession(verified) {
      session.observer.disconnect();
      Object.assign(session.host, verified);
      session.observer = watchHost(session.host);
    }
    function watchHost(host) {
      const main = host.columns.parentElement;
      const navWrapper = host.nav.parentElement;
      const subjectNav = host.subjectNav;
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
          attributeFilter: [
            "data-user-topics-original-subnav",
            "class",
            "style",
          ],
        });
      return observer;
    }
    function showErrorPanel() {
      if (document.querySelector("[data-user-topics-error]")) return;
      const panel = document.createElement("section");
      panel.dataset.userTopicsError = "";
      panel.textContent = "无法安全挂载帖子视图";
      panel.style.cssText =
        "max-width: 750px; margin: 6px auto 0; text-align: center;";
      entryHost.subjectNav.after(panel);
      console.warn("用户帖子：接管校验未通过，帖子视图未挂载");
    }
    function removeErrorPanel() {
      document.querySelector("[data-user-topics-error]")?.remove();
    }
    const mounted = () => {
      if (!session) return false;
      const host = session.host;
      const main = host.columns.parentElement;
      const navWrapper = host.nav.parentElement;
      const subjectNav = host.subjectNav;
      return (
        host.wrapper.matches("#wrapperNeue") &&
        host.profile.matches("#headerProfile") &&
        host.profile.parentElement === host.wrapper &&
        main.matches(".mainWrapper") &&
        host.profile.nextElementSibling === main &&
        host.columns.parentElement === main &&
        host.footer.matches("#footer") &&
        host.footer.parentElement === main &&
        (!host.originalSub ||
          (host.originalSub.isConnected &&
            host.originalSub.parentElement === subjectNav)) &&
        subjectNav.matches(".subjectNav") &&
        subjectNav.parentElement === host.profile &&
        navWrapper.matches(".navTabsWrapper") &&
        navWrapper.parentElement === subjectNav &&
        host.nav.matches(".navTabs") &&
        host.nav.parentElement === navWrapper
      );
    };
    const activeHostValid = () =>
      mounted() &&
      session.host.wrapper.dataset.userTopicsActive === "on" &&
      session.view.intact() &&
      (!session.host.originalSub ||
        session.host.originalSub.dataset.userTopicsOriginalSubnav === "on") &&
      window.getComputedStyle(session.host.columns).display === "none" &&
      (!session.host.originalSub ||
        window.getComputedStyle(session.host.originalSub).display === "none");
    function paint() {
      if (!visible || !session) return;
      const root = document.querySelector("[data-user-topics-view]");
      const state = session.states[category];
      const subnav = document.querySelector("[data-user-topics-subnav]");
      if (subnav) renderPostsNav(subnav, category);
      if (root)
        renderPosts(root, {
          nickname: session.host.nickname,
          category,
          state: state.current,
          page: state.page,
          confirmedPage: state.confirmedPage,
          onPage: (target) => load(category, target),
          onNext: () => load(category, state.page + 1),
          onPrevious: () => load(category, state.page - 1),
          onRetry: () =>
            load(category, state.current.target || state.page, true),
        });
    }
    function publish(filter) {
      if (!session) return;
      const state = session.states[filter];
      if (!state.ready || !visible || category !== filter) return;
      if (!activeHostValid()) {
        route();
        return;
      }
      const { target, result } = state.ready;
      state.ready = null;
      if (result.error)
        state.current = {
          ...state.current,
          loading: false,
          error: result.error,
          target,
        };
      else if (result.items.length) {
        session.feed.commit(filter, target, result.items);
        state.page = target;
        state.confirmedPage = Math.max(
          state.confirmedPage,
          target + (result.next === "yes" ? 1 : 0),
        );
        state.current = { ...result, loading: false };
      } else
        state.current = {
          ...state.current,
          loading: false,
          next: "no",
          error: null,
        };
      paint();
    }
    async function load(filter, target, retry = false) {
      if (!visible || !session || category !== filter) return;
      if (!activeHostValid()) {
        route();
        return;
      }
      const state = session.states[filter];
      if (state.pending) return;
      state.started = true;
      state.target = target;
      state.ready = null;
      const scroll = !retry && target !== state.page;
      if (scroll) window.scrollTo(0, 0);
      const epoch = takeoverEpoch;
      state.current = {
        ...state.current,
        loading: true,
        error: null,
        warning: null,
        target,
      };
      paint();
      const job = session.feed.prepare(filter, target, retry);
      state.pending = job;
      let result;
      try {
        result = await job;
      } catch (error) {
        result = { error };
      }
      if (state.pending !== job || epoch !== takeoverEpoch) return;
      state.pending = null;
      state.ready = { target, result };
      publish(filter);
    }
    // An explicit click on the entry can reenter after a suspended host recovers.
    function route(explicit = false) {
      const next = categories[window.location.hash];
      const invalid = visible && (!mounted() || !activeHostValid());
      if (!next || invalid) {
        explicitNavigation = false;
        if (visible) {
          visible = false;
          suspended = Boolean(next && invalid);
          if (suspended) takeoverEpoch++;
          category = null;
          session.feed.setForeground(null);
          if (suspended)
            for (const state of Object.values(session.states)) {
              if (state.ready || state.pending || state.current.loading)
                state.started = false;
              state.ready = null;
              state.pending = null;
              state.current = { ...state.current, loading: false };
            }
          anchor.classList.remove("focus");
          session.view.hide();
          restoreTitle();
        } else if (!next) {
          suspended = false;
          removeErrorPanel();
        }
        return;
      }
      if (suspended && !explicit && !explicitNavigation) return;
      if (!visible) {
        // Takeover still needs a full safety check at activation time; a failed
        // check shows the mount error panel and leaves the host untouched.
        const verified = verifyTakeover(window);
        if (!verified) {
          suspended = false;
          showErrorPanel();
          return;
        }
        removeErrorPanel();
        suspended = false;
        if (!session) session = establishSession(verified);
        else rebindSession(verified);
      } else suspended = false;
      if (visible && category === next) {
        explicitNavigation = false;
        return;
      }
      visible = true;
      category = next;
      updateTitle(next);
      session.feed.setForeground(next);
      session.view.show();
      anchor.classList.add("focus");
      paint();
      explicitNavigation = false;
      const state = session.states[next];
      if (state.ready) publish(next);
      else if (!state.started) load(next, state.page);
      else if (state.pending) {
        state.current = { ...state.current, loading: true };
        paint();
      }
    }
    window.addEventListener("hashchange", () => route());
    route();
  }

  start(window);
})();
