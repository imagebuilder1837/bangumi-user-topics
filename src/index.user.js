// ==UserScript==
// @name         Bangumi 用户帖子
// @namespace    https://github.com/imagebuilder1837/bangumi-user-topics
// @version      0.1.3
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
[data-user-topics-main="on"] > :not([data-user-topics-footer="on"]):not([data-user-topics-footer="on"] ~ *):not([data-user-topics-view]),
[data-user-topics-original-subnav="on"] { display: none !important; }
[data-user-topics-active="on"], [data-user-topics-header="on"] { min-width: 0 !important; }
[data-user-topics-main="on"] { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-view] { width: 100%; max-width: 750px; margin: 0 auto; padding-top: 10px; min-height: 200px; box-sizing: border-box; }
[data-user-topics-view] > .flex-center-v { flex-wrap: wrap; justify-content: flex-start; column-gap: .6em; }
[data-user-topics-view] > .flex-center-v > [role="status"] { color: #999; min-width: 0; max-width: 100%; overflow-wrap: anywhere; text-align: left; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;

  // null means this is not a recognizable, in-scope personal page. A failure
  // carries a live personal navigation anchor and the first blocking reason.
  function verifyTakeover(window) {
    const base = inspectEntry(window);
    if (!base || base.failure) return base;
    const scope = base.wrapper || base.profile.parentElement;
    const mains = [...scope.querySelectorAll(".mainWrapper")].filter(
      (main) =>
        !main.contains(base.profile) &&
        !base.profile.contains(main) &&
        !!(
          base.profile.compareDocumentPosition(main) &
          window.Node.DOCUMENT_POSITION_FOLLOWING
        ),
    );
    const boundaries = mains.flatMap((main) =>
      [...main.querySelectorAll(":scope > #footer")].map((footer) => ({
        main,
        footer,
      })),
    );
    let reason;
    if (!mains.length) reason = "未找到可挂载的正文容器。";
    else if (!boundaries.length) reason = "未找到正文中的 footer 挂载边界。";
    else if (boundaries.length !== 1)
      reason = "正文存在多个 footer 挂载边界，无法确定挂载位置。";
    if (reason)
      return { failure: { nav: base.nav, navMount: base.navMount, reason } };
    const originalSub = [
      ...base.profile.querySelectorAll(".navSubTabsWrapper"),
    ].find(
      (node) =>
        !node.hasAttribute("data-user-topics-error") &&
        !node.hasAttribute("data-user-topics-subnav") &&
        !node.contains(base.nav) &&
        !base.nav.contains(node) &&
        node.querySelector(":scope > .navSubTabs"),
    );
    return { ...base, ...boundaries[0], originalSub: originalSub || null };
  }

  function inspectEntry(window) {
    const { document, location } = window;
    if (
      !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.hostname) ||
      location.protocol !== "https:"
    )
      return null;
    const userMatch = userPath.exec(location.pathname);
    const collectionMatch = collectionPath.exec(location.pathname);
    if (!userMatch && !collectionMatch) return null;
    const profile = document.querySelector("#headerProfile");
    const nav = profile?.querySelector(".navTabs");
    if (!nav) return null;
    const navWrapper = nav.closest(".navTabsWrapper");
    const navMount =
      navWrapper && profile.contains(navWrapper) ? navWrapper : nav;
    const fail = (reason) => ({ failure: { nav, navMount, reason } });
    const rawKey = userMatch?.[1] || collectionMatch[2];
    let user;
    try {
      user = decodeURIComponent(rawKey);
    } catch {
      return fail("页面中的用户 key 无法解码。");
    }
    if (!user || !/^[\p{L}\p{N}_-]+$/u.test(user))
      return fail("页面中的用户 key 不适用于用户查询。");
    const blogs = [...nav.querySelectorAll(":scope > li > a[href]")].filter(
      (anchor) => {
        if (anchor.parentElement.hasAttribute("data-user-topics-link"))
          return false;
        try {
          const url = new URL(anchor.href);
          return (
            url.origin === location.origin &&
            /^\/user\/[^/]+\/blog\/?$/.test(url.pathname)
          );
        } catch {
          return false;
        }
      },
    );
    if (!blogs.length) return fail("个人导航中未找到目标用户的日志链接。");
    try {
      if (
        blogs.some(
          (anchor) =>
            decodeURIComponent(new URL(anchor.href).pathname.split("/")[2]) !==
            user,
        )
      )
        return fail("个人导航中的日志链接与页面目标用户身份冲突。");
    } catch {
      return fail("个人导航中的日志链接用户 key 无法解码。");
    }
    const blog = blogs[0];
    const name = profile.querySelector("h1 .name");
    const nicknameLink = [
      ...(name?.querySelectorAll(":scope > a[href]") || []),
    ].find((anchor) => {
      try {
        const url = new URL(anchor.href);
        const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
        return (
          url.origin === location.origin &&
          match &&
          decodeURIComponent(match[1]) === user
        );
      } catch {
        return false;
      }
    });
    const nickname =
      nicknameLink?.textContent.trim() ||
      [...(name?.childNodes || [])]
        .filter((node) => node.nodeType === window.Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join("")
        .trim() ||
      user;
    return {
      wrapper: profile.closest("#wrapperNeue"),
      profile,
      nav,
      navMount,
      blog,
      user,
      nickname,
    };
  }

  // Observers below only relinquish restoration ownership after external writes.
  // They never inspect host structure, exit the view or trigger a new takeover.
  function ownAttribute(window, node, name) {
    if (!node) return () => {};
    const previous = node.getAttribute(name);
    node.setAttribute(name, "on");
    let owned = true;
    const observer = new window.MutationObserver(() => {
      owned = false;
    });
    observer.observe(node, { attributes: true, attributeFilter: [name] });
    return () => {
      if (observer.takeRecords().length) owned = false;
      observer.disconnect();
      if (!owned || node.getAttribute(name) !== "on") return;
      if (previous === null) node.removeAttribute(name);
      else node.setAttribute(name, previous);
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
      hiddenContent = [],
      releases = [],
      focusOwned = false;
    const focusObserver = new window.MutationObserver(() => {
      focusOwned = false;
    });
    function show() {
      if (root) return;
      previousScroll = window.scrollY;
      hiddenContent = [...host.main.children].slice(
        0,
        [...host.main.children].indexOf(host.footer),
      );
      previousFocus = hiddenContent.some((node) =>
        node.contains(document.activeElement),
      )
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
      releases = [
        ownAttribute(window, host.wrapper, "data-user-topics-active"),
        ownAttribute(
          window,
          host.wrapper?.querySelector("#headerNeue2"),
          "data-user-topics-header",
        ),
        ownAttribute(window, host.main, "data-user-topics-main"),
        ownAttribute(window, host.footer, "data-user-topics-footer"),
        ownAttribute(
          window,
          host.originalSub,
          "data-user-topics-original-subnav",
        ),
      ];
      document.head.append(style);
      subnav = document.createElement("div");
      subnav.className = "navSubTabsWrapper";
      subnav.dataset.userTopicsSubnav = "";
      (host.originalSub || host.navMount).after(subnav);
      root = document.createElement("section");
      root.dataset.userTopicsView = "";
      host.footer.before(root);
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
      if (focusObserver.takeRecords().length) focusOwned = false;
      focusObserver.disconnect();
      style.remove();
      for (const release of releases) release();
      releases = [];
      if (
        focusOwned &&
        focus?.isConnected &&
        !host.nav.querySelector(":scope > li > a.focus")
      )
        focus.classList.add("focus");
      focusOwned = false;
      if (
        releaseFocus &&
        previousFocus?.isConnected &&
        host.main.contains(previousFocus) &&
        hiddenContent.some((node) => node.contains(previousFocus))
      )
        previousFocus.focus();
      previousFocus = null;
      hiddenContent = [];
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
    return {
      show,
      hide,
      get root() {
        return root;
      },
      get subnav() {
        return subnav;
      },
    };
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
      data: {
        source: row.source,
        id: row.id,
        containerID: row.containerID,
        containerTitle: row.containerTitle ?? null,
        excerpt: row.excerpt,
        parentID: row.parentID ?? null,
        parentName: row.parentName ?? null,
        createdAt: row.createdAt,
      },
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
        data: {
          id: row.id,
          kind: row.kind,
          parentID: row.parentID,
          title: row.title,
          replyCount: row.replyCount,
          createdAt: row.createdAt,
          updatedAt: 0,
          parentName: row.parentName ?? null,
        },
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

  class RetryableError extends Error {}

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
            let response;
            try {
              response = await fetch(url.href, {
                credentials: "omit",
                signal: controller.signal,
              });
            } catch (error) {
              throw new RetryableError(
                error?.message || "SearchEncore 网络请求失败",
                { cause: error },
              );
            }
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
            if (!response.ok) {
              const ErrorType =
                response.status === 408 ||
                (response.status >= 500 && response.status <= 599)
                  ? RetryableError
                  : Error;
              throw new ErrorType(`SearchEncore HTTP ${response.status}`);
            }
            let payload;
            try {
              payload = await response.json();
            } catch (error) {
              // Body transport/decode failures differ from invalid JSON syntax.
              if (error?.name === "TypeError" || error?.name === "AbortError")
                throw new RetryableError(
                  error.message || "SearchEncore 响应体读取失败",
                  { cause: error },
                );
              throw error;
            }
            return normalizeBatch(payload, {
              offset,
              limit,
              origin,
              kind,
            });
          })(),
          new Promise((_, reject) => {
            timeout = delay(() => {
              controller.abort();
              reject(new RetryableError("SearchEncore 请求超时，请重试"));
            }, 15000);
          }),
        ]);
      } finally {
        clear(timeout);
      }
    };
  }

  // One scheduler per application document; feeds retain their own user data.
  function createRequestScheduler({ now = Date.now, delay = setTimeout } = {}) {
    let inFlight = 0,
      cooldown = 0,
      paused = false,
      scheduled = false;
    const queue = [];
    function wake() {
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
        const front = queue.findIndex((job) => job.isForeground());
        const job = queue.splice(front < 0 ? 0 : front, 1)[0];
        inFlight++;
        job.attempts++;
        job
          .run()
          .then(job.resolve, (error) => {
            if (error instanceof RateLimitError) {
              paused = true;
              cooldown = Math.max(cooldown, error.retryAfter);
              for (const waiting of queue.splice(0)) waiting.reject(error);
            }
            if (error instanceof RetryableError && job.attempts < 3) {
              delay(() => {
                if (paused) job.reject(new Error("请求已暂停，请稍后重试"));
                else {
                  queue.push(job);
                  wake();
                }
              }, job.attempts * 1000);
            } else job.reject(error);
          })
          .finally(() => {
            inFlight--;
            wake();
          });
      }
    }
    function submit(run, isForeground) {
      if (paused) return Promise.reject(new Error("请求已暂停，请稍后重试"));
      const result = new Promise((resolve, reject) => {
        queue.push({ run, isForeground, resolve, reject, attempts: 0 });
      });
      wake();
      return result;
    }
    function retry() {
      if (paused && now() < cooldown) return false;
      paused = false;
      wake();
      return true;
    }
    return {
      submit,
      wake,
      retry,
      get paused() {
        return paused;
      },
    };
  }

  const headFingerprint = (items) =>
    JSON.stringify(items.map(({ data, received, ...item }) => item));

  // Storage is optional. Resolve the property inside the guard: even accessing
  // window.localStorage can throw when browser policy disallows persistence.
  function createTopicCache(getStorage, { user, origin }) {
    const key = (kind) =>
      `bangumi-user-topics:stream:${encodeURIComponent(user)}:${kind}`;
    const normalize = (data, kind) =>
      normalizeBatch(
        {
          data,
          pagination: {
            offset: 0,
            limit: data.length,
            total: 0,
            totalIsEstimate: false,
          },
          meta: { executionMs: 0 },
        },
        { offset: 0, limit: data.length, origin, kind },
      );
    return {
      read(kind) {
        try {
          const record = JSON.parse(getStorage().getItem(key(kind)));
          if (
            record?.version !== 1 ||
            record.user !== user ||
            record.kind !== kind ||
            !Array.isArray(record.rows) ||
            !Array.isArray(record.head) ||
            !Number.isSafeInteger(record.offset) ||
            record.offset < record.rows.length ||
            record.offset > 5050 ||
            typeof record.exhausted !== "boolean" ||
            !Number.isSafeInteger(record.goal) ||
            record.goal < 100 ||
            record.goal % 100 !== 0 ||
            (!record.exhausted && record.rows.length < record.goal) ||
            record.head.length > Math.min(50, record.offset) ||
            (!record.head.length &&
              (record.offset !== 0 || record.rows.length || !record.exhausted))
          )
            return null;
          const rows = normalize(record.rows, kind);
          const head = normalize(record.head, kind);
          const identities = new Set(rows.map((item) => item.key));
          const initial = new Map();
          for (const item of head)
            if (!initial.has(item.key)) initial.set(item.key, item);
          if (
            identities.size !== rows.length ||
            head.some((item) => !identities.has(item.key)) ||
            headFingerprint([...initial.values()]) !==
              headFingerprint(rows.slice(0, initial.size))
          )
            return null;
          return {
            rows,
            head,
            offset: record.offset,
            exhausted: record.exhausted,
          };
        } catch {
          return null;
        }
      },
      write(kind, stream, goal) {
        try {
          getStorage().setItem(
            key(kind),
            JSON.stringify({
              version: 1,
              user,
              kind,
              goal,
              rows: stream.rows.map((item) => item.data),
              head: stream.head.map((item) => item.data),
              offset: stream.offset,
              exhausted: stream.exhausted,
            }),
          );
          return null;
        } catch {
          return new Error("缓存保存失败，本次使用内存数据");
        }
      },
    };
  }

  // Service cursors are shared; displayed identities and late exclusions belong to a category.
  const topicKinds = ["group", "subject"];
  const kinds = [...topicKinds, "replies"];
  const sourceNames = {
    group: "小组话题",
    subject: "条目讨论",
    replies: "评论回复",
  };
  const sourceFailure = (kind, error) =>
    new Error(`${sourceNames[kind]}：${error.message}`, { cause: error });
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

  function createTopicFeed(
    search,
    {
      user,
      origin,
      scheduler = createRequestScheduler(),
      cache,
      onChange = () => {},
    },
  ) {
    const streams = Object.fromEntries(
      kinds.map((kind) => [
        kind,
        {
          offset: 0,
          exhausted: false,
          pending: null,
          progressWaiters: new Set(),
          rows: [],
          head: [],
          checked: true,
          error: null,
          failedGoal: 0,
          draft: null,
          dirty: false,
          cached: false,
          storageWarning: null,
        },
      ]),
    );
    const views = Object.fromEntries(
      ["all", ...kinds].map((kind) => [
        kind,
        {
          category: kind,
          revision: 0,
          refreshing: false,
          hold: null,
          changed: false,
          pages: new Map(),
          excluded: new Set(),
          frozenAt: 0,
          goal: 0,
          failure: null,
          failureKind: null,
          sourceFailures: {},
          pending: null,
          restart: false,
          waiters: new Set(),
          stalled: Object.fromEntries(kinds.map((kind) => [kind, 0])),
        },
      ]),
    );
    let received = 0;
    for (const kind of kinds) {
      const record = cache?.read(kind);
      if (!record) continue;
      Object.assign(streams[kind], record, { checked: false, cached: true });
      for (const item of record.rows) {
        item.received = received++;
      }
    }
    let foreground = null;
    function setForeground(category) {
      foreground = category;
      scheduler.wake();
    }
    function visibleStreams(view) {
      return view.hold || streams;
    }
    function candidates(category, live = false) {
      const view = views[category];
      const sources = live ? streams : visibleStreams(view);
      const ignoreFreeze = live && view.changed;
      const displayed = new Set([...view.pages.values()].flat());
      const boundaryKey = view.pages
        .get(Math.max(...view.pages.keys()))
        ?.at(-1);
      const boundary = requiredKinds(category)
        .flatMap((kind) => visibleStreams(view)[kind].rows)
        .find((item) => item.key === boundaryKey);
      const result = [];
      for (const kind of requiredKinds(category)) {
        for (const item of sources[kind].rows) {
          if (!ignoreFreeze && view.excluded.has(item.key)) continue;
          if (
            !ignoreFreeze &&
            boundary &&
            item.received >= view.frozenAt &&
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
    function snapshot(category, page) {
      const view = views[category];
      const entries = candidates(category);
      const required = requiredKinds(category);
      const sources = visibleStreams(view);
      const byKey = new Map(
        required
          .flatMap((kind) => sources[kind].rows)
          .map((item) => [item.key, item]),
      );
      const exhausted = required.every((kind) => sources[kind].exhausted);
      const depth = Math.min(
        entries.length,
        ...required.map((kind) =>
          sources[kind].exhausted
            ? Infinity
            : entries.filter((item) => item.kind === kind).length,
        ),
      );
      const actualPage =
        view.revision && exhausted
          ? Math.min(page, Math.max(1, Math.ceil(entries.length / 10)))
          : page;
      const frozen = view.pages.get(actualPage);
      const goal = actualPage * 10;
      const failedKind = required.find((kind) => streams[kind].error);
      const failure =
        view.failure ||
        (failedKind
          ? sourceFailure(failedKind, streams[failedKind].error)
          : null);
      if (!frozen && depth < goal && !exhausted)
        return failure && !view.restart ? { error: failure } : null;
      return {
        revision: view.revision,
        page: actualPage,
        items: frozen
          ? frozen.map((key) => byKey.get(key))
          : entries.slice((actualPage - 1) * 10, goal),
        next: depth > goal ? "yes" : exhausted ? "no" : "unknown",
        confirmedPage: Math.ceil(depth / 10),
        prefetching: Boolean(view.pending),
        warning: failure,
        cacheStatus:
          view.pending &&
          (view.changed || required.some((kind) => streams[kind].draft))
            ? "正在更新缓存，暂用缓存…"
            : view.pending && required.some((kind) => !streams[kind].checked)
              ? "正在核验缓存…"
              : null,
        cacheFailure: Boolean(
          failure &&
            (view.refreshing || (failedKind && streams[failedKind].cached)),
        ),
        cacheWarning: required
          .map((kind) => streams[kind].storageWarning)
          .find(Boolean),
      };
    }
    function notify() {
      // Join an existing rebuild for the visible cached category before a lower
      // category can commit it. Failed sources remain stopped until explicit retry.
      const active = views[foreground];
      if (
        active?.goal &&
        !active.pending &&
        requiredKinds(active.category).some(
          (kind) => streams[kind].draft && !streams[kind].error,
        )
      )
        run(active);
      for (const stream of Object.values(streams)) {
        for (const resolve of stream.progressWaiters) resolve();
        stream.progressWaiters.clear();
      }
      const all = views.all;
      if (
        all.hold &&
        !all.changed &&
        topicKinds.every(
          (kind) =>
            streams[kind].cached &&
            streams[kind].checked &&
            !streams[kind].draft,
        )
      )
        all.hold = null;
      for (const view of Object.values(views)) {
        if (!view.goal) continue;
        for (const waiter of view.waiters) {
          const result = snapshot(view.category, waiter.page);
          if (result) {
            view.waiters.delete(waiter);
            waiter.resolve(result);
          }
        }
        onChange(view.category);
      }
    }
    function ingest(target, batch) {
      const identities = new Set(target.rows.map((item) => item.key));
      if (target.offset === 0) target.head = batch;
      for (const item of batch) {
        if (identities.has(item.key)) continue;
        identities.add(item.key);
        item.received = received++;
        target.rows.push(item);
      }
      target.offset += batch.length;
      if (!batch.length) target.exhausted = true;
      target.dirty = true;
    }
    function invalidate(kind) {
      for (const view of Object.values(views)) {
        if (!requiredKinds(view.category).includes(kind)) continue;
        if (view.hold) view.changed = true;
        else resetPages(view);
      }
    }
    function resetPages(view) {
      view.pages.clear();
      view.excluded.clear();
      view.frozenAt = 0;
      view.revision++;
    }
    function resumeSource(kind) {
      streams[kind].error = null;
      streams[kind].failedGoal = 0;
      for (const view of Object.values(views)) delete view.sourceFailures[kind];
    }
    function clearSourceFailure(kind) {
      resumeSource(kind);
      for (const view of Object.values(views)) {
        if (view.failureKind !== kind) continue;
        view.failure = null;
        view.failureKind = null;
      }
    }
    function availableFor(view, kind) {
      return streams[kind].draft
        ? streams[kind].draft.rows.length
        : candidates(view.category, true).filter((item) => item.kind === kind)
            .length;
    }
    function activeConsumers(kind) {
      return Object.values(views).filter(
        (view) => view.pending && requiredKinds(view.category).includes(kind),
      );
    }
    function rememberSourceFailure(kind, error) {
      streams[kind].error = error;
      streams[kind].failedGoal = Math.max(
        streams[kind].failedGoal,
        ...activeConsumers(kind).map((view) => view.goal),
      );
    }
    function save(kind, goal) {
      const stream = streams[kind];
      const target = stream.draft || stream;
      const consumers = activeConsumers(kind);
      // Shared work commits only at the highest outstanding category target.
      if (
        !target.exhausted &&
        consumers.some((view) => availableFor(view, kind) < view.goal)
      )
        return false;
      goal = Math.max(goal, ...consumers.map((view) => view.goal));
      clearSourceFailure(kind);
      if (stream.draft) {
        Object.assign(stream, stream.draft, { draft: null });
        invalidate(kind);
      }
      if (stream.dirty) {
        stream.storageWarning = cache?.write(kind, stream, goal) || null;
        stream.dirty = false;
      }
      notify();
      return true;
    }
    function request(kind, offset, limit, category, consume) {
      const stream = streams[kind];
      const job = { categories: new Set([category]) };
      const promise = scheduler.submit(
        () => search({ user, origin, kind, offset, limit }),
        () => job.categories.has(foreground),
      );
      const pending = { job, promise };
      stream.pending = pending;
      pending.promise = promise
        .then((batch) => {
          if (!Array.isArray(batch) || batch.length > limit)
            throw new Error("SearchEncore 返回格式无效");
          consume(batch);
          notify();
        })
        .catch((error) => {
          rememberSourceFailure(kind, error);
          throw error;
        })
        .finally(() => {
          if (stream.pending === pending) stream.pending = null;
        });
      return pending;
    }
    async function fill(view) {
      try {
        const outcomes = await Promise.allSettled(
          requiredKinds(view.category).map(async (kind) => {
            const stream = streams[kind];
            try {
              // Joining another source's rebuild must preserve this source's
              // failed target, including category-specific no-progress pauses.
              if (view.sourceFailures[kind]) throw view.sourceFailures[kind];
              if (stream.error) throw stream.error;
              if (!stream.checked) {
                const pending =
                  stream.pending ||
                  request(kind, 0, 50, view.category, (batch) => {
                    if (
                      headFingerprint(batch) !== headFingerprint(stream.head)
                    ) {
                      stream.draft = {
                        rows: [],
                        head: [],
                        offset: 0,
                        exhausted: false,
                      };
                      ingest(stream.draft, batch);
                    }
                    stream.checked = true;
                    clearSourceFailure(kind);
                  });
                pending.job.categories.add(view.category);
                await pending.promise;
              }
              while (true) {
                if (stream.error) throw stream.error;
                const target = stream.draft || stream;
                const available = availableFor(view, kind);
                if (available >= view.goal || target.exhausted) {
                  if (save(kind, view.goal)) return;
                  // Another category owns a higher shared target. Keep the barrier
                  // until its progress completes or fails, without issuing extra work.
                  const error = await new Promise((resolve) =>
                    stream.progressWaiters.add(resolve),
                  );
                  if (error) throw error;
                  continue;
                }
                // A same-round independent consumer inherits this higher target.
                // Otherwise stop the failed aggregate without poisoning this stream.
                if (
                  view.failure &&
                  !view.refreshing &&
                  !activeConsumers(kind).some((consumer) => consumer !== view)
                )
                  return;
                if (scheduler.paused) throw new Error("请求已暂停，请稍后重试");
                if (target.offset > 5000)
                  throw unavailable(target, view.category);
                const pending =
                  stream.pending ||
                  request(
                    kind,
                    target.offset,
                    Math.min(50, view.goal - available),
                    view.category,
                    (batch) => ingest(target, batch),
                  );
                pending.job.categories.add(view.category);
                await pending.promise;
                const after = availableFor(view, kind);
                view.stalled[kind] =
                  after > available ? 0 : view.stalled[kind] + 1;
                if (
                  !(stream.draft || stream).exhausted &&
                  view.stalled[kind] >= 3
                )
                  throw new Error("连续三批没有有效新增，请继续重试");
              }
            } catch (error) {
              view.sourceFailures[kind] = error;
              for (const resolve of stream.progressWaiters) resolve(error);
              stream.progressWaiters.clear();
              if (stream.cached) rememberSourceFailure(kind, error);
              if (!view.failure) {
                view.failure =
                  view.refreshing || stream.cached
                    ? sourceFailure(kind, error)
                    : error;
                view.failureKind = kind;
              }
              notify();
              throw error;
            }
          }),
        );
        const failed = outcomes.find(
          (outcome) => outcome.status === "rejected",
        );
        if (failed) throw failed.reason;
      } finally {
        scheduler.wake();
      }
    }
    function reset(view) {
      view.failure = null;
      view.failureKind = null;
      view.sourceFailures = {};
      view.stalled = Object.fromEntries(kinds.map((kind) => [kind, 0]));
    }
    function run(view) {
      view.refreshing =
        Boolean(view.hold) ||
        requiredKinds(view.category).some(
          (kind) =>
            streams[kind].cached &&
            (!streams[kind].checked ||
              streams[kind].draft ||
              streams[kind].error),
        );
      if (view.category === "all" && view.refreshing && !view.hold)
        view.hold = Object.fromEntries(
          topicKinds.map((kind) => [
            kind,
            {
              rows: [...streams[kind].rows],
              exhausted: streams[kind].exhausted,
            },
          ]),
        );
      const goal = view.goal;
      view.pending = Promise.resolve()
        .then(() => fill(view))
        .catch((error) => {
          view.failure ||= error;
        })
        .finally(() => {
          view.pending = null;
          if (view.restart && !scheduler.paused) {
            view.restart = false;
            reset(view);
            run(view);
          } else {
            view.restart = false;
            // One source may have finished before a later click raised the goal.
            if (!view.failure && !scheduler.paused && view.goal > goal)
              run(view);
          }
          if (!view.pending && view.hold) {
            view.hold = null;
            if (view.changed) resetPages(view);
            view.changed = false;
          }
          notify();
        });
    }
    function prepare(category, page, retry = false) {
      const view = views[category];
      if (!view || !Number.isInteger(page) || page < 1)
        throw new Error("无效分类或页码");
      const goal = 100 + 100 * Math.floor((page + 6) / 10);
      const higher = goal > view.goal;
      view.goal = Math.max(view.goal, goal);
      if (retry && !scheduler.retry())
        return Promise.resolve({ error: new Error("请求冷却中，请稍后重试") });
      if (retry || higher) {
        if (view.pending && view.failure) view.restart = true;
        else if (!view.pending) reset(view);
        for (const kind of requiredKinds(category)) {
          const stream = streams[kind];
          // Higher targets resume ordinary loads only, never failed verification
          // or an unfinished cache rebuild. Explicit retry may resume either.
          if (
            retry ||
            (stream.checked && !stream.draft && goal > stream.failedGoal)
          )
            resumeSource(kind);
        }
      }
      if (!view.pending && !view.failure) run(view);
      const result = snapshot(category, page);
      if (result) return Promise.resolve(result);
      return new Promise((resolve) => view.waiters.add({ page, resolve }));
    }
    function commit(category, page, items) {
      const view = views[category];
      if (!view.pages.has(page)) {
        if (!view.pages.size || page > Math.max(...view.pages.keys()))
          view.frozenAt = received;
        view.pages.set(
          page,
          items.map((item) => item.key),
        );
      }
    }
    return { prepare, snapshot, commit, setForeground };
  }

  const rendered = new WeakMap();

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
      preserveFocus = false,
    },
  ) {
    const d = root.ownerDocument;
    const active =
      preserveFocus && root.contains(d.activeElement) ? d.activeElement : null;
    const rowLink = [...root.querySelectorAll(".entry-list a")].indexOf(active);
    const focusKey = (node) => {
      if (node?.hasAttribute("data-page-link"))
        return `page:${node.dataset.pageLink}`;
      if (node?.hasAttribute("data-next")) return "next";
      if (node?.closest("[role=status]")) return "retry";
      if (node?.getAttribute("aria-label") === "上一页") return "previous";
      return null;
    };
    const key = focusKey(active);
    const previous = rendered.get(root);
    const list = root.querySelector(":scope > .entry-list");
    const reuseList = Boolean(
      list &&
        previous?.category === category &&
        previous.items.length === state.items?.length &&
        previous.items.every((item, i) => item === state.items[i]),
    );
    for (const child of [...root.children])
      if (!reuseList || child !== list) child.remove();
    rendered.set(root, { category, items: state.items || [] });
    const header = el(d, "div", "flex-center-v");
    const title = el(d, "h2", "title", postsTitle(nickname, category));
    const status = el(d, "span");
    status.setAttribute("role", "status");
    const message = d.createTextNode("");
    status.append(message);
    header.append(title, status);
    root.prepend(header);
    const contentName = category === "replies" ? "评论回复" : "帖子";
    if (state.loading) message.textContent = `正在加载${contentName}…`;
    else if (state.prefetching)
      message.textContent = `正在预加载${contentName}…`;
    if (state.cacheStatus) message.textContent = state.cacheStatus;
    if (state.cacheWarning) message.textContent = state.cacheWarning.message;
    if (state.items?.length && !reuseList) {
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
    } else if (
      !state.items?.length &&
      !state.loading &&
      !state.error &&
      !state.cacheStatus &&
      !state.cacheWarning
    )
      message.textContent = `没有找到已收录的${contentName}`;
    if (state.error || state.warning) {
      message.textContent =
        state.error?.message ||
        `${state.cacheFailure ? "缓存更新失败，正在使用缓存" : "预加载未完成"}：${state.warning?.message || "请继续重试"}`;
      if (state.cacheWarning)
        message.textContent += `；${state.cacheWarning.message}`;
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
    // Only retain an already-owned focus, never pull focus from the host or scroll.
    if (active && d.activeElement === d.body) {
      const replacement =
        rowLink >= 0
          ? root.querySelectorAll(".entry-list a")[rowLink]
          : key &&
            [...root.querySelectorAll("a")].find(
              (node) => focusKey(node) === key,
            );
      replacement?.focus({ preventScroll: true });
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
    const { document } = window;
    const entryHost = inspectEntry(window);
    if (!entryHost) return;
    if (entryHost.failure) {
      showErrorPanel(entryHost.failure, "帖子入口插入");
      return;
    }
    if (entryHost.nav.querySelector("[data-user-topics-link]")) return;
    removeErrorPanel();
    const entry = document.createElement("li");
    entry.dataset.userTopicsLink = "";
    const anchor = document.createElement("a");
    anchor.textContent = "帖子";
    anchor.href = "#posts";
    entry.append(anchor);
    entryHost.blog.parentElement.after(entry);

    // Entry insertion and entering the posts view are the only host checks.
    // Once active, DOM changes never suspend or automatically retake the page.
    const scheduler = createRequestScheduler({
      now: timers?.now,
      delay: timers?.setTimeout,
    });
    const sessions = new Map();
    let session = null;
    anchor.addEventListener("click", (event) => {
      if (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      ) {
        if (window.location.hash === "#posts" && !visible) route();
      }
    });
    let visible = false,
      category = null,
      previousTitle = null,
      ownedTitle = null;
    function updateTitle(next) {
      if (previousTitle === null) previousTitle = document.title;
      if (ownedTitle === null || document.title === ownedTitle) {
        ownedTitle = postsTitle(session.host.nickname, next);
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
        scheduler,
        cache: createTopicCache(() => window.localStorage, {
          user: host.user,
          origin: window.location.origin,
        }),
        onChange: refresh,
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
      return { host, view, feed, states };
    }
    function showErrorPanel(failure, stage = "帖子视图挂载") {
      const panel =
        document.querySelector("[data-user-topics-error]") ||
        document.createElement("section");
      panel.dataset.userTopicsError = "";
      panel.className = "navSubTabsWrapper";
      panel.setAttribute("role", "alert");
      const list = document.createElement("ul");
      list.className = "navSubTabs";
      const message = document.createElement("li");
      message.textContent = `${stage}失败：${failure.reason}`;
      list.append(message);
      panel.replaceChildren(list);
      failure.navMount.after(panel);
      window.console.warn(`用户帖子：${message.textContent}`, failure);
    }
    function removeErrorPanel() {
      document.querySelector("[data-user-topics-error]")?.remove();
    }
    function paint(preserveFocus = false) {
      if (!visible || !session) return;
      const { root, subnav } = session.view;
      const state = session.states[category];
      if (subnav) renderPostsNav(subnav, category);
      if (root)
        renderPosts(root, {
          nickname: session.host.nickname,
          category,
          state: state.current,
          page: state.page,
          confirmedPage: state.confirmedPage,
          preserveFocus,
          onPage: (target) => load(category, target),
          onNext: () =>
            load(
              category,
              state.page + 1,
              false,
              state.current.next === "unknown",
            ),
          onPrevious: () => load(category, state.page - 1),
          onRetry: () =>
            load(category, state.current.target || state.page, true),
        });
    }
    function refresh(filter) {
      if (!session || !visible || category !== filter) return;
      const state = session.states[filter];
      if (state.pending || state.ready || !state.started) return;
      const result = session.feed.snapshot(filter, state.page);
      if (!result) {
        load(filter, state.page);
        return;
      }
      if (result.error) return;
      if (result.revision !== state.current.revision) {
        state.page = result.page;
        state.confirmedPage = result.confirmedPage;
        state.current = { ...result, loading: false, target: state.page };
        session.feed.commit(filter, state.page, result.items);
        paint(true);
        return;
      }
      state.confirmedPage = Math.max(state.confirmedPage, result.confirmedPage);
      state.current = {
        ...state.current,
        next: result.next,
        warning: result.warning,
        prefetching: result.prefetching,
        cacheStatus: result.cacheStatus,
        cacheWarning: result.cacheWarning,
        cacheFailure: result.cacheFailure,
      };
      paint(true);
    }
    function publish(filter) {
      if (!session) return;
      const state = session.states[filter];
      if (!state.ready || !visible || category !== filter) return;
      const { target } = state.ready;
      const result = state.ready.result.error
        ? state.ready.result
        : session.feed.snapshot(filter, target) || state.ready.result;
      state.ready = null;
      if (result.error)
        state.current = {
          ...state.current,
          loading: false,
          error: result.error,
          target,
        };
      else if (
        result.items.length ||
        result.revision !== state.current.revision
      ) {
        state.page = result.page;
        session.feed.commit(filter, state.page, result.items);
        state.confirmedPage =
          result.revision !== state.current.revision
            ? result.confirmedPage
            : Math.max(state.confirmedPage, result.confirmedPage, state.page);
        state.current = { ...result, loading: false, target: state.page };
      } else
        state.current = {
          ...state.current,
          loading: false,
          next: "no",
          error: null,
          warning: result.warning,
          prefetching: result.prefetching,
        };
      paint();
    }
    async function load(filter, target, retry = false, continuing = false) {
      if (!visible || !session || category !== filter) return;
      const state = session.states[filter];
      if (state.pending) return;
      state.started = true;
      state.target = target;
      state.ready = null;
      const scroll = !retry && target !== state.page;
      if (scroll) window.scrollTo(0, 0);
      const loadingSession = session;
      state.current = {
        ...state.current,
        loading: true,
        error: null,
        warning: null,
        target,
      };
      paint();
      const job = session.feed.prepare(filter, target, retry || continuing);
      state.pending = job;
      let result;
      try {
        result = await job;
      } catch (error) {
        result = { error };
      }
      if (state.pending !== job) return;
      state.pending = null;
      state.ready = { target, result };
      if (session === loadingSession) publish(filter);
    }
    function route() {
      const next = categories[window.location.hash];
      if (!next) {
        removeErrorPanel();
        if (visible) {
          visible = false;
          category = null;
          session.feed.setForeground(null);
          anchor.classList.remove("focus");
          session.view.hide();
          restoreTitle();
        }
        return;
      }
      if (!visible) {
        const verified = verifyTakeover(window);
        if (!verified || verified.failure) {
          if (verified?.failure) showErrorPanel(verified.failure);
          else removeErrorPanel();
          return;
        }
        removeErrorPanel();
        if (!session || session.host.user !== verified.user) {
          session = sessions.get(verified.user) || establishSession(verified);
          sessions.set(verified.user, session);
        }
        Object.assign(session.host, verified);
      }
      if (visible && category === next) return;
      visible = true;
      category = next;
      updateTitle(next);
      session.feed.setForeground(next);
      session.view.show();
      anchor.classList.add("focus");
      paint();
      const state = session.states[next];
      if (state.ready) publish(next);
      else if (!state.started) load(next, state.page);
      else if (state.pending) {
        state.current = { ...state.current, loading: true };
        paint();
      } else {
        const result = session.feed.snapshot(next, state.page);
        if (!result) load(next, state.page);
        else refresh(next);
      }
    }
    window.addEventListener("hashchange", () => route());
    route();
  }

  start(window);
})();
