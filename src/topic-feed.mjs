// A single user, single stream: raw service position and unique displayed prefix are distinct.
export function createTopicFeed(search, { user, origin }) {
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
