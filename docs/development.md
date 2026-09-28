# 开发与交付

本文只记录开发环境、构建与交付流程。行为约束见 [`spec/`](spec/)；维护源定位见 [`module-guide.md`](module-guide.md)；userscript 元数据审批规则见 [`agents/metadata.md`](agents/metadata.md)。

## 文档地图

- `CONTEXT.md` — 领域术语表
- `spec/` — 帖子的持久行为规格（路由/宿主接管、数据流/调度、视图/交互）
- `external/` — 外部环境事实（Bangumi 宿主页、SearchEncore API），以线上为准
- `adr/` — 重大决策记录

## 环境与脚本

- 测试使用 Node 内置 `node:test`；DOM 行为使用 jsdom。测试按维护源职责组织，交付测试检查构建后的 userscript。
- 项目脚本：`npm run build`、`npm run format`、`npm run format:check`、`npm run test`、`npm run check`。
- 每次提交前在最终变更状态运行 `npm run check`；失败修复后重新运行。不得声称未运行的检查已通过。
- 提交信息遵循 Conventional Commits，例如 `feat(feed): merge group and subject topics`。

## 构建与交付

- 构建生成可安装的单文件 userscript（`src/index.user.js`）；不手工编辑生成文件的 header，metadata 模板的变更规则见 `agents/metadata.md`。
- 构建后检查交付 artifact：无开发期 import、可在目标页面初始化、metadata 与获批值一致。构建不等于发布、提交或打 tag。

## 新增宿主页面或外部集成前的最小验证

接入新的宿主页面结构或新的外部服务前，先完成 smoke test 并据此固定假设，不靠候选示例编码：

1. **API 行为**：用真实参数请求目标服务，确认筛选指令、排序顺序、分页钳制与响应 envelope 的实际表现；契约文档与部署实测冲突时，以实测为准并更新 `external/` 对应文档。
2. **CORS**：从 Bangumi 页面上下文用普通 `fetch()` 验证可读性。若被 CORS 阻止，报告结果和所需权限；未经明确批准，不得为解决 CORS 修改 `@grant`、`@connect` 等元数据。
3. **页面结构**：检查候选页面的导航锚点、focus 所在节点、正文容器、列表与分页样式；只有观察到的实时 DOM 能支撑实现后，才固定 selector 和交互假设。若结构无法安全挂载，按 `spec/host-view.md` 的守卫语义不接管。
