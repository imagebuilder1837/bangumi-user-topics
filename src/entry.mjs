import { inspectHost, createHostView } from "./host-view.mjs";
import { createSearchEncore } from "./search-encore.mjs";
import { createTopicFeed } from "./topic-feed.mjs";
import { renderPosts, renderPostsNav } from "./posts-view.mjs";

const categories = {
  "#posts": "all",
  "#posts/group": "group",
  "#posts/subject": "subject",
};

// Application boundary: a real Window and one replaceable network boundary.
export function start(
  window,
  { fetch = window.fetch.bind(window), timers } = {},
) {
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
  function scrollTitle() {
    const title = document.querySelector("[data-user-topics-view] > h2.title");
    if (title)
      window.scrollTo(0, title.getBoundingClientRect().top + window.scrollY);
  }
  anchor.addEventListener("click", (event) => {
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      explicitNavigation = window.location.hash !== "#posts";
      if (!explicitNavigation && visible) scrollTitle();
      else if (!explicitNavigation && suspended) route(true);
    }
  });
  let visible = false,
    suspended = false,
    category = null,
    routeVersion = 0,
    takeoverEpoch = 0;
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
        onRetry: () => load(category, state.current.target || state.page, true),
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
      const root = document.querySelector(
        "[data-user-topics-view] .entry-list",
      );
      if (root)
        window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY);
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
    feed.setForeground(next);
    const { subnav } = view.show();
    if (!subnav.dataset.userTopicsNavReady) {
      subnav.dataset.userTopicsNavReady = "";
      subnav.addEventListener("click", (event) => {
        const link = event.target.closest(".navSubTabs a[href]");
        if (
          !link ||
          !subnav.contains(link) ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        explicitNavigation = link.hash !== window.location.hash;
        if (!explicitNavigation) scrollTitle();
      });
    }
    anchor.classList.add("focus");
    paint();
    if (explicitNavigation) scrollTitle();
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
