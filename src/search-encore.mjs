const safeID = (value) => Number.isSafeInteger(value) && value >= 0;

export function normalizeBatch(
  payload,
  { offset, limit, origin, kind = "group" },
) {
  if (
    !payload ||
    !Array.isArray(payload.data) ||
    !payload.pagination ||
    !payload.meta ||
    payload.pagination.offset !== offset ||
    payload.pagination.limit !== limit ||
    !safeID(payload.pagination.total) ||
    typeof payload.pagination.totalIsEstimate !== "boolean"
  ) {
    throw new Error("SearchEncore 返回格式无效");
  }
  const topics = payload.data.map((row) => {
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
  if (topics.length > limit) throw new Error("SearchEncore 返回过多数据");
  return topics;
}

export function createSearchEncore(
  fetch,
  { setTimeout: delay = setTimeout, clearTimeout: clear = clearTimeout } = {},
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
    if (kind !== "group" && kind !== "subject") throw new Error("未知主题来源");
    const url = new URL(`https://bgmdb.ry.mk/v1/search/${kind}-topics`);
    url.search = new URLSearchParams({
      q: `user:${user}`,
      sort: "newest",
      limit: String(limit),
      offset: String(offset),
    }).toString();
    const controller = new AbortController();
    const timeout = delay(() => controller.abort(), 15000);
    try {
      const response = await fetch(url.href, {
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`SearchEncore HTTP ${response.status}`);
      return normalizeBatch(await response.json(), {
        offset,
        limit,
        origin,
        kind,
      });
    } finally {
      clear(timeout);
    }
  };
}
