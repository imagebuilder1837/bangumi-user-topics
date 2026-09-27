// Development bundle only. NOT an installable userscript; metadata approval pending.
(function () {
  "use strict";

  const css = `
[data-user-topics-active="on"] > #headerProfile + .mainWrapper > .columns,
[data-user-topics-active="on"] > #headerProfile .navSubTabsWrapper { display: none !important; }
[data-user-topics-active="on"] { min-width: 0 !important; }
[data-user-topics-active="on"] > #headerProfile + .mainWrapper { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-active="on"] > #headerNeue2 { min-width: 0 !important; }
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
        new URL(li.firstElementChild.href).origin === location.origin &&
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
    let root = null,
      focus = null,
      previousScroll = null,
      previousFocus = null,
      previousMarker = null,
      markerOwned = false;
    const markerObserver = new window.MutationObserver(() => {
      markerOwned = false;
    });
    function show() {
      if (root) return root;
      previousScroll = window.scrollY;
      previousFocus = host.columns.contains(document.activeElement)
        ? document.activeElement
        : null;
      focus = host.nav.querySelector(":scope > li > a.focus");
      if (focus) focus.classList.remove("focus");
      previousMarker = host.wrapper.getAttribute("data-user-topics-active");
      host.wrapper.dataset.userTopicsActive = "on";
      markerOwned = true;
      markerObserver.observe(host.wrapper, {
        attributes: true,
        attributeFilter: ["data-user-topics-active"],
      });
      document.head.append(style);
      root = document.createElement("section");
      root.dataset.userTopicsView = "";
      host.footer.before(root);
      return root;
    }
    function hide() {
      if (!root) return;
      const active = document.activeElement;
      const releaseFocus =
        active === document.body ||
        root.contains(active) ||
        active === host.nav.querySelector("[data-user-topics-link] a");
      root.remove();
      root = null;
      if (markerObserver.takeRecords().length) markerOwned = false;
      markerObserver.disconnect();
      style.remove();
      if (
        focus &&
        focus.isConnected &&
        !host.nav.querySelector(":scope > li > a.focus")
      )
        focus.classList.add("focus");
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
    return { show, hide };
  }

  const safeID = (value) => Number.isSafeInteger(value) && value >= 0;

  function normalizeBatch(payload, { offset, limit, origin, kind = "group" }) {
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

  function createSearchEncore(
    fetch,
    { setTimeout: delay = setTimeout, clearTimeout: clear = clearTimeout } = {},
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
      const timeout = delay(() => controller.abort(), 15000);
      try {
        const response = await fetch(url.href, {
          credentials: "omit",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(`SearchEncore HTTP ${response.status}`);
        return normalizeBatch(await response.json(), {
          offset,
          limit,
          origin,
          kind,
        });
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

  function createTopicFeed(search, { user, origin }) {
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

    // Each required stream supplies N effective candidates (including frozen entries),
    // or proves natural exhaustion. Raw rows and globally cached keys are not a prefix.
    async function fill(category, count, target) {
      const required = category === "all" ? kinds : [category];
      await Promise.all(
        required.map(async (kind) => {
          const stream = streams[kind];
          while (true) {
            const available = candidates(category).filter(
              (t) => t.kind === kind,
            ).length;
            if (available >= count || stream.exhausted) return;
            if (stream.offset > 5000) throw unavailable(stream);
            if (!stream.pending && target.requests[kind] >= 3)
              throw unavailable(stream);
            if (!stream.pending) {
              const offset = stream.offset;
              const limit = Math.min(50, Math.max(1, count - available));
              stream.pending = search({ user, origin, kind, offset, limit })
                .then((batch) => {
                  if (!Array.isArray(batch) || batch.length > limit)
                    throw new Error("SearchEncore 返回格式无效");
                  // A successful batch is accepted atomically by the adapter.
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
                  stream.pending = null;
                });
            }
            target.requests[kind]++;
            await stream.pending;
          }
        }),
      );
    }

    async function prepare(category, page, retry = false) {
      const view = views[category];
      if (!view || !Number.isInteger(page) || page < 1)
        throw new Error("无效分类或页码");
      const id = String(page);
      let target = view.targets.get(id);
      if (!target || retry) {
        target = { requests: { group: 0, subject: 0 }, failure: null };
        view.targets.set(id, target);
      }
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
      if (target.failure && !retry) return { error: target.failure };
      const goal = page * 10;
      let problem = null;
      try {
        await fill(category, goal + 1, target);
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
      // Freeze only the displayed page, never the lookahead candidate.
      const keys = entries.slice(start, goal).map((t) => t.key);
      entries = candidates(category);
      return {
        items: (view.pages.get(page) || keys).map((key) => known.get(key)),
        next: entries.length > goal ? "yes" : exhausted() ? "no" : "unknown",
        warning: problem,
      };
    }
    function commit(category, page, items) {
      const view = views[category];
      if (!view.pages.has(page))
        view.pages.set(
          page,
          items.map((topic) => topic.key),
        );
    }
    return { prepare, commit };
  }

  function el(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function renderPosts(
    root,
    { nickname, category = "group", state, page, onNext, onPrevious, onRetry },
  ) {
    const d = root.ownerDocument;
    root.replaceChildren();
    const title = el(d, "h2", "title", `${nickname}的帖子`);
    root.append(title);
    const tabs = el(d, "div", "navSubTabsWrapper");
    const nav = el(d, "ul", "navSubTabs");
    for (const [filter, label, hash] of [
      ["all", "全部帖子", "#posts"],
      ["group", "小组话题", "#posts/group"],
      ["subject", "条目讨论", "#posts/subject"],
    ]) {
      const li = el(d, "li");
      const a = el(d, "a", filter === category ? "focus" : "", label);
      a.href = hash;
      li.append(a);
      nav.append(li);
    }
    tabs.append(nav);
    root.append(tabs);
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
    });
    const states = Object.fromEntries(
      Object.keys(categories).map((hash) => [
        categories[hash],
        { page: 1, current: { loading: false }, pending: null },
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
        explicitNavigation = true;
        // A same-hash click keeps the already active category; hashchange handles new hashes.
      }
    });
    let visible = false,
      category = null,
      generation = 0;
    const mounted = () =>
      host.columns.isConnected &&
      host.footer.parentElement === host.columns.parentElement &&
      host.nav.isConnected;
    function paint() {
      if (!visible) return;
      const root = document.querySelector("[data-user-topics-view]");
      const state = states[category];
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
    async function load(filter, target, retry = false) {
      if (!visible || category !== filter || !mounted()) return;
      const state = states[filter];
      if (state.pending) return;
      const token = generation;
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
      state.pending = null;
      if (
        token !== generation ||
        !visible ||
        category !== filter ||
        !mounted()
      ) {
        state.current = { ...state.current, loading: false };
        if (visible && category === filter && mounted())
          load(filter, states[filter].page);
        return;
      }
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
      } else state.current = { ...state.current, loading: false, next: "no" };
      paint();
      if (target !== previousPage && state.page === target) {
        const root = document.querySelector("[data-user-topics-view]");
        if (root)
          window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY);
      }
    }
    function route() {
      const next = categories[window.location.hash];
      if (
        !next ||
        !mounted() ||
        (visible &&
          !document.querySelector("[data-user-topics-view]")?.isConnected)
      ) {
        explicitNavigation = false;
        if (visible) {
          generation++;
          visible = false;
          category = null;
          anchor.classList.remove("focus");
          view.hide();
        }
        return;
      }
      if (visible && category === next) {
        explicitNavigation = false;
        return;
      }
      const switched = visible;
      generation++;
      visible = true;
      category = next;
      const root = view.show();
      anchor.classList.add("focus");
      paint();
      if (explicitNavigation)
        window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY);
      explicitNavigation = false;
      if (!states[next].current.items || switched) {
        if (!states[next].pending) load(next, states[next].page);
      }
    }
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
