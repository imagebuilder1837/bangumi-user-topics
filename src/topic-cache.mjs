import { normalizeBatch } from "./search-encore.mjs";

export const headFingerprint = (items) =>
  JSON.stringify(items.map(({ data, received, ...item }) => item));

// Storage is optional. Resolve the property inside the guard: even accessing
// window.localStorage can throw when browser policy disallows persistence.
export function createTopicCache(getStorage, { user, origin }) {
  const key = (kind) =>
    `bangumi-user-topics:stream:${encodeURIComponent(user)}:${kind}`;
  const normalize = (data, kind) =>
    normalizeBatch(
      {
        data,
        pagination: {
          offset: 0,
          limit: data.length,
          total: 0,
          totalIsEstimate: false,
        },
        meta: { executionMs: 0 },
      },
      { offset: 0, limit: data.length, origin, kind },
    );
  return {
    read(kind) {
      try {
        const record = JSON.parse(getStorage().getItem(key(kind)));
        if (
          record?.version !== 1 ||
          record.user !== user ||
          record.kind !== kind ||
          !Array.isArray(record.rows) ||
          !Array.isArray(record.head) ||
          !Number.isSafeInteger(record.offset) ||
          record.offset < record.rows.length ||
          record.offset > 5050 ||
          typeof record.exhausted !== "boolean" ||
          !Number.isSafeInteger(record.goal) ||
          record.goal < 100 ||
          record.goal % 100 !== 0 ||
          (!record.exhausted && record.rows.length < record.goal) ||
          record.head.length > Math.min(50, record.offset) ||
          (!record.head.length &&
            (record.offset !== 0 || record.rows.length || !record.exhausted))
        )
          return null;
        const rows = normalize(record.rows, kind);
        const head = normalize(record.head, kind);
        const identities = new Set(rows.map((item) => item.key));
        const initial = new Map();
        for (const item of head)
          if (!initial.has(item.key)) initial.set(item.key, item);
        if (
          identities.size !== rows.length ||
          head.some((item) => !identities.has(item.key)) ||
          headFingerprint([...initial.values()]) !==
            headFingerprint(rows.slice(0, initial.size))
        )
          return null;
        return {
          rows,
          head,
          offset: record.offset,
          exhausted: record.exhausted,
        };
      } catch {
        return null;
      }
    },
    write(kind, stream, goal) {
      try {
        getStorage().setItem(
          key(kind),
          JSON.stringify({
            version: 1,
            user,
            kind,
            goal,
            rows: stream.rows.map((item) => item.data),
            head: stream.head.map((item) => item.data),
            offset: stream.offset,
            exhausted: stream.exhausted,
          }),
        );
        return null;
      } catch {
        return new Error("缓存保存失败，本次使用内存数据");
      }
    },
  };
}
