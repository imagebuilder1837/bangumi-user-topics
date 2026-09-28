# 维护源导航

本仓库实现日志宿主页的三分类合并分页与异步调度；其它已观察宿主页的接入由 `host-view.mjs` 守卫。行为约束见 [`spec/`](spec/)；外部环境事实见 [`external/`](external/)。构建使用人工维护的 metadata 模板。

行为变更从维护源开始，不要默认读取生成的 `src/index.user.js`。仅为构建排障、审查或最终 artifact 验收时定向检查生成文件。

| 要修改的行为 | 建议维护源 | 职责 |
| --- | --- | --- |
| 浏览器启动与模块装配 | `src/main.mjs`、`src/entry.mjs` | main 只自动启动；entry 装配各模块并处理三个精确分类路由 |
| 一级导航插入 | `src/entry.mjs`、`src/host-view.mjs` | 以原生日志链接插入全部帖子入口，维护幂等与 focus |
| fragment 路由 | `src/entry.mjs` | 处理 #posts、#posts/group、#posts/subject 和 hashchange |
| 宿主页显示/恢复 | `src/host-view.mjs` | 校验多宿主页结构，隐藏原 columns、插入独立根及原生位置子导航，退出恢复原节点与 focus |
| SearchEncore 与用户身份 | `src/search-encore.mjs`、`src/host-view.mjs` | 封装小组和条目搜索、校验响应；从原生日志链接取得用户 key |
| 搜索结果领域化 | `src/search-encore.mjs` | 两种 TopicHit 规范化及当前域名 Bangumi URL |
| 数据流、缓存与合并 | `src/topic-feed.mjs` | 双流原始 offset、共享内存去重、分类独立冻结与排除、充分前缀合并和一条前瞻 |
| 帖子页与子导航 | `src/posts-view.mjs` | 渲染三分类导航、标题和状态 |
| 列表与分页 | `src/posts-view.mjs` | 条目、metadata、加载/空/错误状态与分页交互 |
| userscript metadata | `src/metadata.txt`、`package.json` | 人工维护字段；模板仅在构建时替换 `{{VERSION}}`；规则见 `docs/agents/metadata.md` |
| 单文件交付 | `src/index.user.js` | build 生成的可安装单文件，不手工编辑 header |
| 构建与静态检查 | `scripts/build.mjs`、`scripts/check.mjs` | 生成单文件；check 验证版本及模板、node --check、格式、artifact 一致性及完整测试 |

测试按维护源的职责组织在 `test/`：`app-route.test.mjs` 覆盖分类路由及标题，`app-host.test.mjs` 覆盖入口与宿主失效/恢复，`app-feed.test.mjs` 覆盖数据合并与缓存语义，`app-scheduling.test.mjs` 覆盖调度与后台结果，`app-view.test.mjs` 覆盖列表、分页与滚动；它们通过 `app-support.mjs` 共用应用入口的 jsdom fixture。`hosts.test.mjs` 覆盖多宿主结构；`delivery.test.mjs` 验收可安装生成物。日志 fixture 在 `test/fixtures/`。
