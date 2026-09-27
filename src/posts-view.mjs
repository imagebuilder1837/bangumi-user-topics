function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
export function renderPosts(
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
