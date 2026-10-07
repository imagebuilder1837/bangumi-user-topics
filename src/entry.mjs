import { inspectEntry, verifyTakeover, createHostView } from "./host-view.mjs";
import { createSearchEncore } from "./search-encore.mjs";
import { createTopicFeed } from "./topic-feed.mjs";
import { createRequestScheduler } from "./request-scheduler.mjs";
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
        onRetry: () => load(category, state.current.target || state.page, true),
      });
  }
  function refresh(filter) {
    if (!session || !visible || category !== filter) return;
    const state = session.states[filter];
    if (state.pending || state.ready || !state.current.items?.length) return;
    const result = session.feed.snapshot(filter, state.page);
    if (!result || result.error) return;
    state.confirmedPage = Math.max(state.confirmedPage, result.confirmedPage);
    state.current = {
      ...state.current,
      next: result.next,
      warning: result.warning,
      prefetching: result.prefetching,
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
    else if (result.items.length) {
      session.feed.commit(filter, target, result.items);
      state.page = target;
      state.confirmedPage = Math.max(
        state.confirmedPage,
        result.confirmedPage,
        target,
      );
      state.current = { ...result, loading: false, target };
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
    if (session !== loadingSession || state.pending !== job) return;
    state.pending = null;
    state.ready = { target, result };
    publish(filter);
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
      if (!session || session.host.user !== verified.user)
        session = establishSession(verified);
      else Object.assign(session.host, verified);
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
    } else refresh(next);
  }
  window.addEventListener("hashchange", () => route());
  route();
}
