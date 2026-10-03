# 维护源导航

本仓库实现主题双流合并与独立评论回复流的分页、缓存和统一调度。行为约束见 [`spec/`](spec/)；外部环境事实见 [`external/`](external/)；元数据模板由人工维护。

从维护源开始修改，不默认读取生成的 `src/index.user.js`；仅为构建排障、审查或最终交付验收定向检查生成物。

| 行为 | 维护源 | 边界 |
| --- | --- | --- |
| 启动与路由 | `src/main.mjs`、`src/entry.mjs` | main自动启动；entry装配模块，处理四个精确分类hash与文档标题 |
| 入口、接管与恢复 | `src/entry.mjs`、`src/host-view.mjs` | 路径与身份校验、宿主守卫、可逆显示/focus；不替换宿主正文 |
| 外部数据与领域化 | `src/search-encore.mjs` | 三个搜索endpoint、响应校验、分离主题/回复身份与当前域名URL |
| 数据流与调度 | `src/topic-feed.mjs` | 原始游标、缓存、分类冻结/排除、主题充分前缀合并、分段预加载、请求重试、共享并发与429暂停 |
| 视图 | `src/posts-view.mjs` | 四分类导航/标题、列表/原生摘要、状态与分页交互；不自行请求 |
| 元数据 | `src/metadata.txt`、`package.json` | 人工治理；模板构建时仅替换 `{{VERSION}}`，见 [`agents/metadata.md`](agents/metadata.md) |
| 单文件交付 | `src/index.user.js` | build生成；不手工编辑header |
| 构建检查 | `scripts/build.mjs`、`scripts/check.mjs` | 生成单文件、语法/格式、模板/版本与artifact一致性、完整测试 |

测试通过 `test/app-support.mjs` 的应用入口与jsdom fixture验证公开行为：route/host/feed/scheduling/view按职责分篇，`app-replies.test.mjs` 覆盖回复边界及跨分类隔离，`hosts.test.mjs` 覆盖多宿主，`delivery.test.mjs` 验收生成物。
