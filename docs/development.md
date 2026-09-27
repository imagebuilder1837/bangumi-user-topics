# 开发与交付

本文记录功能实现、页面集成、数据边界和验证流程。维护源文件定位见 [`module-guide.md`](module-guide.md)；userscript 元数据审批规则见 [`agents/metadata.md`](agents/metadata.md)。

## 产品范围与数据语义

- UI 中的“帖子”仅指用户作为主题创建者发起的小组话题（group topic）和条目讨论（subject topic）。代码使用 `topic`；回复（reply）、日志、目录、短评及其他评论不属于 MVP。
- SearchEncore 是第三方镜像索引，不是权威或保证完整的档案。空结果应表述为“没有找到已收录的帖子”，不得断言该用户从未发帖。
- 仅在进入 `#posts*` 视图后请求 SearchEncore。默认不包含 hidden/blocked topics；不要自行扩大内容可见范围。

## Spike 0：编码前验证

开始 SearchEncore 集成或确定 Bangumi 页面选择器前，先完成以下 smoke test 并记录结果：

1. 以 `q=user:<username>` 分别请求 group-topics 和 subject-topics；使用已知 UID 再请求一次，确认纯用户筛选的实际行为。
2. 验证 `sort=newest` 的顺序，以及从 Bangumi 页面上下文用普通 `fetch()` 请求 SearchEncore 的 CORS 行为。
3. 检查 Bangumi 的 `/user/<name>`、`/blog`、`/index` 和 `/friends` 页面：记录 `.navTabs`、blog tab、`.navSubTabs`、`focus` 所在节点、最小正文容器、日志列表样式和分页样式。

只有观察到的实时 DOM 和请求行为能支撑实现后，才固定 selector 和交互假设。若普通 fetch 被 CORS 阻止，报告结果和所需权限；未经明确批准，不得为解决 CORS 修改 `@grant`、`@connect` 等元数据。

## Bangumi 页面集成

- 用户页一级导航应锚定原生日志链接，在“日志”后插入“帖子”；通过语义 href 定位，不依赖子节点序号。插入须幂等，扩展节点使用稳定的 `data-*` 身份标记，只拥有和修改本组件自己的节点。
- 使用当前 pathname 加 fragment 的虚拟路由：`#posts`、`#posts/group`、`#posts/subject`。`location.hash` 是筛选状态的唯一来源，并须支持直接打开、前进和后退。
- 复用 Bangumi 的 `.navTabs`、`.navSubTabs` / `focus`、用户日志列表等原生结构和视觉模式。先检查实时页面 DOM 与样式；只有确认无可复用模式时才增加最小必要 CSS。
- 宿主页面采用 hide + sibling view：保留原节点及其 listener、状态和其他组件内容；退出帖子视图时恢复原节点、原二级导航和进入前的一级导航 focus。禁止用 `innerHTML` 或 clone/替换宿主正文来实现视图切换。

## 数据与 API 边界

- 将 `bgmdb.ry.mk` 的请求集中在独立 SearchEncore adapter；renderer、route 和 DOM 模块不得自行发请求。
- 两个搜索 endpoint 的结果 normalize 为共同的 `UserTopic` 领域模型。endpoint / normalizer 负责把来源标记为 `group` 或 `subject`，view 不依赖 API 的魔法数字推导 URL。
- API 失败只影响帖子视图，提供可重试的错误状态；避免无限重试、高频轮询以及每条结果一次的详情请求。
- “全部帖子”须按创建时间合并两条流。不要把两个 endpoint 的 offset 当成同一个 offset；保证前 N 条正确时，每条流至少加载 N 条（或已 exhausted）再合并。缓存数据流和各筛选的当前页状态应分开。

## 测试、构建与交付

- 测试默认使用 Node 内置 `node:test`；DOM 行为使用 jsdom。测试按职责模块组织，并在交付测试中检查构建后的 userscript。
- 随相关功能覆盖 route/hash、导航幂等与共存、宿主 DOM 身份/状态恢复、API 错误与边界 schema、topic normalize、双流合并分页、loading/empty/error/retry 等行为。
- 项目脚本应提供 `npm run build`、`npm run format`、`npm run format:check`、`npm run test`、`npm run check`。最终变更状态在每次 commit 前运行 `npm run check`；修复失败后重新运行。若脚本尚未配置，说明缺项并运行仓库当前可用的检查，不得声称未运行的检查已通过。
- 构建后检查交付 artifact：无开发期 import，可在目标页面初始化，metadata 未发生未经批准的变化。构建不等于发布、提交或打 tag。
- 提交信息遵循 Conventional Commits，例如 `feat(feed): merge group and subject topics`。
