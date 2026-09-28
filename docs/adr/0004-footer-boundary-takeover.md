# 接管校验降为 footer 边界规则，不再枚举页面 shape

接管校验曾经按页面 shape 枚举 columns 的合法子节点序列并要求 evidence 锚点存在（`columnShapes`/`evidence` 表），出现任何不认识的节点就拒绝挂载并显示错误面板。实测中兄弟组件 `bangumi-friend-tag` 在 `.columns` 内部 `#columnUserSingle` 之后插入自己的面板列，直接击穿 friends 页的 shape 白名单，导致支持范围内的页面频繁“无法安全挂载”；而 hide + sibling 机制本身是完全可逆的——无论 columns 里是什么内容，隐藏与恢复都不会破坏宿主。本项目改为 **footer 边界规则**：接管层只确认 `.mainWrapper` 正文容器存在且其直接子节点含 `.columns` 与 `#footer`；接管期间隐藏 `.mainWrapper` 内 `#footer` 之前的所有节点（含兄弟组件插入的排序条、面板列等），退出时整体恢复。

这是有意的放宽：安全性从“只藏认识的节点”转移到“隐藏机制完全可逆 + 结构关系守卫”。`verifyTakeover` 不再需要 shape 表，wiki 族页面（`columnB` 时有时无）与未来新页面自然被覆盖。

## Considered Options

- 维持 shape + evidence 校验，为 friend-tag 加白名单例外：被拒——每来一个新组件都要改表，规则退化为无穷枚举，且仍会在未知组件上失败。
- 无校验直接挂载：被拒——没有 `#footer` 就没有挂载锚点，导航身份校验（`locateProfile`）仍必须成立。
- 兄弟组件节点保持可见（原 ADR-0003 行为）：被拒——豁免规则又变回枚举式；帖子视图定位是独立单列页，排序条等在接管期间没有意义，隐藏后退出时原样恢复，无损。

## Consequences

- 修订 ADR-0003 的部分后果：错误面板只在“导航身份成立但 `.mainWrapper`/`#footer` 缺失”时出现，成为残局兜底而非常态；兄弟组件在 `.mainWrapper` 内、`#footer` 之前的节点在接管期间**不再保持可见**。
- 二级导航出现多个 `.navSubTabsWrapper` 不再拒绝接管；取第一个含 `ul.navSubTabs` 列表的 wrapper 作为 `originalSub` 隐藏（无法从结构上区分原生与组件 wrapper，先到先得），多余 wrapper 保持可见。
- 运行期守卫从 evidence 锚点改为 columns/footer/自有根的结构关系；`columns` 失去 class 不再触发退出，`.mainWrapper` 容器关系或 footer 结构破坏才退出。
- 若未来站点改版使某页面仍匹配路径但结构完全不同，接管会隐藏陌生内容后插入帖子视图；退出可恢复，风险从“不可恢复的误接管”降为“可恢复的误隐藏”。
