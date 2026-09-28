# 以 SearchEncore 为唯一帖子数据源

Bangumi 官方 API 没有聚合“某用户发起的小组话题与条目讨论”的端点，新建服务器路径也不可行；本项目的全部帖子查询因此走第三方镜像索引 SearchEncore（bgmdb.ry.mk）的两个搜索 endpoint，从宿主页面用普通 `fetch`（`credentials=omit`）访问——三域名的 CORS 可用性已有实测，无需特权请求。接受其代价：索引可能漂移和遗漏、存在服务检索上限、服务不可用即帖子功能不可用；结果不冒充完整发帖档案，空结果只能说“没有找到已收录的帖子”。见 `docs/external/search-encore.md`。

## Consequences

- feed 层的全部终止、分页与缓存语义都建立在该服务无快照、无稳定游标承诺的前提上（ADR 0002）。
- 若未来更换数据源，`spec/feed.md` 中依赖“动态索引、无完整快照”前提的约束需一并重审。
