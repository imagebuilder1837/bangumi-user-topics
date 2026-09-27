# Bangumi 用户帖子（开发态）

目前仅在三个 Bangumi HTTPS 域名的用户**日志**页提供小组话题阅读与翻页（`#posts/group`）；其它分类及宿主页尚未交付。数据由第三方 [SearchEncore](https://bgmdb.ry.mk) 镜像索引提供，空结果不表示用户从未发帖，结果也不保证完整。

`npm install && npm run build && npm run check` 生成并检查 `src/index.user.js`。该文件当前**没有 userscript metadata，不是可安装发布版**；metadata 与版本字段须另行逐字段批准。真正浏览器中的布局、脚本运行和三个域名的成品验收仍待执行；jsdom 测试不代替视觉验收。
