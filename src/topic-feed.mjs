// Service cursors are shared; displayed identities and late exclusions belong to a category.
const kinds = ["group", "subject"];
const order = (a, b) =>
  b.createdAt - a.createdAt ||
  kinds.indexOf(a.kind) - kinds.indexOf(b.kind) ||
  a.received - b.received;
const unavailable = (stream) =>
  new Error(
    stream.offset > 5000
      ? "已达到服务检索上限，可能仍有更早的帖子"
      : "无法确定当前页，请继续重试",
  );

export function createTopicFeed(search, { user, origin }) {
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

  function candidates(category) {
    const view = views[category];
    const displayed = new Set([...view.pages.values()].flat());
    const boundary = view.pages.size
      ? known.get(view.pages.get(Math.max(...view.pages.keys())).at(-1))
      : null;
    const result = [];
    for (const kind of category === "all" ? kinds : [category]) {
      for (const topic of streams[kind].rows) {
        if (view.excluded.has(topic.key)) continue;
        if (
          boundary &&
          !displayed.has(topic.key) &&
          order(topic, boundary) <= 0
        ) {
          view.excluded.add(topic.key);
          continue;
        }
        result.push(topic);
      }
    }
    result.sort(order);
    return result;
  }

  // Each required stream supplies N effective candidates (including frozen entries),
  // or proves natural exhaustion. Raw rows and globally cached keys are not a prefix.
  async function fill(category, count, target) {
    const required = category === "all" ? kinds : [category];
    await Promise.all(
      required.map(async (kind) => {
        const stream = streams[kind];
        while (true) {
          const available = candidates(category).filter(
            (t) => t.kind === kind,
          ).length;
          if (available >= count || stream.exhausted) return;
          if (stream.offset > 5000) throw unavailable(stream);
          if (!stream.pending && target.requests[kind] >= 3)
            throw unavailable(stream);
          if (!stream.pending) {
            const offset = stream.offset;
            const limit = Math.min(50, Math.max(1, count - available));
            stream.pending = search({ user, origin, kind, offset, limit })
              .then((batch) => {
                if (!Array.isArray(batch) || batch.length > limit)
                  throw new Error("SearchEncore 返回格式无效");
                // A successful batch is accepted atomically by the adapter.
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
                stream.pending = null;
              });
          }
          target.requests[kind]++;
          await stream.pending;
        }
      }),
    );
  }

  async function prepare(category, page, retry = false) {
    const view = views[category];
    if (!view || !Number.isInteger(page) || page < 1)
      throw new Error("无效分类或页码");
    const id = String(page);
    let target = view.targets.get(id);
    if (!target || retry) {
      target = { requests: { group: 0, subject: 0 }, failure: null };
      view.targets.set(id, target);
    }
    if (view.pages.has(page) && !retry) {
      const entries = candidates(category);
      return {
        items: view.pages.get(page).map((key) => known.get(key)),
        next:
          entries.length > page * 10
            ? "yes"
            : (category === "all" ? kinds : [category]).every(
                  (k) => streams[k].exhausted,
                )
              ? "no"
              : "unknown",
      };
    }
    if (target.failure && !retry) return { error: target.failure };
    const goal = page * 10;
    let problem = null;
    try {
      await fill(category, goal + 1, target);
    } catch (error) {
      problem = error;
    }
    let entries = candidates(category);
    const required = category === "all" ? kinds : [category];
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
        unavailable(streams[category === "all" ? "group" : category]);
      return { error: target.failure };
    }
    if (entries.length <= start) return { items: [], next: "no" };
    // Freeze only the displayed page, never the lookahead candidate.
    const keys = entries.slice(start, goal).map((t) => t.key);
    entries = candidates(category);
    return {
      items: (view.pages.get(page) || keys).map((key) => known.get(key)),
      next: entries.length > goal ? "yes" : exhausted() ? "no" : "unknown",
      warning: problem,
    };
  }
  function commit(category, page, items) {
    const view = views[category];
    if (!view.pages.has(page))
      view.pages.set(
        page,
        items.map((topic) => topic.key),
      );
  }
  return { prepare, commit };
}
