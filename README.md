# MiniMarkdown

一个本地优先的 Markdown 桌面写作应用。

## 当前能力

- 三种编辑方式：源码、对照、即时
- 独立阅读模式；退出后返回之前的编辑方式
- Markdown 语法高亮、查找替换、工具栏与撤销重做
- 对照模式双向滚动同步
- 即时编辑支持标题、行内格式、链接、图片、公式、列表、任务项、引用和分隔线
- 本地文稿库、自动保存、外部文件打开与系统文件关联
- 未保存文稿恢复；异常退出或重新启动后可继续编辑
- GitHub 安全更新；启动后自动检查并后台下载，可立即重启或下次启动生效
- 亮色、暗色、跟随系统；中文、英文
- HTML 导出

## 技术组成

- Tauri 2
- React、TypeScript、Vite
- CodeMirror 6
- 本地文件系统存储

## 运行

首次安装：

```bash
pnpm install
```

桌面开发：

```bash
pnpm dev:desktop
```

也可以双击仓库里的 `start-dev.command`。

仅启动浏览器界面：

```bash
pnpm dev
```

## 构建

前端检查：

```bash
pnpm lint
pnpm build
```

生成可直接运行的 macOS 桌面应用：

```bash
pnpm build:desktop
```

## 目录

- `src/`：应用界面与编辑器
- `src-tauri/`：macOS、Windows、Linux 桌面外壳和权限
- `legacy-prototype/`：早期静态原型备份

GitHub 首次配置和后续发布方式见 [`.github/RELEASE.md`](.github/RELEASE.md)。
