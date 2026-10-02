import { RateLimitError } from "./search-encore.mjs";

// Service cursors are shared; displayed identities and late exclusions belong to a category.
const topicKinds = ["group", "subject"];
const kinds = [...topicKinds, "replies"];
const requiredKinds = (category) =>
  category === "all" ? topicKinds : [category];
const order = (a, b) =>
  b.createdAt - a.createdAt ||
  kinds.indexOf(a.kind) - kinds.indexOf(b.kind) ||
  a.received - b.received;
const unavailable = (stream, category) =>
  new Error(
    stream.offset > 5000
      ? `已达到服务检索上限，可能仍有更早的${category === "replies" ? "评论回复" : "帖子"}`
      : "无法确定当前页，请继续重试",
  );

export function createTopicFeed(search, { user, origin, now = Date.now }) {
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
  let foreground = null;
  let inFlight = 0;
  let cooldown = 0;
  let paused = false;
  const queue = [];
  const active = new Set();
  let scheduled = false;

  function setForeground(category) {
    foreground = category;
    schedule();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      dispatch();
    });
  }
  function dispatch() {
    if (paused) return;
    while (inFlight < 3 && queue.length) {
      const front = queue.findIndex((job) => job.categories.has(foreground));
      // A foreground target waiting for a response or its next request owns free slots.
      if (
        front < 0 &&
        [...active].some((target) => target.category === foreground)
      )
        return;
      const job = queue.splice(front < 0 ? 0 : front, 1)[0];
      inFlight++;
      search({
        user,
        origin,
        kind: job.kind,
        offset: job.offset,
        limit: job.limit,
      })
        .then(job.resolve, (error) => {
          if (error instanceof RateLimitError) {
            paused = true;
            cooldown = Math.max(cooldown, error.retryAfter);
            for (const waiting of queue.splice(0)) waiting.reject(error);
          }
          job.reject(error);
        })
        .finally(() => {
          inFlight--;
          schedule();
        });
    }
  }
  function request(kind, offset, limit, category) {
    const job = { kind, offset, limit, categories: new Set([category]) };
    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    streams[kind].pending = { promise, job };
    schedule();
    return streams[kind].pending;
  }
  function candidates(category) {
    const view = views[category];
    const displayed = new Set([...view.pages.values()].flat());
    const boundary = view.pages.size
      ? known.get(view.pages.get(Math.max(...view.pages.keys())).at(-1))
      : null;
    const result = [];
    for (const kind of requiredKinds(category)) {
      for (const item of streams[kind].rows) {
        if (view.excluded.has(item.key)) continue;
        if (
          boundary &&
          !displayed.has(item.key) &&
          order(item, boundary) <= 0
        ) {
          view.excluded.add(item.key);
          continue;
        }
        result.push(item);
      }
    }
    result.sort(order);
    return result;
  }

  async function fill(category, count, target) {
    const required = requiredKinds(category);
    active.add(target);
    try {
      const outcomes = await Promise.allSettled(
        required.map(async (kind) => {
          const stream = streams[kind];
          try {
            while (true) {
              if (target.blocked) throw target.blocked;
              const available = candidates(category).filter(
                (t) => t.kind === kind,
              ).length;
              if (available >= count || stream.exhausted) return;
              if (paused) throw new Error("请求已暂停，请稍后重试");
              if (stream.offset > 5000 || target.requests[kind] >= 3)
                throw unavailable(stream, category);
              let pending = stream.pending;
              if (!pending) {
                const offset = stream.offset;
                const limit = Math.min(50, Math.max(1, count - available));
                pending = request(kind, offset, limit, category);
                queue.push(pending.job);
                schedule();
                // The cursor and cache update exactly once, regardless of how many targets await this job.
                pending.promise = pending.promise
                  .then((batch) => {
                    if (!Array.isArray(batch) || batch.length > limit)
                      throw new Error("SearchEncore 返回格式无效");
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
                    if (stream.pending === pending) stream.pending = null;
                  });
              }
              pending.job.categories.add(category);
              target.requests[kind]++;
              await pending.promise;
            }
          } catch (error) {
            target.blocked ||= error;
            throw error;
          }
        }),
      );
      const failed = outcomes.find((outcome) => outcome.status === "rejected");
      if (failed) throw failed.reason;
    } finally {
      active.delete(target);
      schedule();
    }
  }

  async function prepare(category, page, retry = false) {
    const view = views[category];
    if (!view || !Number.isInteger(page) || page < 1)
      throw new Error("无效分类或页码");
    const id = String(page);
    let target = view.targets.get(id);
    if (!target) {
      target = {
        category,
        requests: { group: 0, subject: 0, replies: 0 },
        failure: null,
        blocked: null,
        pending: null,
      };
      view.targets.set(id, target);
    }
    if (target.pending) return target.pending;
    if (retry) {
      if (paused && now() < cooldown)
        return { error: new Error("请求冷却中，请稍后重试") };
      paused = false;
      target.requests = { group: 0, subject: 0, replies: 0 };
      target.failure = null;
      target.blocked = null;
      schedule();
    }
    const work = async () => {
      if (view.pages.has(page) && !retry) {
        const entries = candidates(category);
        return {
          items: view.pages.get(page).map((key) => known.get(key)),
          next:
            entries.length > page * 10
              ? "yes"
              : requiredKinds(category).every((k) => streams[k].exhausted)
                ? "no"
                : "unknown",
        };
      }
      if (target.failure) return { error: target.failure };
      const goal = page * 10;
      let problem = null;
      try {
        const cached = candidates(category);
        const required = requiredKinds(category);
        if (
          !required.every(
            (kind) =>
              streams[kind].exhausted ||
              cached.filter((item) => item.kind === kind).length >= goal + 1,
          )
        ) {
          if (paused) throw new Error("请求已暂停，请稍后重试");
          await fill(category, goal + 1, target);
        }
      } catch (error) {
        problem = error;
      }
      let entries = candidates(category);
      const required = requiredKinds(category);
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
          unavailable(
            streams[category === "all" ? "group" : category],
            category,
          );
        return { error: target.failure };
      }
      if (entries.length <= start) return { items: [], next: "no" };
      const keys = entries.slice(start, goal).map((t) => t.key);
      entries = candidates(category);
      return {
        items: (view.pages.get(page) || keys).map((key) => known.get(key)),
        next:
          reliable(goal + 1) && entries.length > goal
            ? "yes"
            : exhausted()
              ? "no"
              : "unknown",
        warning: problem,
      };
    };
    target.pending = work().finally(() => {
      target.pending = null;
    });
    return target.pending;
  }
  function commit(category, page, items) {
    const view = views[category];
    if (!view.pages.has(page))
      view.pages.set(
        page,
        items.map((item) => item.key),
      );
  }
  return { prepare, commit, setForeground };
}
