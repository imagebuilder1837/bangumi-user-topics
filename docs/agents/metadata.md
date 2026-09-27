# 脚本元数据治理

userscript metadata 包括人工维护的 `src/metadata.txt` 模板和生成产物 `src/index.user.js` 顶部 `==UserScript==` 块中的字段。`package.json` 的 `version` 也是受治理的版本字段。

## 人工批准

- `@name`、`@version`、`@description`、`@namespace`、`@author`、`@match`、`@run-at`、`@grant`、`@connect`、`@license`、`@downloadURL`、`@updateURL` 等 metadata 字段，以及 `package.json` 的 `version`，均由人工管理。
- 修改、添加或删除字段前，先逐项提出字段、现值、新值和理由，并等待明确批准。某一字段的批准不授权变更其他字段。
- 特别是为处理 CORS 增加 `@grant` 或 `@connect` 时，先完成 `docs/development.md` 中的 CORS smoke test 并单独申请批准。
- 获批后，提交说明中逐项列出实际 metadata 变更；提交前核对 metadata diff，确保没有未经批准的字段变化。

## 版本与构建

- 不自行决定版本升级。需要版本变更时，先取得对具体版本的批准，再按项目实际构建流程更新版本和生成产物。
- `src/index.user.js` 的 header 是交付产物，不是 metadata 的独立编辑源；手工治理模板按实际构建方式维护，避免生成产物与模板不一致。
