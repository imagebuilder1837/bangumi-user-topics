import { inspectEntry, verifyTakeover, createHostView } from "./host-view.mjs";
import { createSearchEncore } from "./search-encore.mjs";
import { createTopicFeed } from "./topic-feed.mjs";
import { postsTitle, renderPosts, renderPostsNav } from "./posts-view.mjs";

const categories = {
  "#posts": "all",
  "#posts/group": "group",
  "#posts/subject": "subject",
  "#posts/replies": "replies",
};

// Application boundary: a real Window and one replaceable network boundary.
export function start(
  window,
  { fetch = window.fetch.bind(window), timers } = {},
) {
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
        attributeFilter: ["data-user-topics-original-subnav", "class", "style"],
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
        onRetry: () => load(category, state.current.target || state.page, true),
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
