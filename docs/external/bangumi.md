# Bangumi 宿主页结构与样式

> 本文是对 Bangumi 生产页面 DOM/CSS 的环境知识总结，供理解与开发共享，避免重新调研。
> 证据来源：2026-09-27 匿名 curl 生产页面与原站 CSS（`https://bgm.tv/css/dist/bangumi.min.css?r771`），以及用户浏览器 DOM 采样补齐 chii.in 关键结构。静态分析**不证明**登录态、其他组件运行态或视觉呈现；若实时页面与本文冲突，以实时页面为准并更新本文。

## 一级导航（个人导航）

- 限定在 `#headerProfile .navTabs`；不应使用全站第一个任意 `.navTabs` 或按子节点序号定位。
- 日志项为直属 `li > a[href="/user/{key}/blog"]`，是获取目标用户 key 与插入“帖子”入口的语义锚点。
- 一级 focus 落在 **a** 元素上，不是 li。
- 收藏一级项是 dropdown：不能清空其子菜单。

## 用户名与标题

- 昵称位于 `#headerProfile h1 .name > a`，其后另有 `small.grey` 的 @username。
- 取昵称应取昵称锚点的文本，不把整个 h1、用户名或按钮拼进去。

## 二级导航

- 原生结构：`#headerProfile .subjectNav > .navSubTabsWrapper > ul.navSubTabs > li > a`；并非所有用户页都有（主页、日志、好友页无，目录/收藏页有）。
- `.navSubTabsWrapper` 自带背景和 1px 上边框：隐藏二级导航须隐藏整个 wrapper，只隐藏内部 ul 会留下边框。不能隐藏同时包含一级导航的 `.subjectNav`。
- 目录页的 a 内含 span，focus 同样在 a 上。

## 正文容器陷阱

- `#main.mainWrapper` 在样本中是**空节点**；真正正文在 headerProfile 之后的另一 `.mainWrapper > .columns`。不能因 id=main 就当正文。
- 原 columns 与 `#footer` 在所有有效样本中直接同父（正文父节点的直接子节点只有原 columns 与 #footer），是 sibling 挂载的边界依据。

## 各页 columns 变体

| 页面 | 正文 | 侧栏 | 二级导航 |
| --- | --- | --- | --- |
| 用户主页 `/user/{key}` | `#columnA.column` | `#columnB.column` | 无 |
| 日志 `/user/{key}/blog`（含 `/blog/tag/{tag}`） | `#columnA.column.column-main` | `#columnB.column.column-side-md` | 无 |
| 目录 `/user/{id}/index`（含 `/collect`） | `#columnA.column.column-main` | `#columnB.column.column-side-md` | 有 |
| 人物 `/user/{key}/mono`（含 `/character`、`/person`） | `#columnA.column`（内含 `.section`，空用户也在） | 无 | 有 |
| 小组 `/user/{key}/groups` | `#columnUserSingle.column`（含 `#memberGroupList`，空用户也在） | 无 | 无 |
| 好友 `/user/{key}/friends` | `#columnUserSingle.column` | 无 | 无 |
| 收藏概览 `/{type}/list/{key}` | `#columnA.column` | `#columnB.column` | 有 |
| 收藏状态 `/{type}/list/{key}/{status}` | `#columnSubjectBrowserA.column` | `#columnSubjectBrowserB.column` | 有 |
| 时间胶囊 `/user/{key}/timeline` | `#columnTimelineA.column`（含 `#timelineTabs`） | `#columnTimelineB.column` | 无 |
| 反向好友 `/user/{key}/rev_friends` | `#columnUserSingle.column` | 无 | 无 |
| 维基 `/user/{key}/wiki`（含十余个子路径） | `#columnA.column` 恒在；`#columnB` 及内容随用户数据有无，无稳定锚点 | 可有可无 | 有 |
| 天窗 `/user/{key}/doujin` | 无 `.columns` 结构 | — | — |

- 登录态差异：匿名抓取不含的兄弟组件内容会出现在上述页面（如 friend-sorter 在 friends/rev_friends 的 `.mainWrapper` 内、`.columns` 之前插入排序条；friend-tag 在 `.columns` 内部 `#columnUserSingle` 之后插入 `#friendTagPanelColumn` 面板列）；以实时页面为准。

- 正文列没有统一 ID 或统一宽度模型：不得全站硬编码 `#columnA`，也不能为套样式复制宿主 ID 或给自有 sibling 加 column class 就假定宽度正确。

## 日志列表与分页结构

- 日志正文：`.flex-center-v > h2.title`；列表 `#entry_list.entry-list > .item.clearit > .entry`；标题 `h2.title > a.l`；元信息 `.tools > .time`，日期及 `a.l` 回复链接都位于该容器内。
- 原站分页：`.page_inner` 内使用 `strong.p_cur`（当前页）与 `a.p`（页码链接）。`a.p` 是带标签约束的选择器，把 p class 贴到 button 不能获得等价外观；复用视觉即可，不复制服务端 `?page=` 链接行为。
- 原站 `.flex-center-v` 提供左右分列的 flex 布局；`small.grey` 是 10px、`#999` 的灰字。站内按钮样式选择器是 `a.chiiBtn`（包含暗色与 hover 规则），不是 `button.chiiBtn`；`small.grey a` 会覆盖嵌套链接的字号与颜色，按钮须作为灰字元素的兄弟节点。上述选择器据同一份公开 CSS 核对。
- 分页基线：日志页每页 10 条；收藏列表每页 24 条（原站事实；本项目选定每页 10 条，见 `../spec/ui.md`）。
- 侧栏内容：日志侧栏含日志标签，收藏侧栏含收藏统计/标签，首页侧栏另有独立内容。

## CSS 复用要点

- CSS 全文未出现 `entry_list` ID 选择器；列表规则使用 `.entry-list > .item` 及其 `.entry`、`h2.title`、`.tools .time`——可只复用 class，不复制宿主 ID。
- `.entry-list > .item` 使用 flex、下边框及换行规则；标题 16px、640px 以下 15px。`.entry-list > .item .tools` 原站使用 `justify-content: space-between`；日志的日期与回复同在唯一的 `.time` 子项中，因此整体靠左。
- 原生 `.entry-list .content > a` 可承接纯文本摘要及暗色/窄屏颜色；桌面 max-height 为73px，640px以下54px，超出隐藏，并非保证出现省略号的 line-clamp。完整讨论楼层样式依赖头像和嵌套缩进，不适合直接套在摘要卡上。
- 暗色由 `html[data-theme=dark]` 及原站颜色变量覆盖；窄屏按原站 media 规则适配，无需自建主题体系。
- 布局：通用桌面主布局约 1000px；首页（mainXL）为可伸缩主副栏，日志/目录另有 `columns-center`（主列最大 750px、侧栏 220px）。好友与具体收藏列表没有 mainXL 布局。
- **非 mainXL 页面在 641–999px 视口仍有 1000px 祖先最小宽度**（`#wrapperNeue`/`#headerNeue2`）：仅设置自有根宽度无法跨入口一致，这就是项目侧有限几何覆盖的依据（见 `../spec/host-view.md`）。
- 样式含显式 `display: flex`：设置 `hidden` 属性不必然压过作者样式，需用限定到自有身份/状态标记的可靠隐藏机制。
- 简单规则摘录会丢失 media 层级，不能单独用于判断实际级联；宽度结论以原站 CSS 为准（jsdom 无真实布局）。

## 域名差异（chii.in）

- Cloudflare 防护比另两域严格，无头浏览器可能停在带限制性 CSP 的挑战页。2026-10-02 用户确认实际使用无差别；后续不单独针对 chii.in 做 CORS smoke test，不以挑战页失败判定真实用户页的 CORS，也不据此增加请求权限。

- 匿名 curl 常返回挑战页（403），不能用作 DOM fixture；关键结构经用户浏览器采样确认与另两域名一致（导航锚点、`.columns.columns-center` 父节点 `.mainWrapper.mainXL`、columns 与 footer 同父）。
- 曾观察到原站 `/min/g=js?r771` 403 与 `chiiLib` 未定义；这与 bgmdb fetch 成功是不同事实，宿主脚本运行状态需在真实环境确认。

## 扩展共存

- 原站 `/user/{key}/rev_friends` 的 SSR 导航将好友标为 focus 且不提供反向好友 tab；`bangumi-reverse-friends-nav` 会在运行时插入该项并转移 focus。
- 本项目进入帖子时的 focus 移交因此必须覆盖“其他扩展创建的已选中顶层导航项”（见 `../spec/host-view.md`），退出按所有权规则恢复。
- `bangumi-friend-tag` 在 `.columns` 内部插入 `#friendTagPanelColumn` 面板列；`bangumi-friend-sorter` 在 `.columns` 之前插入排序条。两者均不影响接管（footer 边界规则，见 ADR-0004），且在帖子视图活动期间被一并隐藏，退出时原样恢复。

## 证据等级

- 匿名服务端 HTML/CSS：无 Cookie、无脚本执行；不证明登录态、组件共存或视觉呈现。
- 样式表版本查询字符串一致（r771）不代表三域名 CSS 内容逐字一致。
- 少量成功样本不证明所有用户、所有子页或全历史行为稳定。
