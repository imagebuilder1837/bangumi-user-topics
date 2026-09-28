function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
export function renderPostsNav(tabs, category) {
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
export function postsTitle(nickname, category) {
  const label = {
    all: "帖子",
    group: "小组话题",
    subject: "条目讨论",
  }[category];
  return `${nickname}的${label}`;
}
export function renderPosts(
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
  if (state.loading) message.textContent = "正在加载帖子…";
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
      const time = el(d, "div", "time");
      const replies = el(d, "a", "l", `${topic.replies} 回复`);
      replies.href = topic.url;
      time.append(parent, " · ", formatTime(topic.createdAt), " · ", replies);
      tools.append(time);
      entry.append(heading, tools);
      item.append(entry);
      list.append(item);
    }
    root.append(list);
  } else if (!state.loading && !state.error)
    message.textContent = "没有找到已收录的帖子";
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
