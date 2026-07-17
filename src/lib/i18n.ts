import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  "zh-CN": {
    translation: {
      common: {
        loading: "正在准备你的本地写作空间...",
        loadFailed: "本地文档库初始化失败",
        retry: "重新加载",
        editorLoading: "正在载入可编辑预览...",
      },
      title: {
        kicker: "写作",
        subtitle: "安静地写，清晰地读。",
      },
      actions: {
        open: "打开文件",
        toggleLayout: "布局",
        focus: "专注",
        theme: "主题",
        language: "语言",
        exportHtml: "导出 HTML",
      },
      metrics: {
        saving: "保存中",
        saved: "已保存",
        localReady: "本地已就绪",
        characters: "字数",
        readMinutes: "分钟阅读",
      },
      sidebar: {
        workspace: "文稿",
        search: "搜索文稿...",
        outline: "大纲",
        documents: "文稿",
        localMode: "自动保存",
        localModeValue: "实时保存在本机",
        localModeSqlite: "本地文稿库",
        localModeFallback: "本机回退模式",
      },
      editor: {
        placeholder: "在这里开始写作",
        markdownTitle: "Markdown",
        markdownHint: "源文件",
        previewTitle: "预览",
        wysiwygTitle: "所见即所得",
        wysiwygHint: "边写边读",
        sourceMode: "源码编辑",
        splitMode: "对照编辑",
        liveMode: "即时编辑",
        sourceModeShort: "源码",
        splitModeShort: "对照",
        liveModeShort: "即时",
        readingModeShort: "阅读",
        readingMode: "阅读模式",
        chooseMode: "选择编辑方式",
        backToEditing: "返回编辑",
      },
      documents: {
        untitled: "未命名文档",
        rename: "重命名",
        delete: "删除文档",
        createFirst: "新建第一篇文档",
        noDocuments: "这里还没有文档",
        noSearchResults: "没有找到匹配的文档",
        noOutline: "当前文档还没有标题结构",
        noOutlineHint: "写下一个 # 一级标题，大纲就会出现在这里。",
        noSearchHint: "换个关键词，或者新建一篇文档继续写。",
        noDocumentsHint: "从一篇新文档开始，或者打开已有的 Markdown 文件。",
        deleteConfirm: "确认删除《{{title}}》吗？这个操作不会自动恢复。",
      },
      updates: {
        idle: "本地版暂未启用在线更新",
      },
      theme: {
        light: "亮色主题",
        dark: "暗色主题",
        system: "跟随系统",
      },
    },
  },
  en: {
    translation: {
      common: {
        loading: "Preparing your local writing space...",
        loadFailed: "Failed to initialize local document storage",
        retry: "Retry",
        editorLoading: "Loading editable preview...",
      },
      title: {
        kicker: "Writing",
        subtitle: "Write quietly. Read clearly.",
      },
      actions: {
        open: "Open file",
        toggleLayout: "Layout",
        focus: "Focus",
        theme: "Theme",
        language: "Language",
        exportHtml: "Export HTML",
      },
      metrics: {
        saving: "Saving",
        saved: "Saved",
        localReady: "Local ready",
        characters: "words",
        readMinutes: "min read",
      },
      sidebar: {
        workspace: "Documents",
        search: "Search documents...",
        outline: "Outline",
        documents: "Documents",
        localMode: "Auto-save",
        localModeValue: "Saved locally in real time",
        localModeSqlite: "Local library",
        localModeFallback: "Local fallback mode",
      },
      editor: {
        placeholder: "Start writing here",
        markdownTitle: "Markdown",
        markdownHint: "Source",
        previewTitle: "Preview",
        wysiwygTitle: "WYSIWYG",
        wysiwygHint: "Write and read in one flow",
        sourceMode: "Source editing",
        splitMode: "Split editing",
        liveMode: "Live editing",
        sourceModeShort: "Source",
        splitModeShort: "Split",
        liveModeShort: "Live",
        readingModeShort: "Read",
        readingMode: "Reading mode",
        chooseMode: "Choose editing mode",
        backToEditing: "Back to editing",
      },
      documents: {
        untitled: "Untitled document",
        rename: "Rename",
        delete: "Delete document",
        createFirst: "Create your first document",
        noDocuments: "No documents yet",
        noSearchResults: "No documents matched your search",
        noOutline: "This document does not have headings yet",
        noOutlineHint: "Write a # heading and your outline will appear here.",
        noSearchHint: "Try a different keyword or create a new document.",
        noDocumentsHint: "Start with a fresh note or open an existing Markdown file.",
        deleteConfirm: 'Delete "{{title}}"? This action cannot be undone automatically.',
      },
      updates: {
        idle: "Online update is reserved but disabled in this local build",
      },
      theme: {
        light: "Light theme",
        dark: "Dark theme",
        system: "Follow system",
      },
    },
  },
} as const;

const LOCALE_PREF_KEY = "minimarkdown-locale-pref";
const storedPref = localStorage.getItem(LOCALE_PREF_KEY);
const initialLng: string =
  storedPref === "zh-CN" || storedPref === "en"
    ? storedPref
    : navigator.language.startsWith("zh") ? "zh-CN" : "en";

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
});

export default i18n;
