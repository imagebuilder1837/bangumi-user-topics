const safeID = (value) => Number.isSafeInteger(value) && value >= 0;
const replySources = {
  group: {
    path: "group/topic",
    container: "小组话题",
    label: "小组话题回复",
    parentPath: "group",
  },
  subject: {
    path: "subject/topic",
    container: "条目讨论",
    label: "条目讨论回复",
    parentPath: "subject",
  },
  episode: {
    path: "ep",
    container: "章节",
    label: "章节评论",
    parentPath: "subject",
  },
  character: { path: "character", container: "角色", label: "角色评论" },
  person: { path: "person", container: "人物", label: "人物评论" },
  blog: { path: "blog", container: "日志", label: "日志评论" },
};

function normalizeReply(row, origin) {
  const source =
    row &&
    typeof row.source === "string" &&
    Object.hasOwn(replySources, row.source)
      ? replySources[row.source]
      : null;
  if (
    !source ||
    !safeID(row.id) ||
    row.id === 0 ||
    !safeID(row.containerID) ||
    row.containerID === 0 ||
    !safeID(row.createdAt) ||
    row.createdAt > 8_639_999_999_999 ||
    typeof row.excerpt !== "string" ||
    (row.parentID != null && (!safeID(row.parentID) || row.parentID === 0)) ||
    (row.creatorID != null && !safeID(row.creatorID)) ||
    ["containerTitle", "parentName", "creatorName", "creatorUsername"].some(
      (field) => row[field] != null && typeof row[field] !== "string",
    )
  )
    throw new Error("SearchEncore 评论回复数据无效");
  return {
    key: `reply:${row.source}:${row.id}`,
    kind: "replies",
    title:
      row.containerTitle?.trim() || `${source.container} #${row.containerID}`,
    excerpt: row.excerpt.trim() || "暂无可用摘要",
    sourceLabel: source.label,
    parent: row.parentName?.trim() || null,
    parentURL:
      source.parentPath && row.parentID
        ? `${origin}/${source.parentPath}/${row.parentID}`
        : null,
    createdAt: row.createdAt,
    url: `${origin}/${source.path}/${row.containerID}#post_${row.id}`,
  };
}

export function normalizeBatch(
  payload,
  { offset, limit, origin, kind = "group" },
) {
  if (
    !payload ||
    !Array.isArray(payload.data) ||
    !payload.pagination ||
    !payload.meta ||
    typeof payload.meta !== "object" ||
    Array.isArray(payload.meta) ||
    !safeID(payload.meta.executionMs) ||
    payload.pagination.offset !== offset ||
    payload.pagination.limit !== limit ||
    !safeID(payload.pagination.total) ||
    typeof payload.pagination.totalIsEstimate !== "boolean"
  ) {
    throw new Error("SearchEncore 返回格式无效");
  }
  const items = payload.data.map((row) => {
    if (kind === "replies") return normalizeReply(row, origin);
    if (
      !row ||
      !safeID(row.id) ||
      !safeID(row.parentID) ||
      row.id === 0 ||
      row.parentID === 0 ||
      row.kind !== (kind === "group" ? 0 : 1) ||
      typeof row.title !== "string" ||
      !safeID(row.replyCount) ||
      !safeID(row.createdAt) ||
      !safeID(row.updatedAt) ||
      row.createdAt > 8_639_999_999_999 ||
      row.updatedAt > 8_639_999_999_999 ||
      (row.parentName != null && typeof row.parentName !== "string") ||
      (row.creatorID != null && !safeID(row.creatorID)) ||
      (row.creatorName != null && typeof row.creatorName !== "string")
    ) {
      throw new Error("SearchEncore 主题数据无效");
    }
    return {
      key: `${kind}:${row.id}`,
      kind,
      title: row.title || "无标题",
      parent: row.parentName || (kind === "group" ? "小组话题" : "条目讨论"),
      replies: row.replyCount,
      createdAt: row.createdAt,
      url: `${origin}/${kind}/topic/${row.id}`,
      parentURL: `${origin}/${kind}/${row.parentID}`,
    };
  });
  if (items.length > limit) throw new Error("SearchEncore 返回过多数据");
  return items;
}

export class RetryableError extends Error {}

export class RateLimitError extends Error {
  constructor(retryAfter) {
    super("SearchEncore 请求过于频繁，请稍后重试");
    this.retryAfter = retryAfter;
  }
}

export function createSearchEncore(
  fetch,
  {
    setTimeout: delay = setTimeout,
    clearTimeout: clear = clearTimeout,
    now = Date.now,
  } = {},
) {
  return async ({ user, offset, limit, origin, kind = "group" }) => {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 5000 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new Error("请求超出检索范围");
    if (!["group", "subject", "replies"].includes(kind))
      throw new Error("未知查询来源");
    const endpoint = kind === "replies" ? "replies" : `${kind}-topics`;
    const url = new URL(`https://bgmdb.ry.mk/v1/search/${endpoint}`);
    url.search = new URLSearchParams({
      q: `user:${user}`,
      sort: "newest",
      limit: String(limit),
      offset: String(offset),
    }).toString();
    if (kind === "replies") url.searchParams.set("source", "all");
    const controller = new AbortController();
    let timeout;
    try {
      return await Promise.race([
        (async () => {
          let response;
          try {
            response = await fetch(url.href, {
              credentials: "omit",
              signal: controller.signal,
            });
          } catch (error) {
            throw new RetryableError(
              error?.message || "SearchEncore 网络请求失败",
              { cause: error },
            );
          }
          if (response.status === 429) {
            const value = response.headers?.get("Retry-After");
            const seconds =
              value != null && /^\d+(?:\.\d+)?$/.test(value.trim())
                ? Number(value.trim()) * 1000
                : NaN;
            const date = value ? Date.parse(value) - now() : NaN;
            const wait = Number.isFinite(seconds) ? seconds : date;
            throw new RateLimitError(
              now() + (Number.isFinite(wait) && wait >= 0 ? wait : 60000),
            );
          }
          if (!response.ok) {
            const ErrorType =
              response.status === 408 ||
              (response.status >= 500 && response.status <= 599)
                ? RetryableError
                : Error;
            throw new ErrorType(`SearchEncore HTTP ${response.status}`);
          }
          let payload;
          try {
            payload = await response.json();
          } catch (error) {
            // Body transport/decode failures differ from invalid JSON syntax.
            if (error?.name === "TypeError" || error?.name === "AbortError")
              throw new RetryableError(
                error.message || "SearchEncore 响应体读取失败",
                { cause: error },
              );
            throw error;
          }
          return normalizeBatch(payload, {
            offset,
            limit,
            origin,
            kind,
          });
        })(),
        new Promise((_, reject) => {
          timeout = delay(() => {
            controller.abort();
            reject(new RetryableError("SearchEncore 请求超时，请重试"));
          }, 15000);
        }),
      ]);
    } finally {
      clear(timeout);
    }
  };
}
