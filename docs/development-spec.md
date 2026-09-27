# Bangumi 用户帖子组件：开发规格（Engineering Design Spec）

> 状态：Draft / 可用于与 coding agent 讨论和拆解实现  
> 整理日期：2026-09-27  
> 推荐仓库名：`bangumi-user-topics`  
> 推荐组件显示名：**Bangumi 用户帖子**  
> 用户页导航文字：**帖子**

---

## 0. 这份文档是什么

这不是传统意义上以市场、运营、业务指标为主的 PRD，更适合作为一份 **Engineering Design Spec / Development Specification（工程开发规格）**。

它的目标是把当前讨论中已经完成的需求分析、Bangumi 原站调查、SearchEncore API 调查、交互方案、兼容策略、工程规范、风险和待验证项集中到一个可执行的上下文里，使后续 agent 能够：

1. 不重新发明需求和术语；
2. 明确哪些结论已经确定、哪些只是候选方案；
3. 根据既定的 Bangumi 原生视觉与 DOM 原则实现；
4. 与作者现有 Bangumi 组件保持工程规范和兼容性；
5. 在开始编码前先完成少量关键 smoke test；
6. 根据本文直接拆 issue / task / test plan。

建议项目建立后将本文暂存为根目录 `SPEC.md` 或 `docs/development-spec.md`。稳定且长期有效的领域定义随后沉淀进 `CONTEXT.md`；重要且不可轻易逆转的设计决策可单独写入 `docs/adr/`。

---

# 1. 项目目标

在 Bangumi 用户页的个人导航中增加一个 **「帖子」** 入口。

用户点击后，可查看该用户**发起过的讨论主题**，包括：

- 小组话题（group topic）；
- 条目讨论（subject topic）。

组件应尽量表现得像 Bangumi 原生功能，而不是额外叠加的一套第三方 UI。

核心体验：

> 打开任意 Bangumi 用户页 → 点击「帖子」→ 在当前页面内无整页刷新地查看此用户发起的小组话题与条目讨论，并可在“全部帖子 / 小组话题 / 条目讨论”之间切换。

---

# 2. 产品范围与术语

## 2.1 「帖子」的正式定义

本项目 UI 中的 **帖子** 指：

> 用户作为主题创建者（OP）发起的 **小组话题 + 条目讨论**。

代码和领域模型中优先使用 `topic`，不要使用含义模糊的 `post`。

原因：Bangumi 的讨论数据结构里，“主题”和“回复/楼层”是不同概念；本项目检索的是主题创建行为，不是该用户参与过的所有讨论。

建议领域词汇：

| UI / 中文 | 代码术语 | 含义 |
|---|---|---|
| 帖子 | topic | 本项目聚合后的讨论主题 |
| 小组话题 | group topic | `/group/topic/{id}` |
| 条目讨论 | subject topic | `/subject/topic/{id}` |
| 回复 / 楼层 | reply | topic 内回复，不属于本项目 MVP |
| 全部帖子 | all topics | group + subject 合并流 |

## 2.2 明确不纳入 MVP 的内容

以下虽然也是用户生成内容，但**不属于本项目“帖子”定义**：

- 日志（blog）；
- 目录（index）；
- 时间胶囊 / 状态；
- 小组话题或条目讨论中的回复；
- 章节/剧集吐槽；
- 条目短评、收藏评论；
- 日志评论；
- 人物等其他对象下的评论。

原因包括：

1. Bangumi 已经为日志、目录等提供独立用户页导航；
2. “发起主题”与“回复/评论”在信息架构上是不同操作；
3. SearchEncore 当前可以很好地搜索 group topic / subject topic，但没有一个覆盖所有回复/评论类型的“按用户全站发言”接口。

因此本组件**不是**“用户全部发言记录”。

---

# 3. 可行性结论

## 3.1 总结

该想法技术上可行，且 SearchEncore API 与需求高度匹配。

SearchEncore OpenAPI 明确提供：

- `GET /v1/search/group-topics`
- `GET /v1/search/subject-topics`
- 搜索查询中的 `user:<username|uid>` 指令
- `newest / oldest / popular` 排序
- `limit`、`offset` 分页
- Topic 结果中的创建者、父对象名称、回复数和时间

因此不需要自行爬取 Bangumi 用户历史帖子。

## 3.2 主要限制

SearchEncore 是第三方镜像搜索服务，不是 Bangumi 权威数据库接口。

因此本组件不能把结果语义设计成“绝对完整、权威的全部历史发帖”。历史数据可能因为抓取范围、同步延迟、删除/修改同步等原因存在缺失。

UI 不需要反复强调“不完整”，但 README / 项目说明中应准确描述为依赖 SearchEncore 索引的数据。

服务端历史讨论中已经出现过：

- 个别小组历史主题初始抓取漏收；
- 小组/话题/回复查询出现 timeout 的用户反馈；
- API 配置错误导致临时失败的反馈。

所以第三方服务失败必须是可降级状态，不能破坏 Bangumi 原页面。

---

# 4. SearchEncore API 调查

## 4.1 文档入口

- API Docs：`https://bgmdb.ry.mk/v1/docs#`
- OpenAPI：`https://bgmdb.ry.mk/v1/openapi.json`
- 相关组件讨论：`https://bgm.tv/group/topic/444557`

OpenAPI 版本：3.1.0。服务描述为对 bgm.tv 镜像数据提供全文搜索。

## 4.2 与本项目直接相关的接口

### 搜索小组话题

```http
GET https://bgmdb.ry.mk/v1/search/group-topics
```

### 搜索条目讨论

```http
GET https://bgmdb.ry.mk/v1/search/subject-topics
```

共同查询参数：

```text
q       optional string
sort    optional string
limit   optional int, 1..50
 offset optional int, 0..5000
```

> 注：OpenAPI 中 `offset` 上限为 5000，`limit` 上限为 50。

### 查询用户

```http
GET https://bgmdb.ry.mk/v1/users/{key}
```

其中 `{key}` 明确支持：

- numeric user ID；
- username。

详情接口返回的是上游 Bangumi 文档，但 OpenAPI 只把 schema 定义为通用 `object`，因此不可仅依赖 OpenAPI 推导内部所有字段。

## 4.3 `q` 的高级指令

OpenAPI 明确说明搜索接口支持将下列 inline directive 从搜索文本中提取：

```text
user:<username|uid>
group:<slug>
type:<anime|book|music|game|real>
sort:<newest|oldest|popular>
exact:true
include:blocked
include:nsfw
exclude:nsfw
```

对本项目最重要的是：

```text
user:<username|uid>
```

理论请求：

```http
GET /v1/search/group-topics?q=user:sai&sort=newest&limit=50&offset=0
GET /v1/search/subject-topics?q=user:sai&sort=newest&limit=50&offset=0
```

或使用 UID：

```text
q=user:<numeric uid>
```

### 当前验证状态

**OpenAPI 契约：已确认。**

**在线实际请求：本文整理环境尚未直接验证。** 当前网页读取工具无法访问带 query string 的该第三方 endpoint，因此开发第一步必须在真实浏览器 / 本地请求环境进行 smoke test。

2026-09-27 SearchEncore 讨论页恰好有人提出：允许“搜索词为空、只有 `user:sai` 筛选，直接列出 sai 发起的全部小组话题/条目讨论”。作者回复“这两个都会做”。该讨论明确指出现有 SearchEncore 组件前端的 `search()` 会在 keyword 为空时直接 return；这说明至少现有 GUI 曾限制纯筛选搜索，但并不能证明服务端 API 不支持。

开发前应实测：

1. `q=user:sai` 是否在 group topics 返回数据；
2. `q=user:sai` 是否在 subject topics 返回数据；
3. `q=user:<uid>` 是否返回相同用户结果；
4. `sort=newest` 是否按 `createdAt` 降序稳定返回；
5. 搜索接口是否允许从 `bgm.tv` 页面使用普通 `fetch()` 跨域访问。

## 4.4 `TopicHit` 可用字段

OpenAPI 当前定义：

```ts
type TopicHit = {
  id: number;
  kind: number;
  parentID: number;
  parentName: string | null;
  title: string;
  creatorID: number | null;
  creatorName: string | null;
  replyCount: number;
  createdAt: number;
  updatedAt: number;
};
```

其中 `parentName` 的描述是解析后的父对象名称：

- group title；或
- subject name。

搜索响应统一 envelope：

```ts
{
  data: TopicHit[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    totalIsEstimate: boolean;
  };
  meta: {
    executionMs: number;
  };
}
```

## 4.5 一个必须修正的 UI 假设：搜索结果没有正文摘要

此前讨论过“完全仿日志列表：标题 → 摘要 → 时间/回复数”。

根据 OpenAPI，`TopicHit` **没有 topic 主楼正文/content 字段**。

因此第一版不能假设搜索 API 可直接提供帖子摘要。

可选路线：

### MVP 推荐：不为摘要增加 N+1 请求

列表显示：

```text
帖子标题
小组「番组开发」 · 2026-09-27 15:34 · 12 回复
```

或：

```text
帖子标题
条目「xxx」 · 2026-09-20 12:00 · 5 回复
```

仍然复用日志页的排版语言和间距，但不强行制造一个不存在的数据层。

### 后续增强候选：按需请求详情

SearchEncore 提供：

```http
GET /v1/groups/-/topics/{id}
GET /v1/subjects/-/topics/{id}
```

但 OpenAPI 对这两个详情响应仅建模为 `object`。如果未来需要摘要，必须先实测实际 JSON schema，并避免列表加载时对每条结果执行 N+1 请求。

可以考虑：展开时请求、可视区域 lazy fetch、批量缓存等；不纳入 MVP。

## 4.6 hidden / NSFW 行为

OpenAPI 明确区分：

- `include:nsfw`
- `exclude:nsfw`
- `include:blocked`

其中 hidden topics 需要显式 `include:blocked`。

本项目默认**不要加入 `include:blocked`**，避免主动扩大普通用户可见内容范围。

是否显式使用 `include:nsfw` / `exclude:nsfw` 应以 Bangumi 当前用户访问规则和 SearchEncore 默认行为为准，在 smoke test 后决定；优先遵循站点默认可见性，不自行发明内容政策。

---

# 5. Bangumi 原站信息架构调查

## 5.1 用户页一级导航

当前 Bangumi 用户页可见导航包含：

```text
时光机
收藏
时间胶囊
人物
日志
目录
小组
好友
维基
天窗
```

目标是在“日志”和“目录”之间加入：

```text
日志 → 帖子 → 目录
```

理由：

- 日志：用户创作的长内容；
- 帖子：用户发起的讨论内容；
- 目录：用户整理的内容。

信息架构连续且容易理解。

## 5.2 用户目录页提供了现成的二级筛选范式

Bangumi 用户的“目录”页已经有二级导航，例如：

```text
某用户创建的目录
某用户收藏的目录
```

这说明帖子分类不应该设计成自有 badge / button group，而应该复用用户页现成的二级导航视觉语言。

当前相关页面与既有脚本中可观察到：

```text
#headerProfile .navSubTabs
```

作为用户页二级导航容器，并使用 `focus` 表达当前项。

正式实现前仍需在浏览器当前 DOM 中确认：

- `.navSubTabs` 的精确层级；
- `.focus` 实际落在 `li`、`a` 或哪个节点；
- 可否直接复制现有 `li/a` 节点结构和 class。

## 5.3 帖子页二级导航

建议：

```text
全部帖子   小组话题   条目讨论
```

对应虚拟路由：

```text
#posts
#posts/group
#posts/subject
```

这三个名称比“全部 / 小组 / 条目”更清晰，因为“条目”和“小组”单独出现容易与其他用户页功能混淆。

## 5.4 内容列表以“日志页视觉语言”为基线

当前用户日志页呈现的核心节奏是：

```text
标题
正文摘要（日志有）
时间 · 回复数
```

帖子页应复用其字体、标题层级、行距、metadata 风格、分页视觉等，而不是设计一套 card UI。

由于 TopicHit 没有摘要，MVP 建议：

```text
标题
小组/条目来源 · 创建时间 · 回复数
```

视觉上像“没有摘要的日志条目”，而不是现代卡片列表。

---

# 6. 路由与导航设计

## 6.1 不创建假的服务器路径

不推荐：

```text
/user/sai/posts
```

Bangumi 服务端并不存在该页面，刷新 / 新标签页 / 脚本未加载时会产生不可靠体验。

## 6.2 采用当前 URL + fragment 的虚拟路由

推荐在当前用户页 URL 后增加：

```text
#posts
```

例如：

```text
/user/sai#posts
/user/sai/blog#posts
/user/sai/index#posts
/user/sai/friends#posts
```

都代表：

> 保留当前宿主页 pathname，在客户端进入帖子虚拟视图。

分类：

```text
#posts           → 全部帖子
#posts/group     → 小组话题
#posts/subject   → 条目讨论
```

优势：

- 修改 hash 不触发整页请求；
- 不需要为了进入帖子页先加载 `/user/:name`；
- 浏览器前进 / 后退天然可用；
- 没有组件时 URL 仍然是一个正常 Bangumi 页面，只多出无害 fragment；
- 可直接复制和分享带筛选状态的链接。

## 6.3 单一状态源

筛选状态由 `location.hash` 决定。

不要同时维护：

```js
let selectedTab = ...
```

和 hash 两套相互同步的真值。

建议：

```ts
type PostsRoute = "all" | "group" | "subject" | null;
```

解析规则：

```text
#posts         => all
#posts/group   => group
#posts/subject => subject
其他           => null
```

监听：

```js
window.addEventListener("hashchange", syncRoute);
```

初始化时也必须根据当前 hash 同步一次，以支持直接打开分享 URL。

---

# 7. 宿主 DOM 非破坏原则

这是与其他组件兼容的核心约束。

## 7.1 不销毁原页面正文

禁止用类似：

```js
container.innerHTML = "...";
```

直接替换原页面主体。

原因：这会销毁：

- Bangumi 已存在 DOM 状态；
- 其他组件插入的节点；
- 其他脚本绑定到原节点的事件 listener；
- 可能存在的动态观察状态。

推荐方式：

1. 保留原节点；
2. 进入帖子视图时隐藏原节点；
3. 插入组件自己的 sibling view；
4. 离开帖子视图时移除/隐藏帖子 view；
5. 恢复原节点。

不建议通过 `cloneNode(true)` 备份再恢复，因为 clone 不保留事件 listener 和运行时状态。

## 7.2 原有二级导航也要保留

当用户从 `/user/foo/index#posts` 进入帖子视图时，宿主页本来就有目录的 `.navSubTabs`。

不应把原有二级导航改造成：

```text
foo创建的目录 / foo收藏的目录 / 全部帖子 / 小组话题 / 条目讨论
```

正确策略：

```text
原 navSubTabs → 临时隐藏
帖子 navSubTabs → 作为 sibling 插入并显示
```

退出 `#posts*` 后：

```text
帖子 navSubTabs → 移除/隐藏
原 navSubTabs   → 原样恢复
```

## 7.3 一级导航 focus 的保存与恢复

因为 pathname 没变，例如：

```text
/user/sai/blog#posts
```

服务端渲染时“日志”仍会是原生 focus。

进入帖子虚拟视图后必须：

- 清除宿主页一级导航的 focus；
- 为“帖子”加 focus。

退出后必须恢复进入前的原 focus，而不是假设一定恢复到“日志”。

用户可能从 `/index`、`/friends` 等任何支持页面进入。

---

# 8. 与作者现有组件的兼容协议

## 8.1 现有 `bangumi-reverse-friends-nav` 的可复用模式

该组件当前已经采用值得延续的模式：

- 找 `.navTabs`；
- 用语义 href 找原生 `/friends`；
- 不依赖“第几个 tab”；
- 复制原生元素 tag/class；
- 在语义锚点旁插入；
- 插入前检查是否已经存在；
- 只修改自己的 focus。

本项目应沿用同一哲学。

## 8.2 本项目一级导航插入方式

目标语义锚点：原生 `/blog`。

概念上：

```js
const NAV_SELECTOR = ".navTabs";
const BLOG_SELECTOR = 'a[href$="/blog"]';
```

找到 blog tab 的 `<li>` 后，将“帖子”插入其后，即实现：

```text
日志 → 帖子 → 目录
```

实现时仍应从当前原生 tab 克隆/复用结构和 class，不自行猜样式。

## 8.3 扩展身份标记

建议作者自己的导航组件逐步统一增加稳定身份标记：

```html
<li data-bgm-nav-extension="user-topics">...</li>
```

现有反向好友可未来使用：

```html
<li data-bgm-nav-extension="reverse-friends">...</li>
```

用途：

- 幂等；
- 调试；
- 其他作者自有组件可以识别但不必依赖；
- 避免通过文字内容识别扩展节点。

本项目不应要求其他组件存在，也不应为某一个组件写硬编码特判。

## 8.4 自有组件兼容的基本协议

作者未来所有用户页导航增强建议遵守：

1. 只寻找原生语义锚点，不按 children index 定位；
2. 不重建整个 `.navTabs`；
3. 每个组件只拥有和修改自己的节点；
4. 插入行为必须幂等；
5. 扩展节点使用稳定 `data-*` 身份；
6. 不无条件清理其他 hash；
7. 不假定其他组件的执行顺序；
8. 对 MutationObserver / 动态改动保持容忍（是否需要 observer 由实际站点行为决定）。

`bangumi-reverse-friends-nav` 目前锚定 `/friends`，本项目锚定 `/blog`，两者天然不存在直接插入位置竞争。

---

# 9. 数据获取策略

## 9.1 仅在用户真正打开帖子视图时访问第三方 API

不要在每次打开用户页时后台预取 SearchEncore。

原因：

- 减少第三方服务压力；
- 减少不必要的网络请求；
- 第三方请求会暴露访问行为、目标 username 等信息；
- 避免服务故障拖慢普通用户页。

触发条件：第一次进入任意 `#posts*` 路由。

## 9.2 username 与 UID

Bangumi 用户页 pathname 已经给出 username：

```text
/user/<username>/...
```

OpenAPI 明确支持：

```text
user:<username|uid>
```

因此 MVP 最简单的查询可直接使用 username。

更稳健的可选增强：

1. 调用 `GET /v1/users/{username}`；
2. 若实际响应能稳定取得 numeric id，则后续使用 `user:<uid>`；
3. 失败则回退 username。

原因：UID 比 username 更稳定，不受改名影响。

但此优化并非 MVP 前提。不要为了“必须转 UID”阻塞核心功能。

## 9.3 API adapter 隔离

所有对 `bgmdb.ry.mk` 的请求必须集中在独立 adapter 中。

例如：

```ts
searchGroupTopics(...)
searchSubjectTopics(...)
getUser(...)
```

Renderer / route / DOM 模块不得自行 `fetch()`。

这样未来：

- API 域名变化；
- CORS 策略变化；
- schema 修订；
- timeout / retry 策略变化；

都集中在边界模块处理。

---

# 10. CORS 与 userscript 元数据：开发前置风险

这是实现前必须验证的一项。

目标是优先保留：

```text
@grant none
```

并在页面里使用标准 `fetch()`。

但由于 SearchEncore 是跨域 API：

```text
bgm.tv → bgmdb.ry.mk
```

必须确认 API 返回允许该请求的 CORS header。

### 分支 A：普通 fetch 可用

优先方案：

- 保持 `@grant none`；
- 不需要 `GM_xmlhttpRequest`；
- 与现有简洁 userscript 模式一致。

### 分支 B：普通 fetch 因 CORS 不可用

则需要评估：

- `GM_xmlhttpRequest`；
- 相应 `@grant`；
- `@connect bgmdb.ry.mk`。

根据作者现有仓库规范，userscript metadata 属于人工治理范围。因此 agent **不得自行**为了修 CORS 修改 `@grant`、`@connect` 等字段，必须先报告 smoke test 结果并获得明确批准。

---

# 11. 前端数据模型

建议将两个 API 结果 normalize 到同一领域模型：

```ts
type TopicKind = "group" | "subject";

type UserTopic = {
  id: number;
  kind: TopicKind;
  parentId: number;
  parentName: string | null;
  title: string;
  creatorId: number | null;
  creatorName: string | null;
  replyCount: number;
  createdAt: number;
  updatedAt: number;
  url: string;
};
```

URL：

```text
group   → https://bgm.tv/group/topic/{id}
subject → https://bgm.tv/subject/topic/{id}
```

不要让 view 根据原始 SearchEncore `kind` 魔法数字决定 URL。API 层或 normalizer 应负责把原始结果转为明确的 `"group" | "subject"`。

---

# 12. 合并流与分页

## 12.1 三个视图

```text
全部帖子     = group topics + subject topics，按 createdAt 降序合并
小组话题     = group topics
条目讨论     = subject topics
```

API 请求均使用 `sort=newest`。

## 12.2 不要把两个 endpoint 的 offset 当成一个 offset

错误模型：

```text
page 2 => group offset 20 + subject offset 20 => merge
```

因为两类内容在时间轴上的分布不均匀，这会导致全部帖子视图丢失、重复或顺序错误。

## 12.3 推荐的正确且简单策略

设页面大小为 `P`，用户需要看到“全部帖子”前 `N = page * P` 条。

为了保证 top-N 合并结果正确，只需确保**每个 stream 至少加载 N 条（或已 exhausted）**，然后：

```js
merge(groupLoaded, subjectLoaded)
  .sort((a, b) => b.createdAt - a.createdAt)
  .slice(0, N)
```

理由：最终 top-N 中任一单独 stream 最多贡献 N 条，因此每类加载 N 条就足以确定前 N 个合并结果。

实现时 API 单次 `limit <= 50`，因此 stream manager 可以按 50 为 chunk 增量加载，直到：

```text
loaded.length >= N
```

或服务端无更多结果。

这个策略会有最多约 2 倍的 overfetch，但实现简单、正确、可测试，对于用户帖子场景成本可接受。

后续如果性能数据显示有必要，再优化为真正的 lazy k-way merge。

## 12.4 单分类视图

`group` / `subject` 单分类直接使用对应 endpoint 的 offset 分页即可，并复用已经加载的 stream cache。

从 `#posts` 切到 `#posts/group` 不应重新拉取同一批数据。

## 12.5 页面状态与 API 状态分离

页面状态：

```ts
viewState = {
  all: { page: 1 },
  group: { page: 1 },
  subject: { page: 1 },
};
```

数据流状态：

```ts
feeds = {
  group: {
    items: [],
    nextOffset: 0,
    exhausted: false,
    loading: false,
  },
  subject: {
    items: [],
    nextOffset: 0,
    exhausted: false,
    loading: false,
  },
};
```

不要把“当前页面”和“服务端 offset”混成一个变量。

## 12.6 `totalIsEstimate`

SearchEncore pagination 提供：

```text
totalIsEstimate
```

因此 UI 不应强依赖一个绝对准确的“共 X 页 / 共 X 帖”。

分页可更保守地依据：

- 当前是否还有可加载数据；
- API 是否已 exhausted；
- 下一页是否实际能组成内容。

如果需要显示总数，只有在 `totalIsEstimate === false` 时才应把它当精确值。

---

# 13. UI 设计规格

## 13.1 一级导航

```text
... 人物 | 日志 | 帖子 | 目录 | 小组 | 好友 ...
```

“帖子”链接使用 fragment：

```html
<a href="#posts">帖子</a>
```

创建结构时优先复制原生日志 tab 的 tag/class，再修改 href/text。

## 13.2 二级导航

复用用户目录页现成的 `navSubTabs` 视觉范式：

```text
全部帖子 | 小组话题 | 条目讨论
```

链接分别：

```html
<a href="#posts">全部帖子</a>
<a href="#posts/group">小组话题</a>
<a href="#posts/subject">条目讨论</a>
```

当前项使用 Bangumi 原生 `focus` 模式。

不要自创：

- pill；
- badge；
- segmented control；
- 大按钮；
- card tabs。

## 13.3 页面标题

推荐：

```text
<昵称>的帖子
```

例如：

```text
Sai🖖的帖子
```

应尽量复用日志页标题层级。

## 13.4 Topic item

MVP 信息：

```text
标题
来源 · 创建时间 · 回复数
```

来源：

```text
小组「<parentName>」
条目「<parentName>」
```

`parentName === null` 时必须有合理降级文案，例如仅显示“小组话题”或“条目讨论”，不要渲染 `null`。

时间格式尽量与 Bangumi 原站当前页面一致。

## 13.5 加载状态

加载中应使用最小原生风格文本，不引入复杂 skeleton UI，除非 Bangumi 有可直接复用的 skeleton。

例如：

```text
正在加载帖子…
```

## 13.6 空状态

例如：

```text
没有找到已收录的帖子。
```

避免声称：

```text
该用户从未发过帖子。
```

因为第三方索引可能不完整。

## 13.7 错误状态

SearchEncore 请求失败时：

```text
帖子服务暂时不可用。
[重试]
```

不要影响：

- 用户页原内容；
- 一级导航其他 tab；
- 其他组件。

禁止无限自动重试或高频轮询。

---

# 14. 原生样式复用规则

本项目应把作者已有规范中的“优先复用 Bangumi 原站 CSS”进一步具体化。

建议写入项目 `AGENTS.md` 的项目特有规则：

> 用户帖子视图以 Bangumi 用户页既有界面模式为 UI 契约：一级入口复用 `.navTabs` 的原生结构；帖子类型筛选复用目录页 `.navSubTabs` / `focus` 模式；内容列表以用户日志页的标题、metadata、间距与分页视觉为基线。能通过复制/复用当前站点 DOM 结构、CSS class 和 CSS variable 实现时，不创建平行的组件视觉体系。只有确认当前 Bangumi 页面不存在等价样式后，才允许增加最小必要 CSS。

注意：

- “复用原站样式”不只是颜色相似；
- 应优先复用信息架构、DOM 语义、class 和状态机制；
- 正式编码前必须再次查看实时 Bangumi DOM，避免仅根据历史选择器硬编码。

---

# 15. 推荐工程结构

本项目复杂度已经明显高于单一导航 patch，建议以作者现有 `bangumi-friend-sorter` 的模块化结构作为母版，而不是继续写单个大型 `index.user.js`。

候选结构：

```text
src/
  main.mjs
  entry.mjs

  navigation.mjs
  route.mjs
  host-view.mjs

  search-encore.mjs
  user-identity.mjs
  topic-normalizer.mjs
  topic-feed.mjs

  posts-view.mjs
  posts-subtabs.mjs
  posts-list.mjs
  pagination.mjs

  metadata.txt
  index.user.js          # generated artifact

scripts/
  build.mjs
  check.mjs

test/
  route.test.mjs
  navigation.test.mjs
  host-view.test.mjs
  search-encore.test.mjs
  topic-normalizer.test.mjs
  topic-feed.test.mjs
  posts-view.test.mjs
  delivery.test.mjs
  support/

docs/
  agents/
  adr/
  module-guide.md

AGENTS.md
CONTEXT.md
SPEC.md                 # 可在实现稳定后拆分/归档
README.md
package.json
```

最终文件名可调整；核心原则是：

```text
API / data / routing / DOM renderer / navigation
```

不要混在同一个函数或文件中。

---

# 16. 从现有 Bangumi 组件直接继承的开发规范

作者公开 Bangumi 组件中已经形成稳定基线，应直接继承。

## 16.1 Conventional Commits

提交信息必须使用 Conventional Commits。

例如：

```text
feat(feed): merge group and subject topics
fix(route): restore host sub tabs after leaving posts view
test(api): cover estimated pagination
```

## 16.2 userscript metadata 人工治理

`==UserScript==` metadata 块及版本字段默认由人工管理。

Agent 未获逐项明确批准时不得自行修改：

```text
@name
@version
@description
@namespace
@match
@grant
@connect
@run-at
@license
@downloadURL
@updateURL
package.json version
```

本项目尤其要把 CORS 所需的 `@grant/@connect` 视为显式人工决策。

## 16.3 Site styles

新增 CSS 前必须检查目标 Bangumi 页面实时 DOM 和样式表，优先复用原站 class / variable /视觉语言。

本项目的具体化要求见第 14 节。

## 16.4 Issue 默认只读

默认禁止任何 issue 写操作。

只有人工显式要求时，agent 才允许：

- 新建 issue；
- 修改 issue；
- 评论；
- 修改标签；
- 关闭 issue 等。

## 16.5 统一 triage 标签

继续使用：

```text
needs-triage
needs-info
ready-for-agent
ready-for-human
wontfix
```

## 16.6 Single-context domain docs

本项目是 single-context repo：

```text
CONTEXT.md
docs/adr/
```

不需要引入 multi-context 的额外层级。

## 16.7 维护源与交付产物分离

参考 `bangumi-friend-sorter`：

- 行为修改从职责模块维护源开始；
- 不默认加载整个生成的 `src/index.user.js`；
- `src/index.user.js` 主要用于构建排障、审查、最终 artifact 验收；
- `src/metadata.txt` 是人工维护头部模板；
- build 生成可安装单文件 userscript。

## 16.8 提交前检查

建议继续提供：

```text
npm run build
npm run format
npm run format:check
npm run test
npm run check
```

每次 commit 前必须在最终变更状态执行 `npm run check`，失败则修复并重新运行。

## 16.9 测试技术栈

继续使用作者现有项目已经证明可行的：

- Node built-in `node:test`；
- jsdom（DOM 行为）；
- Prettier；
- Rollup 或现有单文件构建方式。

---

# 17. `CONTEXT.md` 建议首先固定的领域事实

至少写清：

1. UI 中“帖子” = 用户发起的 group topic + subject topic；
2. 内部领域术语使用 `topic`，`post/reply` 保留给楼层语义；
3. SearchEncore 是第三方镜像，不能保证历史完整；
4. 组件只在 `#posts*` 视图进入后请求第三方服务；
5. 宿主 Bangumi DOM 不得被销毁；
6. 一级导航通过原生语义锚点扩展；
7. 二级筛选复用 `navSubTabs`；
8. hash 是帖子虚拟路由和筛选的单一状态源；
9. API 网络逻辑只存在于 adapter 边界；
10. Bangumi 原站 UI 模式优先于自定义 CSS。

---

# 18. 可能值得写 ADR 的决策

候选 ADR：

### ADR-001：使用 fragment virtual route，而不是伪造 `/user/:name/posts`

记录：

- 背景；
- `#posts` 的原因；
- 服务器 404 风险；
- 浏览器 history 行为；
- pathname 保持宿主页。

### ADR-002：帖子范围仅限 group topic + subject topic

防止未来需求讨论中逐渐把 replies、comments、blogs 全部塞进一个“帖子”概念。

### ADR-003：宿主 DOM 采用 hide + sibling，不使用 destructive replacement

这是跨组件兼容的重要长期决定。

是否现在就创建 ADR 可由实现阶段决定；不要为了形式主义一次性生成大量 ADR。

---

# 19. 测试计划

## 19.1 Route

覆盖：

```text
#posts
#posts/group
#posts/subject
unknown hash
empty hash
```

确认 hash 是唯一筛选状态源。

## 19.2 Navigation

测试：

- 找不到 `.navTabs` → 安全 no-op；
- 找不到 `/blog` → 安全 no-op；
- 正常插入日志后；
- 重复初始化不重复插入；
- 保留原生 class；
- 扩展节点有稳定 data marker；
- 进入 posts view 时 focus 正确；
- 退出后恢复原 focus；
- reverse-friends 同时存在时不互相破坏。

## 19.3 Host DOM preservation

测试宿主页：

- 无 `navSubTabs`；
- 有原生 `navSubTabs`（目录页）；
- `navSubTabs` 内有其他组件额外节点；
- 主体节点绑定 listener / 属性后进入并退出 posts view，原节点身份不变。

## 19.4 API adapter

使用 mock response 测：

- success；
- HTTP error；
- malformed JSON / schema 缺字段；
- timeout / abort；
- empty data；
- pagination total estimate；
- parentName null；
- creator fields null。

## 19.5 Topic normalization

分别将 group / subject `TopicHit` 映射为统一 `UserTopic`，并生成正确 Bangumi URL。

## 19.6 Merge feed

重点覆盖：

- 两流交错；
- 全是 group；
- 全是 subject；
- 一边 exhausted；
- 同一 timestamp；
- 翻多页后无重复、无遗漏；
- all/group/subject 切换复用 cache；
- page state 分别保存。

同 timestamp 应定义稳定 tie-breaker（例如 `createdAt` 后按 `kind` + `id`），确保重渲染顺序稳定。

## 19.7 Rendering

测试：

- loading；
- empty；
- error + retry；
- normal topic；
- parentName null；
- replyCount 0；
- 分页。

## 19.8 Delivery

最终生成单文件 userscript，做 artifact 级检查：

- metadata 未被未经批准改变；
- 无开发期 import；
- 可在目标页面初始化；
- 关键模块行为在 bundle 中存在。

---

# 20. MVP 验收标准

满足以下条件即可认为第一版可发布：

1. 用户页一级导航出现“帖子”，位置为日志之后、目录之前；
2. 与 `bangumi-reverse-friends-nav` 同时启用不会破坏导航；
3. 点击“帖子”只改变 hash，不触发整页 Bangumi 页面跳转；
4. 支持 `#posts`、`#posts/group`、`#posts/subject`；
5. 二级筛选视觉复用 Bangumi 用户目录页的 `navSubTabs` 模式；
6. 正文列表视觉复用用户日志页的排版语言；
7. 能按目标用户查询小组话题；
8. 能按目标用户查询条目讨论；
9. “全部帖子”按创建时间将两类结果正确合并；
10. 三个筛选之间切换不重复请求已有数据；
11. 浏览器前进 / 后退能正确恢复筛选和宿主页；
12. 进入/退出帖子页不销毁宿主页 DOM；
13. SearchEncore 超时/失败只影响帖子视图，不影响 Bangumi 页面；
14. 不把第三方索引的空结果宣称为“用户从未发帖”；
15. `npm run check` 通过；
16. 关键 route / navigation / feed / renderer 行为有自动测试。

---

# 21. 开发开始前的 Spike 0（必须先做）

Agent 在正式实现前应先完成最小验证并回报结果，不要在未知事实之上写完整 UI。

### A. API 功能 smoke test

实测：

```text
/v1/search/group-topics?q=user:<username>&sort=newest
/v1/search/subject-topics?q=user:<username>&sort=newest
```

确认“无关键词、仅 user directive”当前服务端是否真的工作。

再对一个已知 UID 测：

```text
q=user:<uid>
```

### B. CORS smoke test

直接从 Bangumi 页面 context 使用标准 `fetch()` 请求 SearchEncore。

输出结论：

```text
普通 fetch 可用 / 不可用
```

如不可用，只报告需要 userscript privileged request；不要自行改 metadata。

### C. DOM smoke test

分别检查：

- `/user/<name>`；
- `/user/<name>/blog`；
- `/user/<name>/index`；
- `/user/<name>/friends`（如存在）；

记录：

- `.navTabs` 精确 DOM；
- `/blog` tab 结构；
- `.navSubTabs` 精确 DOM；
- `focus` 精确挂载节点；
- 正文主容器；
- 日志 item 的可复用 class；
- 原站分页 class。

只在这个调查完成后固定 selector。

---

# 22. 非目标 / 暂不实现

MVP 不做：

- 用户所有回复历史；
- 章节吐槽；
- 条目短评/收藏评论；
- 搜索关键词输入框；
- 自定义排序 UI；
- “最热”等排序按钮；
- topic 正文摘要的 N+1 抓取；
- 无限滚动；
- 自定义主题系统；
- 本地长期数据库缓存；
- SearchEncore 数据完整性修复；
- 修改 Bangumi 后端；
- 伪造 `/user/:name/posts` 服务端路径。

第一版应保持小、原生、可靠。

---

# 23. 命名建议

## 用户可见

组件名：

```text
Bangumi 用户帖子
```

导航：

```text
帖子
```

页面标题：

```text
<昵称>的帖子
```

README 一句话：

> 在 Bangumi 用户页个人导航中增加“帖子”入口，查看该用户发起的小组话题与条目讨论。

## 仓库 / 代码

推荐仓库：

```text
bangumi-user-topics
```

原因：`topics` 与 Bangumi/SearchEncore 领域模型更准确；`posts` 容易与回复/楼层混淆。

推荐模块/变量：

```text
UserTopic
groupTopics
subjectTopics
topicFeed
normalizeTopic
postsView
```

UI 可以使用自然中文“帖子”，内部保持精确 `topic` 术语。

---

# 24. 推荐实现顺序

### Phase 0 — 验证

- API 纯 user filter；
- username vs UID；
- CORS；
- Bangumi DOM selectors。

### Phase 1 — 最小导航 + 路由

- 插入“帖子”；
- `#posts*` parser；
- focus 保存/恢复；
- host view hide/restore；
- 暂用静态 placeholder。

### Phase 2 — 单类型 API

- SearchEncore adapter；
- group topics；
- subject topics；
- normalize；
- error/loading/empty。

### Phase 3 — 原生 UI

- `navSubTabs` 三分类；
- 日志式列表；
- topic link / metadata；
- 当前筛选 focus。

### Phase 4 — 合并与分页

- stream cache；
- all merge；
- 各 view page state；
- 上一页/下一页或原生 pager。

### Phase 5 — 兼容与交付

- reverse-friends 共存测试；
- 目录页原 sub tabs 恢复；
- 多 pathname 测试；
- build/check/delivery；
- README / CONTEXT / 必要 ADR。

---

# 25. 当前待决问题

以下问题不阻塞本文作为开发基线，但应在实现中明确答案：

1. SearchEncore 当前是否已经在线支持无关键词的 `q=user:<...>`；
2. 从 Bangumi 页面能否直接 CORS fetch；
3. 是否值得每次先把 username resolve 为 UID，还是直接 username 足够；
4. 当前 Bangumi `navSubTabs` / `focus` 的精确 DOM 结构；
5. 主体内容容器应隐藏哪个最小节点，才能不影响 sidebar/header；
6. 日志页有哪些 class 可直接用于 topic list item；
7. 页面默认 page size 最适合复用 Bangumi 哪个原生值；
8. SearchEncore `kind` 数字的正式含义是否需要用，或直接由 endpoint 注入 kind；推荐后者；
9. 同 timestamp 的稳定排序规则；
10. 三个域名 `bgm.tv / bangumi.tv / chii.in` 是否都在第一版支持，以及外部 API 请求/链接是否保持当前 host。

---

# 26. 关键参考资料

## SearchEncore

- Docs: https://bgmdb.ry.mk/v1/docs#
- OpenAPI: https://bgmdb.ry.mk/v1/openapi.json
- 组件讨论: https://bgm.tv/group/topic/444557

特别值得阅读讨论中的：

- #6 系列：抓取/同步原理讨论；
- #12 系列：用户名与改名同步；
- #13 系列：历史抓取曾有漏收案例；
- #28 / #29：timeout / API 故障反馈；
- #33：2026-09-27 提出的“纯 user filter 列出用户小组话题/条目讨论”需求。

## Bangumi 开发资料

- 开发文档仓库: https://github.com/bangumi/dev-docs
- 讨论贴文档: https://github.com/bangumi/dev-docs/blob/master/%E8%AE%A8%E8%AE%BA%E8%B4%B4.md
- 第三方组件开发资源整理: https://bgm.tv/group/topic/413138

## Bangumi 原生页面参考

- 用户日志示例: https://bgm.tv/user/sai/blog
- 用户目录示例: https://bgm.tv/user/842400/index

目录页用于研究二级导航；日志页用于研究列表视觉。

## 作者现有项目规范

- `bangumi-friend-sorter` AGENTS: https://github.com/imagebuilder1837/bangumi-friend-sorter/blob/main/AGENTS.md
- `bangumi-friend-sorter` module guide: https://github.com/imagebuilder1837/bangumi-friend-sorter/blob/main/docs/module-guide.md
- `bangumi-reverse-friends-nav` AGENTS: https://github.com/imagebuilder1837/bangumi-reverse-friends-nav/blob/main/AGENTS.md
- `bangumi-reverse-friends-nav` userscript: https://github.com/imagebuilder1837/bangumi-reverse-friends-nav/blob/main/src/index.user.js

---

# 27. 给 coding agent 的最短上下文

如果需要在新会话快速启动，可直接给 agent 以下任务描述，并附上本文：

> 实现 `Bangumi 用户帖子` userscript。它在 Bangumi 用户页一级导航的“日志”后插入“帖子”，通过当前 pathname + `#posts` / `#posts/group` / `#posts/subject` 提供客户端虚拟视图；数据来自 SearchEncore 的 `search/group-topics` 与 `search/subject-topics`，按 `user:<username|uid>` 查询。UI 必须优先复用 Bangumi 原站：一级 `navTabs`、目录页 `navSubTabs`、日志页列表视觉。宿主 DOM 只能隐藏/恢复，禁止 destructive replacement。需与现有 `bangumi-reverse-friends-nav` 等导航增强共存。先执行本文 Spike 0，确认纯 user filter、CORS 与实时 DOM，再编码。工程结构、metadata 治理、Conventional Commits、`npm run check`、single-context docs 等遵循本文第 15–19 节。

---

# 28. 设计原则总结

整个项目可以浓缩成六条：

1. **范围要窄**：帖子只指用户发起的 group topic + subject topic。
2. **数据要诚实**：SearchEncore 是第三方索引，不把结果宣传成绝对完整档案。
3. **看起来要原生**：目录负责“筛选怎么长”，日志负责“内容怎么长”。
4. **路由要轻**：当前 URL + `#posts*`，不制造服务器不存在的路径。
5. **DOM 要克制**：隐藏/插入/恢复，不破坏 Bangumi 和其他组件的节点。
6. **工程要可维护**：模块化维护源、统一 adapter、自动测试、生成单文件交付，并继承作者现有 Bangumi 项目规范。
