import { RateLimitError, RetryableError } from "./search-encore.mjs";

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

export function createTopicFeed(
  search,
  { user, origin, now = Date.now, delay = setTimeout, onChange = () => {} },
) {
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
      {
        category: kind,
        pages: new Map(),
        excluded: new Set(),
        frozenAt: 0,
        goal: 0,
        failure: null,
        pending: null,
        restart: false,
        waiters: new Set(),
        stalled: Object.fromEntries(kinds.map((kind) => [kind, 0])),
      },
    ]),
  );
  let received = 0;
  let foreground = null;
  let inFlight = 0;
  let cooldown = 0;
  let paused = false;
  const queue = [];
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
      const job = queue.splice(front < 0 ? 0 : front, 1)[0];
      inFlight++;
      job.attempts++;
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
          if (error instanceof RetryableError && job.attempts < 3) {
            delay(() => {
              if (paused) job.reject(new Error("请求已暂停，请稍后重试"));
              else {
                queue.push(job);
                schedule();
              }
            }, job.attempts * 1000);
          } else job.reject(error);
        })
        .finally(() => {
          inFlight--;
          schedule();
        });
    }
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
          item.received >= view.frozenAt &&
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
  function snapshot(category, page) {
    const view = views[category];
    const entries = candidates(category);
    const required = requiredKinds(category);
    const exhausted = required.every((kind) => streams[kind].exhausted);
    const depth = Math.min(
      entries.length,
      ...required.map((kind) =>
        streams[kind].exhausted
          ? Infinity
          : entries.filter((item) => item.kind === kind).length,
      ),
    );
    const frozen = view.pages.get(page);
    const goal = page * 10;
    if (!frozen && depth < goal && !exhausted)
      return view.failure && !view.restart ? { error: view.failure } : null;
    return {
      items: frozen
        ? frozen.map((key) => known.get(key))
        : entries.slice((page - 1) * 10, goal),
      next: depth > goal ? "yes" : exhausted ? "no" : "unknown",
      confirmedPage: Math.ceil(depth / 10),
      prefetching: Boolean(view.pending),
      warning: view.failure,
    };
  }
  function notify() {
    for (const view of Object.values(views)) {
      if (!view.goal) continue;
      for (const waiter of view.waiters) {
        const result = snapshot(view.category, waiter.page);
        if (result) {
          view.waiters.delete(waiter);
          waiter.resolve(result);
        }
      }
      onChange(view.category);
    }
  }
  function request(kind, offset, limit, category) {
    const stream = streams[kind];
    const job = {
      kind,
      offset,
      limit,
      categories: new Set([category]),
      attempts: 0,
    };
    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    const pending = { job, promise };
    stream.pending = pending;
    pending.promise = promise
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
        notify();
      })
      .finally(() => {
        if (stream.pending === pending) stream.pending = null;
      });
    queue.push(job);
    schedule();
    return pending;
  }
  async function fill(view) {
    try {
      const outcomes = await Promise.allSettled(
        requiredKinds(view.category).map(async (kind) => {
          const stream = streams[kind];
          try {
            while (true) {
              if (view.failure) throw view.failure;
              const available = candidates(view.category).filter(
                (item) => item.kind === kind,
              ).length;
              if (available >= view.goal || stream.exhausted) return;
              if (paused) throw new Error("请求已暂停，请稍后重试");
              if (stream.offset > 5000)
                throw unavailable(stream, view.category);
              const pending =
                stream.pending ||
                request(
                  kind,
                  stream.offset,
                  Math.min(50, view.goal - available),
                  view.category,
                );
              pending.job.categories.add(view.category);
              await pending.promise;
              const after = candidates(view.category).filter(
                (item) => item.kind === kind,
              ).length;
              view.stalled[kind] =
                after > available ? 0 : view.stalled[kind] + 1;
              if (!stream.exhausted && view.stalled[kind] >= 3)
                throw new Error("连续三批没有有效新增，请继续重试");
            }
          } catch (error) {
            view.failure ||= error;
            notify();
            throw error;
          }
        }),
      );
      const failed = outcomes.find((outcome) => outcome.status === "rejected");
      if (failed) throw failed.reason;
    } finally {
      schedule();
    }
  }
  function reset(view) {
    view.failure = null;
    view.stalled = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  }
  function run(view) {
    const goal = view.goal;
    view.pending = Promise.resolve()
      .then(() => fill(view))
      .catch((error) => {
        view.failure ||= error;
      })
      .finally(() => {
        view.pending = null;
        if (view.restart && !paused) {
          view.restart = false;
          reset(view);
          run(view);
        } else {
          view.restart = false;
          // One source may have finished before a later click raised the goal.
          if (!view.failure && !paused && view.goal > goal) run(view);
        }
        notify();
      });
  }
  function prepare(category, page, retry = false) {
    const view = views[category];
    if (!view || !Number.isInteger(page) || page < 1)
      throw new Error("无效分类或页码");
    const goal = 101 + 100 * Math.floor((page + 6) / 10);
    const higher = goal > view.goal;
    view.goal = Math.max(view.goal, goal);
    if (retry && paused && now() < cooldown)
      return Promise.resolve({ error: new Error("请求冷却中，请稍后重试") });
    if (retry) paused = false;
    if (retry || higher) {
      if (view.pending && view.failure) view.restart = true;
      else if (!view.pending) reset(view);
    }
    if (!view.pending && !view.failure) run(view);
    const result = snapshot(category, page);
    if (result) return Promise.resolve(result);
    return new Promise((resolve) => view.waiters.add({ page, resolve }));
  }
  function commit(category, page, items) {
    const view = views[category];
    if (!view.pages.has(page)) {
      if (!view.pages.size || page > Math.max(...view.pages.keys()))
        view.frozenAt = received;
      view.pages.set(
        page,
        items.map((item) => item.key),
      );
    }
  }
  return { prepare, snapshot, commit, setForeground };
}
