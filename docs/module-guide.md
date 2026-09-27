# 维护源导航

本仓库已有 #2 的开发态小组话题纵向切片；未交付的分类和其它宿主页仍为后续规划。下表区分当前维护源与后续建议边界。

行为变更从维护源开始，不要默认读取生成的 `src/index.user.js`。仅为构建排障、审查或最终 artifact 验收时定向检查生成文件。

| 要修改的行为 | 建议维护源 | 职责 |
| --- | --- | --- |
| 浏览器启动与模块装配 | `src/main.mjs`、`src/entry.mjs` | main 只自动启动；entry 验证日志宿主页、装配各模块并处理当前小组路由 |
| 一级导航插入 | `src/entry.mjs`、`src/host-view.mjs` | 以原生日志链接插入小组帖子入口，维护幂等与 focus |
| fragment 路由 | `src/entry.mjs` | 仅处理 #posts/group 和 hashchange；其它分类留待后续票 |
| 宿主页显示/恢复 | `src/host-view.mjs` | 校验真实日志结构，隐藏原 columns、显示 sibling view，退出恢复原节点与 focus |
| SearchEncore 与用户身份 | `src/search-encore.mjs`、`src/host-view.mjs` | 封装第三方小组搜索、校验响应；从原生日志链接取得用户 key |
| 搜索结果领域化 | `src/search-encore.mjs` | 小组 TopicHit 规范化及 Bangumi URL；条目来源留待后续票 |
| 数据流、缓存与合并 | `src/topic-feed.mjs` | 当前单流原始 offset、内存去重、已展示页及一条前瞻；双流合并留待后续票 |
| 帖子页与子导航 | `src/posts-view.mjs` | 当前只渲染小组帖子，不暴露未交付的分类入口 |
| 列表与分页 | `src/posts-view.mjs` | 条目、metadata、加载/空/错误状态与分页交互 |
| userscript metadata | 尚无 | 未获逐字段批准，不生成 metadata header；规则见 `docs/agents/metadata.md` |
| 单文件交付 | `src/index.user.js` | build 生成的**开发态**单文件，不可当作可安装 userscript 发布 |
| 构建与静态检查 | `scripts/build.mjs`、`scripts/check.mjs` | 生成开发态 bundle；check 统一运行 node --check、格式检查、artifact 一致性及完整测试 |

测试按维护源的职责组织在 `test/`：route、导航、宿主页、API adapter、normalizer、feed、rendering 和交付 artifact。DOM 测试使用 jsdom；共用 fixture / 替身放在 `test/support/`。
