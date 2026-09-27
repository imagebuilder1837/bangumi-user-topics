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
    if (result.error)
      current = { ...current, loading: false, error: result.error, target };
    else if (result.items.length) {
      page = target;
      current = { ...result, loading: false };
    } else current = { ...current, loading: false, next: "no" };
    paint();
  }
  function route() {
    const active = window.location.hash === "#posts/group";
    if (!active || !mounted()) {
      if (visible) {
        generation++;
        visible = false;
        anchor.classList.remove("focus");
        view.hide();
      }
      return;
    }
    if (visible) return;
    visible = true;
    view.show();
    anchor.classList.add("focus");
    paint();
    load(page);
  }
  window.addEventListener("hashchange", route);
  route();
}
