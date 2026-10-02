# SearchEncore（bgmdb）API 摘要

> 第三方服务的契约与接入陷阱；以线上行为为准。来源：[文档入口](https://bgmdb.ry.mk/v1/docs)、[OpenAPI](https://bgmdb.ry.mk/v1/openapi.json)。核验日期：2026-09-27、2026-10-02；OpenAPI 3.1.0、info.version=0.1.0，版本号不能判断部署是否更新。

SearchEncore 是 Bangumi 内容的第三方镜像索引，不是官方服务或保证完整的档案。项目的数据源选择见 ADR 0001；回复与主题的集合边界见 `CONTEXT.md`。

## 搜索端点

- `GET /v1/search/group-topics` — 用户发起的小组话题。
- `GET /v1/search/subject-topics` — 用户发起的条目讨论。
- `GET /v1/search/replies` — 用户发表的评论回复，不是别人回复该用户，也不是该用户创建的主题下的所有发言。
- 无关键词时使用 `q=user:<username|uid>`、`sort=newest`、`limit`、`offset`。topics 和 replies 的作者筛选均有用户名/UID结果相同的样本；不是改名、数字式用户名或全量等价保证。

三端点返回 `{data,pagination,meta}`，但 data 分属 TopicHit 与 ReplyHit，不能互套字段。pagination 必含 `total/limit/offset/totalIsEstimate`；meta 必含非负整数 `executionMs`，估算 total 不是终止依据。

## TopicHit

| 字段 | 契约与陷阱 |
| --- | --- |
| id、parentID | 必填 int64；parentID 为所属小组/条目 ID |
| kind | 必填数字；group=0、subject=1（样本观察；领域来源由 endpoint 标记） |
| title、replyCount、createdAt、updatedAt | 必填；没有正文或摘要字段 |
| parentName | 可省略/null；显示名，不是 slug |
| creatorID、creatorName | 可省略/null |

## ReplyHit

- 主楼不在回复搜索范围内，大楼层和楼中楼可检索；[主题 444557 的详情数组](https://bgmdb.ry.mk/v1/groups/-/topics/444557/replies?limit=8&offset=0)及[楼中楼搜索命中](https://bgmdb.ry.mk/v1/search/replies?q=user%3Awataame%20Sai%20Fans%20Club%20exact%3Atrue&source=group&limit=3)提供对照。主题创建者后来发表的回复并不被排除。
- source 省略或 `all` 搜索六类，也支持单类。实测 `source=group,subject` 与未知来源返回 unknown reply source（错误体 status=422），不可依赖多来源列表语法。章节/人物评论和日志评论不等于收藏短评、目录评论或时间线发言，后者没有覆盖承诺。

| 字段 | 契约与陷阱 |
| --- | --- |
| source | 必填 string；六种来源，schema 本身没有 enum 限制 |
| id、containerID | 必填 int64；分别是发言 ID 与所在对象 ID，不可互换 |
| excerpt、createdAt | 必填 string/int64；摘要不是完整正文 |
| containerTitle | 可省略/null；对象未完整收录时可以没有名称 |
| parentID、parentName | 可省略/null；group 的所属小组、subject/episode 的所属条目；**不是父回复** |
| creatorID、creatorName、creatorUsername | 可省略/null；发言作者信息 |

没有楼层号、被回复者、parentReplyID、完整正文、回复数、原站 URL 或删除状态。跨来源 ID 全局唯一没有保证；不能按 containerID 去重，也不能把来源 group 的回复当作 group topic。

excerpt 契约是去引用、去 BBCode 的纯文本；关键词以 U+E000/U+E001 包围，不是 HTML。样本保留换行和 `(musume_03)` 等文本。截断窗口、实体解码和异常 BBCode 清洗未知，不保证保留剧透遮罩；不要把服务文本当 HTML 或尝试重建富文本。

### 原站路径与锚点

匿名原站 HTML 中六类都有 `id="post_{回复ID}"` 和原生楼层锚点，链接由 containerID 与 id 共同构造：

| source | 路径 | 已观察的原生锚点 |
| --- | --- | --- |
| group | `/group/topic/{containerID}#post_{id}` | [大楼层](https://bgm.tv/group/topic/387262#post_2468185)、[楼中楼](https://bgm.tv/group/topic/387262#post_2469316) |
| subject | `/subject/topic/{containerID}#post_{id}` | [大楼层](https://bgm.tv/subject/topic/29079#post_289221)、[楼中楼](https://bgm.tv/subject/topic/29079#post_338073) |
| episode | `/ep/{containerID}#post_{id}` | [章节评论](https://bgm.tv/ep/1185374#post_1343746) |
| character | `/character/{containerID}#post_{id}` | [角色评论](https://bgm.tv/character/6154#post_435450) |
| person | `/person/{containerID}#post_{id}` | [人物评论](https://bgm.tv/person/9512#post_129913) |
| blog | `/blog/{containerID}#post_{id}` | [日志评论](https://bgm.tv/blog/371465#post_352025) |

数字楼层标签或父楼层包装 ID 不是发言身份。原站可能已删除、保护或合并对象；例如镜像 character 回复28514仍指向[角色30114](https://bgm.tv/character/30114)，原站却已变成锁定的“合并用”且无该锚点。合法索引命中不能保证链接必达，也不证明原站当前公开可见。

## 为什么主题列表没有正文摘要

TopicHit 没有 excerpt/content/body，搜索参数也没有正文展开契约；[小组关键词样本](https://bgmdb.ry.mk/v1/search/group-topics?q=SearchEncore&limit=1&offset=0)和[条目作者样本](https://bgmdb.ry.mk/v1/search/subject-topics?q=user%3Asai&sort=newest&limit=1&offset=0)均只有 metadata。正文参与检索不等于随结果返回摘要。

详情端点返回存储的上游文档，不含 replies、不保证正文。[小组444557的 replies 首条](https://bgmdb.ry.mk/v1/groups/-/topics/444557/replies?limit=1&offset=0)有 `isOP:true` 和 BBCode 正文，但这是每主题额外一次请求，仍需校验 OP 并自行处理引用、图片与遮罩。不能仅按作者或数组位置猜主楼。

[条目27318详情](https://bgmdb.ry.mk/v1/subjects/-/topics/27318)、[25670详情](https://bgmdb.ry.mk/v1/subjects/-/topics/25670)的 content 为空，其 replies 也为空，而[原站27318](https://bgm.tv/subject/topic/27318)主楼有正文。缺失原因未知；不能宣称原文为空，也不能从两个样本推导所有条目都不可取得正文。逐条取主楼既放大请求，又不能保证两类摘要可用。

## 分页、排序与访问陷阱

- 搜索 limit 默认20、钳制1–50；offset默认0、钳制0–5000。超界不一定报错，5000不是总量上限；回复样本 total=6051。不要与主题 replies **详情**的 limit 1–200 混淆。
- topics 的 sort 支持 newest/new、oldest/old、popular/hot；replies 明确支持 newest、oldest，其他值按相关度、无关键词默认最新，没有热门排序信号。并列次序、快照与跨页稳定性无保证。
- 时间字段 schema 没标单位；主题27318与回复3620513已按 Unix秒对照原站时间。updatedAt不能当作正文修订时间。
- hidden topics 使用 include:blocked；默认 NSFW 政策及回复逐来源的可见性规则没有完整保证。索引完整性、删除同步和镜像时效均未知。
- 所属小组链接 `/group/{parentID}` 不加尾斜杠（人工观察带尾斜杠空白）；所属条目链接 `/subject/{parentID}`。显示名不能替代数字ID。
- 2026-09 topics 从三域页面上下文用普通 `fetch(..., {credentials: "omit"})` 均可读；2026-10-02 无头 Chromium 的 bgm.tv、bangumi.tv 实际用户页中，replies同样得到200及可读JSON，无需特权请求。chii.in 的后续验证约定见 [`bangumi.md`](bangumi.md#域名差异chiiin)。

保守的项目侧分页、缓存与调度约束只在 [`../spec/feed.md`](../spec/feed.md) 维护。
