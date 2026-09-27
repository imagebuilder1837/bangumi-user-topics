import { inspectHost, createHostView } from "./host-view.mjs";
import { createSearchEncore } from "./search-encore.mjs";
import { createTopicFeed } from "./topic-feed.mjs";
import { renderPosts } from "./posts-view.mjs";

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
        onRetry: () => load(category, state.current.target || state.page, true),
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
    if (token !== generation || !visible || category !== filter || !mounted()) {
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
