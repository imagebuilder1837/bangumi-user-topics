import { inspectHost, createHostView } from "./host-view.mjs";
import { createSearchEncore } from "./search-encore.mjs";
import { createTopicFeed } from "./topic-feed.mjs";
import { renderPosts } from "./posts-view.mjs";

// Application boundary: a real Window and one replaceable network boundary.
export function start(
  window,
  { fetch = window.fetch.bind(window), timers } = {},
) {
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
    current = { ...current, loading: true, error: null, warning: null, target };
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
