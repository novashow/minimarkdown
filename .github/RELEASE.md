# GitHub 发布与应用内更新

## 首次配置

1. 将本项目上传到 GitHub 仓库。
2. 打开仓库的 `Settings → Secrets and variables → Actions`。
3. 新建名为 `TAURI_SIGNING_PRIVATE_KEY` 的仓库密钥，内容取自本机 `.tauri-signing/minimarkdown.key`。
4. 私钥只用于发布签名，不要上传、分享或删除；丢失后，已安装的应用将无法继续升级。

## 发布新版

进入 GitHub 仓库的 `Actions → 发布 MiniMarkdown → Run workflow`，输入新版本号，例如 `0.2.0`。

流程会自动完成：

- 生成 macOS Apple 芯片版与独立的 Intel 版；
- 生成 Windows 64 位版与 Windows 32 位版；
- 先创建不公开的 GitHub Release，四个平台全部通过后再公开；
- 生成四个平台应用内更新所需的 `latest.json` 与签名安装包；
- 已安装用户启动应用后会自动检查并后台下载；下载完成后可选择立即重启，或安排在下次启动时自动完成更新。
- 左下角仍保留“检查更新”，可随时手动检查。

## 当前限制

正式面向外部用户发布前，建议再配置 Apple 开发者签名与公证，以及 Windows 代码签名。GitHub 安全更新功能不依赖这些签名，但未签名或未公证的应用首次打开时可能被系统提示风险。
