# 维护源导航

本仓库已有日志宿主页的三分类合并分页与异步调度；其它已观察宿主页的接入由 `host-view.mjs` 守卫。真实浏览器验收与 metadata 审批仍待完成。

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
| userscript metadata | 尚无 | 未获逐字段批准，不生成 metadata header；规则见 `docs/agents/metadata.md` |
| 单文件交付 | `src/index.user.js` | build 生成的**开发态**单文件，不可当作可安装 userscript 发布 |
| 构建与静态检查 | `scripts/build.mjs`、`scripts/check.mjs` | 生成开发态 bundle；check 统一运行 node --check、格式检查、artifact 一致性及完整测试 |

测试按维护源的职责组织在 `test/`：`app.test.mjs` 通过应用入口验收 route、导航、宿主、adapter、feed 与 rendering；`hosts.test.mjs` 覆盖多宿主结构；`delivery.test.mjs` 验收开发态生成物。DOM 测试使用 jsdom；日志 fixture 在 `test/fixtures/`。
