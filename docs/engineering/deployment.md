# 静态站点发布

发布地址：

- 自有服务器：<https://driftmsg.top/adarkroompixel/>
- GitHub Pages：<https://blade417.github.io/adarkroompixel/>

2026-10-20，用户要求发布当前版本，不再以补齐完整通关验收作为上线前置条件。此决定不代表补齐了音频、长时间运行等检查；当前验证范围见[完成情况记录](status-2026-10-20.md)。

## GitHub Pages

仓库 Settings → Pages → Source 选择 GitHub Actions。`.github/workflows/pages.yml` 在 `main` 推送或手动触发后，使用 Node.js 22 执行 `npm ci`、`npm run check`、`npm run build`，通过官方 Pages artifact/deploy actions 发布 `dist/`。检查失败不会进入部署任务。

保持 Vite 的相对 `base: './'`，同一份产物可从两个站点的 `/adarkroompixel/` 子路径运行。只上传 `dist/`，不上传测试档、工程文档或服务器凭据。构建生成的 `release.json` 包含包名、版本及源码 HEAD；同一提交的两个站点应返回一致的提交号。

## 自有服务器

服务器凭据保留在本地既有配置中，不写入源码、GitHub Secrets、工作流或发布包。服务器路径：

- 版本目录：`/var/www/adarkroompixel/releases/<release-id>`
- 当前版本：`/var/www/adarkroompixel/current`
- 上传包与部署备份：`/opt/adarkroompixel/`
- Nginx 站点：`/etc/nginx/sites-enabled/driftbottle`

发布前完成测试和构建，将 `dist/` 打包并保存文件 SHA-256 清单。上传后核对压缩包 SHA-256，解包到新的专属版本目录，逐文件核对内容散列，再原子切换 `current`。旧目录保留，可将 `current` 原子切回已知旧版本。Nginx 现有路由须核对；需要调整时先备份配置并执行 `nginx -t`，通过后 reload。

HTML 与 `release.json` 应重新验证缓存；带内容散列的静态资源可长缓存。更新时保留旧散列资源，避免已经打开的旧标签页延迟加载时找不到资源。

完成条件是两个 HTTPS 站点返回对应源码提交，主要静态资源可获取且与构建匹配，并在浏览器中检查启动、基本交互及控制台。单有上传完成或 Actions 任务启动不算上线成功。

## 存档

存档键仍为 `emberveil.pixel.save`，设备偏好键仍为 `emberveil.pixel.prefs`；本轮不更改存档格式。同一服务器来源的玩家存档在更新后继续使用。GitHub Pages 与自有服务器的浏览器来源不同，存档不会自动同步；通过可见设置导出、导入存档码进行迁移。
