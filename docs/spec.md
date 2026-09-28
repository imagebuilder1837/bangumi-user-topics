# 帖子组件规格

本目录是帖子的持久行为规格：记录跨模块的约束与不变量，作为理解和修改代码的共同基线。实现细节以代码为准；两者冲突时先核对代码再修订本文。

- 术语表：根目录 [`CONTEXT.md`](../CONTEXT.md)
- 外部环境事实（Bangumi 宿主页、SearchEncore）：[`external/`](external/)
- 重大决策记录：[`adr/`](adr/)

## 分篇

- [`spec/host-view.md`](spec/host-view.md) — 支持范围、入口插入、hash 路由、宿主接管与恢复、focus 与共存、失效与重入
- [`spec/feed.md`](spec/feed.md) — 数据源边界、归一化与 envelope 校验、缓存与排序、冻结页、合并分页与前瞻、调度与错误分类
- [`spec/ui.md`](spec/ui.md) — 帖子视图、列表条目、分页交互、状态文案、滚动与可访问性

## 范围

- “帖子”仅指用户作为主题创建者发起的小组话题（group topic）和条目讨论（subject topic）；回复、日志、目录、短评及其他评论不属于聚合范围。
- 目标域名为 HTTPS 的 bgm.tv、bangumi.tv、chii.in；主题与所属对象链接保留当前域名。
- 核心宿主页面：用户主页、日志、目录、好友，以及 anime、book、music、game、real 五类收藏页面。metadata 的宽泛 `@match` 不等于已验证兼容；未调查结构必须通过安全挂载守卫，失败即不接管。
- 数据来自 SearchEncore 第三方镜像索引（见 ADR 0001）。结果不冒充完整发帖档案；空结果只能表述为“没有找到已收录的帖子”。
- 仅在进入有效且可安全挂载的帖子视图后请求第三方；普通用户页初始化不预取。
