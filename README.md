# Bangumi 用户帖子（开发态）

在支持的用户页一级导航中点击“帖子”，可浏览该用户发起的全部帖子、小组话题或条目讨论，并按创建时间翻页。支持 HTTPS 的 bgm.tv、bangumi.tv、chii.in 上已观察结构的用户主页、日志、目录、好友、五类收藏概览及具体收藏状态；结构不明的页面不会接管。

数据来自第三方 [SearchEncore](https://bgmdb.ry.mk) 镜像索引；仅进入帖子视图时查询。没有找到已收录的帖子不表示用户从未发帖，动态索引也不能保证历史完整。

`npm install && npm run build && npm run check` 生成并检查 `src/index.user.js`。目前没有经过逐字段批准的 userscript metadata，**此文件仍是不可安装的开发态 bundle**；版本字段也未获批准，不会擅改。登录态、组件共存、跨域实际安装及响应式视觉验收尚待真实浏览器验证，自动化 DOM 测试不代替该验收。
