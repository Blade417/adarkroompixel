# 玩家反馈

标题页与设置提供「问题反馈」，无需账号。玩家主动提交时才发送问题类型、描述、复现步骤、选填联系方式，以及版本、场景、语言、浏览器、窗口和站点地址。默认不带存档，勾选「附上当前存档」后才调用导出并上传。没有埋点、自动错误上报或赞助入口。

两个站点统一提交到 `https://driftmsg.top/adarkroompixel/feedback/api`。页面刷新前保留未提交草稿；网络失败时保留内容和请求编号，重试使用相同编号防止重复创建。成功后显示反馈编号。此编号是回执，不开放匿名查询，防止公开联系方式及存档。当前不支持截图附件。

## 查看与处理

维护者打开 <https://driftmsg.top/adarkroompixel/feedback/manage/>，使用部署时生成的 `owner` 账号登录。密码单独保存在服务器保护目录及维护者本地凭据文件中，不在 Git、静态资源或发布包中。管理页支持按待处理／处理中／已解决筛选、修改状态、查看环境和下载自愿附带的存档，每页 30 条。时间按维护者浏览器时区显示。

管理数据请求使用 HTTPS Authorization，登录信息只留在页面内存；刷新后重新登录。提交者文本通过 `textContent` 渲染。公共 API 不提供列表、联系方式、存档或状态读取。管理写入同时检查身份和本站 Origin，跨站预检仅允许公开提交接口及指定来源。

## 服务器

- Python 3.10+ 标准库服务：`server/feedback.py`，无额外运行依赖。
- 服务代码：`/opt/adarkroompixel/feedback/releases/<commit>/`，`current` 指向当前代码。
- systemd：`adarkroompixel-feedback.service`，独立 `emberveil-feedback` 用户，只监听 `127.0.0.1:8766`。
- 配置：`/etc/adarkroompixel-feedback.env`，root 0600，保存口令的 PBKDF2-SHA256 摘要与盐、限流密钥、数据库路径和允许的来源。
- 数据：`/var/lib/adarkroompixel-feedback/inbox.db`，与静态版本目录独立，更新页面不清空反馈。
- Nginx：在原站点中增加精确前缀 `/adarkroompixel/feedback/`，反代到本机服务；请求体上限 180000 字节，覆盖 `X-Real-IP`，关闭该路由访问日志。
- 公开提交仅接受 JSON，描述 10–3000 字、步骤最多 2000 字、联系方式最多 200 字、存档最多 128000 字符。每 IP 每小时最多 8 条，错误登录每 IP 每 10 分钟最多 10 次；限流键用 HMAC 散列，不在反馈记录存储 IP。数据库达到 10000 条时停止接收，维护者应归档处理。

CORS 来源为 `https://driftmsg.top` 和 `https://blade417.github.io`。管理写入只允许 `https://driftmsg.top`。允许的来源不能替代身份认证，因此管理读写另行验证口令。前端开发可用 `VITE_FEEDBACK_ENDPOINT` 指向独立测试服务；正式服务不接受 localhost 来源。

```powershell
python -m unittest discover -s server -p 'test_*.py' -v
```

API 测试覆盖两个来源、预检、错误来源、匿名访问拒绝、身份验证与限流、状态修改与筛选、存档私密下载、格式／大小检查、提交限流及幂等重试。GitHub Actions 将游戏检查与这些接口测试作为发布前置条件。

## 运维

```sh
systemctl status adarkroompixel-feedback --no-pager
journalctl -u adarkroompixel-feedback --since today --no-pager
```

备份应使用 SQLite backup API 获得一致快照，再以受保护文件保存。不要将数据库、导出的联系方式、存档或管理员口令提交到仓库。回退静态游戏或反馈服务的 `current` 链接不会删除数据库；先停止写入服务再恢复数据库备份。
