# 壁纸运营后台

微信原创壁纸小程序的 PC 管理后台 无需构建 纯静态页面加一个云函数

- 前端 `docs/` 静态页面 Lucide 图标 CloudBase Web SDK 可直接部署到 GitHub Pages 或 CloudBase 静态托管
- 云函数 `cloudfunctions/adminApi/` 管理员校验 数据读写 上传凭证 榜单聚合 操作日志 管理员与权限 各列表 CSV 导出
- 环境 ID 在 `docs/config.js` 已填写为 `wallpaper-d6g8yxppw79bc480a`

## 上线步骤

1. 部署云函数 在 CloudBase 控制台新建函数 `adminApi` Node.js 18 以上 上传 `cloudfunctions/adminApi` 并安装依赖 也可用 CloudBase CLI 部署 然后在函数配置里添加环境变量 `BOOTSTRAP_KEY` 填一段随机字符串
2. 身份认证 控制台开启 用户名密码登录 关闭匿名登录和自助注册 手动创建一个管理员账号
3. 安全域名 在环境的安全配置里把后台访问域名 例如 `https://你的用户名.github.io` 和 `http://localhost:8080` 加入 WEB 安全域名 并为云存储配置跨域 允许 POST 否则批量上传会被浏览器拦截
4. 打开后台 用管理员账号登录 页面会提示初始化 输入 `BOOTSTRAP_KEY` 即创建全部集合 写入 PRD 中的默认分类 并把当前账号设为超级管理员
5. 数据库权限 除 `wallpapers` `categories` 允许用户端读取已发布内容外 其余集合建议仅云函数可写 后台所有写操作都走 `adminApi` 云存储对外只读
6. GitHub 推送到 `main` 在仓库 Settings 的 Pages 里选择 Deploy from a branch 分支 main 目录 /docs 保存后等一到两分钟

本地预览 `cd docs && python3 -m http.server 8080`

## 与小程序端的数据约定

后台读取这些字段 小程序和云函数需按此写入
- `wallpapers` 含 `status` `publishedAt` `thumbnailFileId` `originalFileId` `downloadCount` `favoriteCount` `sha256`
- `wallpaper_stats_daily` 含 `wallpaperId` `date` 格式 YYYY-MM-DD 东八区 `downloadCount` `favoriteAddCount` `viewCount` 由下载成功云函数幂等累加
- `feedback` 与 `copyright_reports` 含 `type` `wallpaperId` `content` `status` 初始为 `pending` `createdAt`
- `users` 含 `memberLevel` `memberExpireAt` `status` `lastActiveAt`
- `download_policies` 后台每次保存新增一条 `version` 递增 小程序端读取 `version` 最大且 `effectiveAt` 已到的一条

## 已实现

仪表盘 单张壁纸下载收藏趋势 壁纸管理 批量上传工作台 分类标签 榜单 广告策略 用户会员 反馈 版权投诉 操作日志

批量上传 格式大小分辨率检查 SHA-256 去重 缩略图自动生成 单文件进度和总进度 暂停继续 失败重试 CSV 导入 先传文件再建记录 重试时复用已传文件
