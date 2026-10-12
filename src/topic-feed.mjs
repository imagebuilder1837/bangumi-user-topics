import { createRequestScheduler } from "./request-scheduler.mjs";
import { headFingerprint } from "./topic-cache.mjs";

// Service cursors are shared; displayed identities and late exclusions belong to a category.
const topicKinds = ["group", "subject"];
const kinds = [...topicKinds, "replies"];
const sourceNames = {
  group: "小组话题",
  subject: "条目讨论",
  replies: "评论回复",
};
const sourceFailure = (kind, error) =>
  new Error(`${sourceNames[kind]}：${error.message}`, { cause: error });
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
  {
    user,
    origin,
    scheduler = createRequestScheduler(),
    cache,
    onChange = () => {},
  },
) {
  const streams = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      {
        offset: 0,
        exhausted: false,
        pending: null,
        progressWaiters: new Set(),
        rows: [],
        head: [],
        checked: true,
        error: null,
        failedGoal: 0,
        draft: null,
        dirty: false,
        cached: false,
        storageWarning: null,
      },
    ]),
  );
  const views = Object.fromEntries(
    ["all", ...kinds].map((kind) => [
      kind,
      {
        category: kind,
        revision: 0,
        refreshing: false,
        hold: null,
        changed: false,
        pages: new Map(),
        excluded: new Set(),
        frozenAt: 0,
        goal: 0,
        failure: null,
        failureKind: null,
        sourceFailures: {},
        pending: null,
        restart: false,
        waiters: new Set(),
        stalled: Object.fromEntries(kinds.map((kind) => [kind, 0])),
      },
    ]),
  );
  let received = 0;
  for (const kind of kinds) {
    const record = cache?.read(kind);
    if (!record) continue;
    Object.assign(streams[kind], record, { checked: false, cached: true });
    for (const item of record.rows) {
      item.received = received++;
    }
  }
  let foreground = null;
  function setForeground(category) {
    foreground = category;
    scheduler.wake();
  }
  function visibleStreams(view) {
    return view.hold || streams;
  }
  function candidates(category, live = false) {
    const view = views[category];
    const sources = live ? streams : visibleStreams(view);
    const ignoreFreeze = live && view.changed;
    const displayed = new Set([...view.pages.values()].flat());
    const boundaryKey = view.pages.get(Math.max(...view.pages.keys()))?.at(-1);
    const boundary = requiredKinds(category)
      .flatMap((kind) => visibleStreams(view)[kind].rows)
      .find((item) => item.key === boundaryKey);
    const result = [];
    for (const kind of requiredKinds(category)) {
      for (const item of sources[kind].rows) {
        if (!ignoreFreeze && view.excluded.has(item.key)) continue;
        if (
          !ignoreFreeze &&
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
    const sources = visibleStreams(view);
    const byKey = new Map(
      required
        .flatMap((kind) => sources[kind].rows)
        .map((item) => [item.key, item]),
    );
    const exhausted = required.every((kind) => sources[kind].exhausted);
    const depth = Math.min(
      entries.length,
      ...required.map((kind) =>
        sources[kind].exhausted
          ? Infinity
          : entries.filter((item) => item.kind === kind).length,
      ),
    );
    const actualPage =
      view.revision && exhausted
        ? Math.min(page, Math.max(1, Math.ceil(entries.length / 10)))
        : page;
    const frozen = view.pages.get(actualPage);
    const goal = actualPage * 10;
    const failedKind = required.find((kind) => streams[kind].error);
    const failure =
      view.failure ||
      (failedKind
        ? sourceFailure(failedKind, streams[failedKind].error)
        : null);
    if (!frozen && depth < goal && !exhausted)
      return failure && !view.restart ? { error: failure } : null;
    return {
      revision: view.revision,
      page: actualPage,
      items: frozen
        ? frozen.map((key) => byKey.get(key))
        : entries.slice((actualPage - 1) * 10, goal),
      next: depth > goal ? "yes" : exhausted ? "no" : "unknown",
      confirmedPage: Math.ceil(depth / 10),
      prefetching: Boolean(view.pending),
      warning: failure,
      cacheStatus:
        view.pending &&
        (view.changed || required.some((kind) => streams[kind].draft))
          ? "正在更新缓存，暂用缓存…"
          : view.pending && required.some((kind) => !streams[kind].checked)
            ? "正在核验缓存…"
            : null,
      cacheFailure: Boolean(
        failure &&
          (view.refreshing || (failedKind && streams[failedKind].cached)),
      ),
      cacheWarning: required
        .map((kind) => streams[kind].storageWarning)
        .find(Boolean),
    };
  }
  function notify() {
    // Join an existing rebuild for the visible cached category before a lower
    // category can commit it. Failed sources remain stopped until explicit retry.
    const active = views[foreground];
    if (
      active?.goal &&
      !active.pending &&
      requiredKinds(active.category).some(
        (kind) => streams[kind].draft && !streams[kind].error,
      )
    )
      run(active);
    for (const stream of Object.values(streams)) {
      for (const resolve of stream.progressWaiters) resolve();
      stream.progressWaiters.clear();
    }
    const all = views.all;
    if (
      all.hold &&
      !all.changed &&
      topicKinds.every(
        (kind) =>
          streams[kind].cached && streams[kind].checked && !streams[kind].draft,
      )
    )
      all.hold = null;
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
  function ingest(target, batch) {
    const identities = new Set(target.rows.map((item) => item.key));
    if (target.offset === 0) target.head = batch;
    for (const item of batch) {
      if (identities.has(item.key)) continue;
      identities.add(item.key);
      item.received = received++;
      target.rows.push(item);
    }
    target.offset += batch.length;
    if (!batch.length) target.exhausted = true;
    target.dirty = true;
  }
  function invalidate(kind) {
    for (const view of Object.values(views)) {
      if (!requiredKinds(view.category).includes(kind)) continue;
      if (view.hold) view.changed = true;
      else resetPages(view);
    }
  }
  function resetPages(view) {
    view.pages.clear();
    view.excluded.clear();
    view.frozenAt = 0;
    view.revision++;
  }
  function resumeSource(kind) {
    streams[kind].error = null;
    streams[kind].failedGoal = 0;
    for (const view of Object.values(views)) delete view.sourceFailures[kind];
  }
  function clearSourceFailure(kind) {
    resumeSource(kind);
    for (const view of Object.values(views)) {
      if (view.failureKind !== kind) continue;
      view.failure = null;
      view.failureKind = null;
    }
  }
  function availableFor(view, kind) {
    return streams[kind].draft
      ? streams[kind].draft.rows.length
      : candidates(view.category, true).filter((item) => item.kind === kind)
          .length;
  }
  function activeConsumers(kind) {
    return Object.values(views).filter(
      (view) => view.pending && requiredKinds(view.category).includes(kind),
    );
  }
  function rememberSourceFailure(kind, error) {
    streams[kind].error = error;
    streams[kind].failedGoal = Math.max(
      streams[kind].failedGoal,
      ...activeConsumers(kind).map((view) => view.goal),
    );
  }
  function save(kind, goal) {
    const stream = streams[kind];
    const target = stream.draft || stream;
    const consumers = activeConsumers(kind);
    // Shared work commits only at the highest outstanding category target.
    if (
      !target.exhausted &&
      consumers.some((view) => availableFor(view, kind) < view.goal)
    )
      return false;
    goal = Math.max(goal, ...consumers.map((view) => view.goal));
    clearSourceFailure(kind);
    if (stream.draft) {
      Object.assign(stream, stream.draft, { draft: null });
      invalidate(kind);
    }
    if (stream.dirty) {
      stream.storageWarning = cache?.write(kind, stream, goal) || null;
      stream.dirty = false;
    }
    notify();
    return true;
  }
  function request(kind, offset, limit, category, consume) {
    const stream = streams[kind];
    const job = { categories: new Set([category]) };
    const promise = scheduler.submit(
      () => search({ user, origin, kind, offset, limit }),
      () => job.categories.has(foreground),
    );
    const pending = { job, promise };
    stream.pending = pending;
    pending.promise = promise
      .then((batch) => {
        if (!Array.isArray(batch) || batch.length > limit)
          throw new Error("SearchEncore 返回格式无效");
        consume(batch);
        notify();
      })
      .catch((error) => {
        rememberSourceFailure(kind, error);
        throw error;
      })
      .finally(() => {
        if (stream.pending === pending) stream.pending = null;
      });
    return pending;
  }
  async function fill(view) {
    try {
      const outcomes = await Promise.allSettled(
        requiredKinds(view.category).map(async (kind) => {
          const stream = streams[kind];
          try {
            // Joining another source's rebuild must preserve this source's
            // failed target, including category-specific no-progress pauses.
            if (view.sourceFailures[kind]) throw view.sourceFailures[kind];
            if (stream.error) throw stream.error;
            if (!stream.checked) {
              const pending =
                stream.pending ||
                request(kind, 0, 50, view.category, (batch) => {
                  if (headFingerprint(batch) !== headFingerprint(stream.head)) {
                    stream.draft = {
                      rows: [],
                      head: [],
                      offset: 0,
                      exhausted: false,
                    };
                    ingest(stream.draft, batch);
                  }
                  stream.checked = true;
                  clearSourceFailure(kind);
                });
              pending.job.categories.add(view.category);
              await pending.promise;
            }
            while (true) {
              if (stream.error) throw stream.error;
              const target = stream.draft || stream;
              const available = availableFor(view, kind);
              if (available >= view.goal || target.exhausted) {
                if (save(kind, view.goal)) return;
                // Another category owns a higher shared target. Keep the barrier
                // until its progress completes or fails, without issuing extra work.
                const error = await new Promise((resolve) =>
                  stream.progressWaiters.add(resolve),
                );
                if (error) throw error;
                continue;
              }
              // A same-round independent consumer inherits this higher target.
              // Otherwise stop the failed aggregate without poisoning this stream.
              if (
                view.failure &&
                !view.refreshing &&
                !activeConsumers(kind).some((consumer) => consumer !== view)
              )
                return;
              if (scheduler.paused) throw new Error("请求已暂停，请稍后重试");
              if (target.offset > 5000)
                throw unavailable(target, view.category);
              const pending =
                stream.pending ||
                request(
                  kind,
                  target.offset,
                  Math.min(50, view.goal - available),
                  view.category,
                  (batch) => ingest(target, batch),
                );
              pending.job.categories.add(view.category);
              await pending.promise;
              const after = availableFor(view, kind);
              view.stalled[kind] =
                after > available ? 0 : view.stalled[kind] + 1;
              if (
                !(stream.draft || stream).exhausted &&
                view.stalled[kind] >= 3
              )
                throw new Error("连续三批没有有效新增，请继续重试");
            }
          } catch (error) {
            view.sourceFailures[kind] = error;
            for (const resolve of stream.progressWaiters) resolve(error);
            stream.progressWaiters.clear();
            if (stream.cached) rememberSourceFailure(kind, error);
            if (!view.failure) {
              view.failure =
                view.refreshing || stream.cached
                  ? sourceFailure(kind, error)
                  : error;
              view.failureKind = kind;
            }
            notify();
            throw error;
          }
        }),
      );
      const failed = outcomes.find((outcome) => outcome.status === "rejected");
      if (failed) throw failed.reason;
    } finally {
      scheduler.wake();
    }
  }
  function reset(view) {
    view.failure = null;
    view.failureKind = null;
    view.sourceFailures = {};
    view.stalled = Object.fromEntries(kinds.map((kind) => [kind, 0]));
  }
  function run(view) {
    view.refreshing =
      Boolean(view.hold) ||
      requiredKinds(view.category).some(
        (kind) =>
          streams[kind].cached &&
          (!streams[kind].checked ||
            streams[kind].draft ||
            streams[kind].error),
      );
    if (view.category === "all" && view.refreshing && !view.hold)
      view.hold = Object.fromEntries(
        topicKinds.map((kind) => [
          kind,
          { rows: [...streams[kind].rows], exhausted: streams[kind].exhausted },
        ]),
      );
    const goal = view.goal;
    view.pending = Promise.resolve()
      .then(() => fill(view))
      .catch((error) => {
        view.failure ||= error;
      })
      .finally(() => {
        view.pending = null;
        if (view.restart && !scheduler.paused) {
          view.restart = false;
          reset(view);
          run(view);
        } else {
          view.restart = false;
          // One source may have finished before a later click raised the goal.
          if (!view.failure && !scheduler.paused && view.goal > goal) run(view);
        }
        if (!view.pending && view.hold) {
          view.hold = null;
          if (view.changed) resetPages(view);
          view.changed = false;
        }
        notify();
      });
  }
  function prepare(category, page, retry = false) {
    const view = views[category];
    if (!view || !Number.isInteger(page) || page < 1)
      throw new Error("无效分类或页码");
    const goal = 100 + 100 * Math.floor((page + 6) / 10);
    const higher = goal > view.goal;
    view.goal = Math.max(view.goal, goal);
    if (retry && !scheduler.retry())
      return Promise.resolve({ error: new Error("请求冷却中，请稍后重试") });
    if (retry || higher) {
      if (view.pending && view.failure) view.restart = true;
      else if (!view.pending) reset(view);
      for (const kind of requiredKinds(category)) {
        const stream = streams[kind];
        // Higher targets resume ordinary loads only, never failed verification
        // or an unfinished cache rebuild. Explicit retry may resume either.
        if (
          retry ||
          (stream.checked && !stream.draft && goal > stream.failedGoal)
        )
          resumeSource(kind);
      }
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
