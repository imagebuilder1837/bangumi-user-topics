# SearchEncore（bgmdb）API 摘要

> 本文是第三方服务 SearchEncore 的可读总结，供快速理解契约；**以线上服务为准**。权威来源：
> - 文档入口：<https://bgmdb.ry.mk/v1/docs>
> - OpenAPI schema：<https://bgmdb.ry.mk/v1/openapi.json>（本文摘自 2026-09-27 抓取的 OpenAPI 3.1.0，info.version=0.1.0；版本号属服务自身，不涉及本项目）
>
> 若本文与线上行为冲突，以实际行为为准并更新本文。

## 服务定位

SearchEncore 是 Bangumi 内容的第三方镜像索引，不是 Bangumi 官方服务，也不是保证完整的档案。本项目全部帖子查询经由它完成（见 ADR 0001）。

## 搜索端点

- `GET /v1/search/group-topics` — 搜索小组话题
- `GET /v1/search/subject-topics` — 搜索条目讨论
- 常用参数：`q=user:<username|uid>`（纯用户筛选）、`sort=newest`、`limit`、`offset`

两 endpoint 返回相同的 envelope 结构 `SearchEnvelope_TopicHit`：`data`（TopicHit 数组）、`pagination`、`meta`。

## TopicHit 字段

| 字段 | 说明 |
| --- | --- |
| `id`、`parentID` | 必填，int64；parentID 为所属小组/条目 ID |
| `kind` | 必填数字；group=0、subject=1（样本观察；调用方由 endpoint 注入领域类型，不依赖魔法值） |
| `title`、`replyCount`、`createdAt`、`updatedAt` | 必填 |
| `parentName` | 可省略或 null；父对象**显示名称**，不是 slug，不能用于构造 URL |
| `creatorID`、`creatorName` | 可省略或 null |

## 行为要点

- `limit` 默认 20，钳制 1–50；`offset` 默认 0，钳制 0–5000。超界**不一定报错**；客户端须自行遵守上限，且 offset 上限不等于“最多只有 5000 条数据”。
- `sort` 接受 `newest/new`、`oldest/old`、`popular/hot`；其他值走相关度。schema 未声明并列次序或快照保证。
- `pagination` 必含 `total`、`limit`、`offset`、`totalIsEstimate`；估算 total 不是终止依据。
- `createdAt`/`updatedAt` schema 仅标 integer/int64、未注明单位。用户已人工对照主题 27318（parentID=307 红猪）：`createdAt=1697285544` 按 Unix 秒解释与主楼时间一致；本项目按 Unix 秒接入。
- hidden topics 需 `include:blocked`；NSFW 与 hidden 是独立维度，无指令时的默认 NSFW 行为未在契约中说明。本项目默认不加任何可见性指令。
- URL 构造佐证：所属条目使用 `/subject/{parentID}`（Bangumi 官方 API schema 的示例同时给出 id 与该 URL 格式）；所属小组使用 `/group/{parentID}` 无尾斜杠（带尾斜杠地址返回空白页，人工实测）。
- schema 另有 replies 搜索能力；本项目明确排除回复，不据此扩展范围。

## 实测记录（2026-09）

- 从 bgm.tv、bangumi.tv、chii.in 三域名页面上下文，用普通 `fetch(..., {credentials: "omit"})` 请求两个搜索 endpoint 均得 HTTP 200 且 JS 可读响应；无需特权请求。
- 同一 endpoint 上 `user:<username>` 与 `user:<uid>` 的 `data`/`pagination` 自动比较完全相同（仅 `meta.executionMs` 不同）；此为样本观察，非全量保证。

## schema 未承诺的事项

CORS 策略、跨页次序稳定性、快照/一致性语义、并列时间排序均无契约承诺。相关保守语义见 [`../spec/feed.md`](../spec/feed.md)。
