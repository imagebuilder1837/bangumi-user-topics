# 维护源导航

本仓库当前处于 scaffold 阶段。下表依据工程规格给出建议的模块边界；实现时可调整文件名，但要保持各职责分离，并在模块落地后同步更新本指南。

行为变更从维护源开始，不要默认读取生成的 `src/index.user.js`。仅为构建排障、审查或最终 artifact 验收时定向检查生成文件。

| 要修改的行为 | 建议维护源 | 职责 |
| --- | --- | --- |
| 浏览器启动与模块装配 | `src/main.mjs`、`src/entry.mjs` | 启动 userscript、验证目标页面、装配各模块 |
| 一级导航插入 | `src/navigation.mjs` | 以原生语义锚点插入帖子入口，维护幂等及本组件 focus |
| fragment 路由 | `src/route.mjs` | 解析 hash、监听 hashchange；hash 是筛选状态唯一来源 |
| 宿主页显示/恢复 | `src/host-view.mjs` | 保存并恢复原节点、二级导航和原生 focus；显示/隐藏 sibling view |
| SearchEncore 与用户身份 | `src/search-encore.mjs`、`src/user-identity.mjs` | 封装第三方请求、username/UID 处理、错误和超时边界 |
| 搜索结果领域化 | `src/topic-normalizer.mjs` | 将 group/subject API 结果映射为共同的 `UserTopic` 模型及 Bangumi URL |
| 数据流、缓存与合并 | `src/topic-feed.mjs` | 两类 stream 的加载、缓存、exhausted 状态、按创建时间合并 |
| 帖子页与子导航 | `src/posts-view.mjs`、`src/posts-subtabs.mjs` | 根据 route 渲染视图并复用原生 `navSubTabs` 模式 |
| 列表与分页 | `src/posts-list.mjs`、`src/pagination.mjs` | topic 条目、metadata、加载/空/错误状态与分页交互 |
| userscript metadata | `src/metadata.txt` | 人工维护的 header 模板；修改审批规则见 `docs/agents/metadata.md` |
| 单文件交付 | `src/index.user.js` | build 生成的可安装 artifact，不作为日常行为维护源 |
| 构建与静态检查 | `scripts/build.mjs`、`scripts/check.mjs` | 生成并验证单文件交付物 |

测试按维护源的职责组织在 `test/`：route、导航、宿主页、API adapter、normalizer、feed、rendering 和交付 artifact。DOM 测试使用 jsdom；共用 fixture / 替身放在 `test/support/`。
