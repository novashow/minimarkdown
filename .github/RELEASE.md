# GitHub 发布与应用内更新

## 首次配置

1. 将本项目上传到 GitHub 仓库。
2. 打开仓库的 `Settings → Secrets and variables → Actions`。
3. 新建名为 `TAURI_SIGNING_PRIVATE_KEY` 的仓库密钥，内容取自本机 `.tauri-signing/minimarkdown.key`。
4. 私钥只用于发布签名，不要上传、分享或删除；丢失后，已安装的应用将无法继续升级。

## 发布新版

进入 GitHub 仓库的 `Actions → 发布 MiniMarkdown → Run workflow`，输入新版本号，例如 `0.2.0`。

流程会自动完成：

- 生成同时支持 Apple 芯片与 Intel 芯片的 macOS 应用；
- 创建 GitHub Release；
- 生成应用内更新所需的 `latest.json` 与签名安装包；
- 已安装用户可点击应用左下角“检查更新”完成升级。

## 当前限制

正式面向外部用户发布前，建议再配置 Apple 开发者签名与公证。GitHub 安全更新功能不依赖这一项，但未公证应用首次打开时可能被 macOS 提示风险。
