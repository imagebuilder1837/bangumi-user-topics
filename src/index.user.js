// Development bundle only. NOT an installable userscript; metadata approval pending.
(function () {
  "use strict";

  const css = `
[data-user-topics-active] > .mainWrapper > .columns,
[data-user-topics-active] #headerProfile .navSubTabsWrapper { display: none !important; }
[data-user-topics-active] { min-width: 0 !important; }
[data-user-topics-active] > .mainWrapper { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-active] #headerNeue2 { min-width: 0 !important; }
[data-user-topics-view] { max-width: 750px; margin: 0 auto; min-height: 200px; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;
  function inspectHost(window) {
    const { document, location } = window;
    if (
      !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.hostname) ||
      location.protocol !== "https:" ||
      !/^\/user\/[^/]+\/blog\/?$/.test(location.pathname)
    )
      return null;
    const profile = document.querySelector("#headerProfile");
    const nav = profile?.querySelector(".navTabs");
    const blogs = [...(nav?.children || [])].filter(
      (li) =>
        li.tagName === "LI" &&
        li.firstElementChild?.matches("a[href]") &&
        /^\/user\/[^/]+\/blog\/?$/.test(
          new URL(li.firstElementChild.href).pathname,
        ),
    );
    if (blogs.length !== 1) return null;
    const blog = blogs[0].firstElementChild;
    const key = new URL(blog.href).pathname.split("/")[2];
    let user;
    try {
      user = decodeURIComponent(key);
    } catch {
      return null;
    }
    if (
      !user ||
      !/^[\p{L}\p{N}_-]+$/u.test(user) ||
      location.pathname.split("/")[2] !== key
    )
      return null;
    const columns = document.querySelector(
      "#headerProfile + .mainWrapper > .columns",
    );
    const footer = columns?.parentElement?.querySelector(":scope > #footer");
    const wrapper = document.querySelector("#wrapperNeue");
    const header = profile?.querySelector("h1 .name > a");
    if (
      !columns ||
      !footer ||
      columns.nextElementSibling !== footer ||
      !wrapper?.contains(columns) ||
      !header ||
      !columns.contains(document.querySelector("#entry_list"))
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
    };
  }

  function createHostView(window, host) {
    const { document } = window;
    const style = document.createElement("style");
    style.dataset.userTopicsStyle = "";
    style.textContent = css;
    document.head.append(style);
    let root = null,
      focus = null,
      previousDisplay = null,
      previousScroll = null;
    function show() {
      if (root) return root;
      previousScroll = window.scrollY;
      previousDisplay = host.columns.style.display;
      host.columns.style.display = "none";
      focus = host.nav.querySelector(":scope > li > a.focus");
      if (focus) focus.classList.remove("focus");
      host.wrapper.dataset.userTopicsActive = "";
      root = document.createElement("section");
      root.dataset.userTopicsView = "";
      host.footer.before(root);
      return root;
    }
    function hide() {
      if (!root) return;
      root.remove();
      root = null;
      if (host.columns.style.display === "none")
        host.columns.style.display = previousDisplay;
      if (
        focus &&
        focus.isConnected &&
        !host.nav.querySelector(":scope > li > a.focus")
      )
        focus.classList.add("focus");
      if (host.wrapper.hasAttribute("data-user-topics-active"))
        delete host.wrapper.dataset.userTopicsActive;
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
    return { show, hide };
  }

  const safeID = (value) => Number.isSafeInteger(value) && value >= 0;

  function normalizeBatch(payload, { offset, limit, origin }) {
    if (
      !payload ||
      !Array.isArray(payload.data) ||
      !payload.pagination ||
      !payload.meta ||
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
        row.kind !== 0 ||
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
        key: `group:${row.id}`,
        title: row.title || "无标题",
        parent: row.parentName || "小组话题",
        replies: row.replyCount,
        createdAt: row.createdAt,
        url: `${origin}/group/topic/${row.id}`,
        parentURL: `${origin}/group/${row.parentID}`,
      };
    });
    if (topics.length > limit) throw new Error("SearchEncore 返回过多数据");
    return topics;
  }

  function createSearchEncore(
    fetch,
    { setTimeout: delay = setTimeout, clearTimeout: clear = clearTimeout } = {},
  ) {
    return async ({ user, offset, limit, origin }) => {
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        offset > 5000 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50
      )
        throw new Error("请求超出检索范围");
      const url = new URL("https://bgmdb.ry.mk/v1/search/group-topics");
      url.search = new URLSearchParams({
        q: `user:${user}`,
        sort: "newest",
        limit: String(limit),
        offset: String(offset),
      }).toString();
      const controller = new AbortController();
      const timeout = delay(() => controller.abort(), 15000);
      try {
        const response = await fetch(url.href, {
          credentials: "omit",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`SearchEncore HTTP ${response.status}`);
        return normalizeBatch(await response.json(), { offset, limit, origin });
      } finally {
        clear(timeout);
      }
    };
  }

  // A single user, single stream: raw service position and unique displayed prefix are distinct.
  function createTopicFeed(search, { user, origin }) {
    const topics = [];
    const keys = new Set();
    const pages = new Map();
    let offset = 0,
      exhausted = false;
    let failure = null;
    const targets = new Map();

    async function prepare(page, retry = false) {
      if (pages.has(page) && !retry)
        return {
          items: pages.get(page),
          next:
            pages.has(page + 1) || topics.length > page * 10
              ? "yes"
              : exhausted
                ? "no"
                : "unknown",
        };
      const goal = page * 10;
      const key = String(page);
      let target = targets.get(key);
      if (!target || retry) {
        target = { requests: 0, failure: null };
        targets.set(key, target);
        failure = null;
      }
      if (target.failure && !retry) return { error: target.failure };
      // Resolve a reliable current page first; prefetch just one extra candidate.
      async function fill(count) {
        while (
          topics.length < count &&
          !exhausted &&
          offset <= 5000 &&
          target.requests < 3
        ) {
          const limit = Math.min(50, Math.max(1, count - topics.length));
          target.requests++;
          try {
            const batch = await search({ user, origin, offset, limit });
            for (const topic of batch)
              if (!keys.has(topic.key)) {
                keys.add(topic.key);
                topics.push(topic);
              }
            offset += batch.length;
            if (batch.length === 0) {
              exhausted = true;
              break;
            }
          } catch (error) {
            failure = error;
            target.failure = error;
            break;
          }
        }
      }
      await fill(goal + 1);
      if (topics.length < (page - 1) * 10 + 1 && !exhausted)
        return {
          error:
            failure ||
            new Error(
              offset > 5000
                ? "已达到服务检索上限，可能仍有更早的帖子"
                : "无法确定下一页，请继续重试",
            ),
        };
      if (topics.length < (page - 1) * 10 + 1) return { items: [], next: "no" };
      if (topics.length < goal && !exhausted)
        return {
          error:
            failure ||
            new Error(
              offset > 5000
                ? "已达到服务检索上限，可能仍有更早的帖子"
                : "无法确定当前页，请继续重试",
            ),
        };
      const items = topics.slice((page - 1) * 10, goal);
      pages.set(page, items);
      return {
        items,
        next: topics.length > goal ? "yes" : exhausted ? "no" : "unknown",
        warning: failure,
      };
    }
    return { prepare };
  }

  function el(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function renderPosts(
    root,
    { nickname, state, page, onNext, onPrevious, onRetry },
  ) {
    const d = root.ownerDocument;
    root.replaceChildren();
    const title = el(d, "h2", "title", `${nickname}的帖子`);
    root.append(title);
    const status = el(d, "div", "grey");
    status.setAttribute("role", "status");
    root.append(status);
    if (state.loading) status.textContent = "正在加载小组话题…";
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
        const time = el(d, "span", "time", formatTime(topic.createdAt));
        tools.append(parent, " · ", time, ` · ${topic.replies} 回复`);
        entry.append(heading, tools);
        item.append(entry);
        list.append(item);
      }
      root.append(list);
    } else if (!state.loading && !state.error)
      status.textContent = "没有找到已收录的帖子";
    if (state.error || state.warning) {
      status.textContent = state.error?.message || "无法确认是否还有下一页";
      const retry = el(d, "button", "", "重试");
      retry.type = "button";
      retry.addEventListener("click", onRetry);
      status.append(" ", retry);
    }
    if (state.items?.length) {
      const pages = el(d, "div", "page_inner");
      if (page > 1) {
        const previous = el(d, "a", "p", "上一页");
        previous.href = "#posts/group";
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
        next.href = "#posts/group";
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

  // Application boundary: a real Window and one replaceable network boundary.
  function start(window, { fetch = window.fetch.bind(window), timers } = {}) {
    const host = inspectHost(window);
    if (!host) {
      if (window.location.hash === "#posts/group")
        console.warn("用户帖子：当前页面无法安全挂载");
      return;
    }
    const { document } = window;
    let entry = host.nav.querySelector("[data-user-topics-link]");
    if (entry) return;
    entry = document.createElement("li");
    entry.dataset.userTopicsLink = "";
    const anchor = document.createElement("a");
    anchor.textContent = "帖子";
    anchor.href = "#posts/group";
    entry.append(anchor);
    host.blog.parentElement.after(entry);
    const view = createHostView(window, host);
    const feed = createTopicFeed(createSearchEncore(fetch, timers), {
      user: host.user,
      origin: window.location.origin,
    });
    let explicitNavigation = false;
    anchor.addEventListener("click", (event) => {
      if (
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey
      )
        explicitNavigation = true;
    });
    let page = 1,
      visible = false,
      generation = 0,
      current = { loading: false },
      busy = false,
      job = null;
    const mounted = () =>
      host.columns.isConnected &&
      host.footer.parentElement === host.columns.parentElement &&
      host.nav.isConnected;
    function paint() {
      if (!visible) return;
      const root = document.querySelector("[data-user-topics-view]");
      if (root)
        renderPosts(root, {
          nickname: host.nickname,
          state: current,
          page,
          onNext: () => load(page + 1),
          onPrevious: () => load(page - 1),
          onRetry: () => load(current.target || page, true),
        });
    }
    async function load(target, retry = false) {
      if (!visible || !mounted()) return;
      if (busy) {
        await job;
        if (visible) return load(target, retry);
        return;
      }
      const token = generation;
      busy = true;
      current = {
        ...current,
        loading: true,
        error: null,
        warning: null,
        target,
      };
      paint();
      job = feed.prepare(target, retry);
      const result = await job;
      busy = false;
      job = null;
      if (token !== generation || !visible || !mounted()) return;
      const previousPage = page;
      if (result.error)
        current = { ...current, loading: false, error: result.error, target };
      else if (result.items.length) {
        page = target;
        current = { ...result, loading: false };
      } else current = { ...current, loading: false, next: "no" };
      paint();
      if (target !== previousPage && page === target && visible) {
        const root = document.querySelector("[data-user-topics-view]");
        if (root)
          window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY);
      }
    }
    function route() {
      const active = window.location.hash === "#posts/group";
      if (
        !active ||
        !mounted() ||
        (visible &&
          !document.querySelector("[data-user-topics-view]")?.isConnected)
      ) {
        explicitNavigation = false;
        if (visible) {
          generation++;
          visible = false;
          anchor.classList.remove("focus");
          view.hide();
        }
        return;
      }
      if (visible) {
        explicitNavigation = false;
        return;
      }
      visible = true;
      const root = view.show();
      anchor.classList.add("focus");
      paint();
      if (explicitNavigation)
        window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY);
      explicitNavigation = false;
      load(page);
    }
    // Observe only structural boundaries; a detached footer or navigation must not leave the host hidden.
    const observer = new window.MutationObserver(() => {
      if (
        visible &&
        (!mounted() ||
          !document.querySelector("[data-user-topics-view]")?.isConnected)
      )
        route();
    });
    observer.observe(host.columns.parentElement, { childList: true });
    observer.observe(host.nav.parentElement, { childList: true });
    observer.observe(host.profile.parentElement, { childList: true });
    window.addEventListener("hashchange", route);
    route();
  }

  start(window);
})();
