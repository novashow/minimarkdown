const STORAGE_KEY = "mini-markdown-studio-state";
const THEME_KEY = "mini-markdown-studio-theme";

const starterDocs = [
  {
    id: crypto.randomUUID(),
    title: "欢迎来到 MiniMarkdown",
    content: `# 欢迎来到 MiniMarkdown

像 Typora 一样，这里把写作和阅读放在同一个空间里。

## 你可以做什么

- 在左侧切换文档与大纲
- 在中间专注输入 Markdown
- 在右侧获得排版后的阅读视图
- 通过顶部极简工具栏打开文件、切换布局与导出 HTML

## 当前原型

这一版先把界面收得更干净、更像桌面写作工具。

真正的“可编辑预览”会在正式客户端里通过更完整的富文本编辑内核来实现。
`,
    updatedAt: Date.now(),
  },
  {
    id: crypto.randomUUID(),
    title: "产品方向",
    content: `# 产品方向

## 关键词

- 本地优先
- 沉浸写作
- 多主题
- 多语言
- 跨平台

## 第一版建议

1. Markdown 文本编辑
2. 实时阅读预览
3. 文档树与大纲
4. 自动保存
5. 在线更新
`,
    updatedAt: Date.now() - 1000 * 60 * 36,
  },
];

const elements = {
  body: document.body,
  docList: document.getElementById("docList"),
  docSearchInput: document.getElementById("docSearchInput"),
  docTitleInput: document.getElementById("docTitleInput"),
  editor: document.getElementById("editor"),
  preview: document.getElementById("preview"),
  sidebarOutline: document.getElementById("sidebarOutline"),
  wordCount: document.getElementById("wordCount"),
  readTime: document.getElementById("readTime"),
  saveStatus: document.getElementById("saveStatus"),
  workspace: document.getElementById("workspace"),
  newDocBtn: document.getElementById("newDocBtn"),
  openFileBtn: document.getElementById("openFileBtn"),
  exportHtmlBtn: document.getElementById("exportHtmlBtn"),
  layoutBtn: document.getElementById("layoutBtn"),
  focusBtn: document.getElementById("focusBtn"),
  themeBtn: document.getElementById("themeBtn"),
  themeLabel: document.getElementById("themeLabel"),
  docItemTemplate: document.getElementById("docItemTemplate"),
  sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
  librarySectionTitle: document.getElementById("librarySectionTitle"),
};

const themeModes = ["light", "dark", "system"];
const themeLabels = {
  light: "亮色主题",
  dark: "暗色主题",
  system: "跟随系统",
};

const state = {
  docs: loadState(),
  activeDocId: null,
  searchQuery: "",
  layout: "split",
  focus: false,
  activeFileHandle: null,
  sidebarMode: "outline",
  themeMode: loadThemeMode(),
};

state.activeDocId = state.docs[0]?.id ?? null;
applyTheme(state.themeMode);
render();
bindEvents();

function bindEvents() {
  elements.docSearchInput.addEventListener("input", (event) => {
    state.searchQuery = event.target.value.trim().toLowerCase();
    if (state.sidebarMode === "docs") {
      renderDocList();
    }
  });

  elements.docTitleInput.addEventListener("input", (event) => {
    updateActiveDoc({ title: event.target.value || "未命名文档" });
  });

  elements.editor.addEventListener("input", (event) => {
    updateActiveDoc({ content: event.target.value, updatedAt: Date.now() }, false);
    renderDocumentSurface();
    setSaveStatus("本地实时保存");
  });

  elements.newDocBtn.addEventListener("click", () => {
    const doc = {
      id: crypto.randomUUID(),
      title: "未命名文档",
      content: "# 新文档\n\n从这里开始写作。",
      updatedAt: Date.now(),
    };
    state.docs.unshift(doc);
    state.activeDocId = doc.id;
    state.activeFileHandle = null;
    state.sidebarMode = "docs";
    persistState();
    render();
    elements.editor.focus();
  });

  elements.layoutBtn.addEventListener("click", () => {
    state.layout = state.layout === "split" ? "preview" : "split";
    syncWorkspaceMode();
  });

  elements.focusBtn.addEventListener("click", () => {
    state.focus = !state.focus;
    syncWorkspaceMode();
  });

  elements.themeBtn.addEventListener("click", () => {
    const currentIndex = themeModes.indexOf(state.themeMode);
    const nextMode = themeModes[(currentIndex + 1) % themeModes.length];
    applyTheme(nextMode);
  });

  elements.openFileBtn.addEventListener("click", openLocalFile);
  elements.exportHtmlBtn.addEventListener("click", exportHtml);
  elements.sidebarToggleBtn.addEventListener("click", () => {
    state.sidebarMode = state.sidebarMode === "docs" ? "outline" : "docs";
    syncSidebarMode();
  });

  elements.preview.addEventListener("click", (event) => {
    const anchor = event.target.closest("a");
    const href = anchor?.getAttribute("href");
    if (!href || !href.startsWith("#")) return;
    event.preventDefault();
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" });
  });

  document.addEventListener("keydown", (event) => {
    const isMeta = event.metaKey || event.ctrlKey;
    if (!isMeta) return;

    if (event.key.toLowerCase() === "o") {
      event.preventDefault();
      openLocalFile();
    }
  });

  if ("matchMedia" in window) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (state.themeMode === "system") {
        applyTheme("system");
      }
    });
  }
}

function render() {
  renderDocList();
  renderDocumentSurface();
  syncWorkspaceMode();
  syncSidebarMode();
}

function renderDocList() {
  const docs = getFilteredDocs();
  elements.docList.innerHTML = "";

  docs.forEach((doc) => {
    const node = elements.docItemTemplate.content.firstElementChild.cloneNode(true);
    node.classList.toggle("active", doc.id === state.activeDocId);
    node.querySelector(".doc-item-title").textContent = doc.title;
    node.querySelector(".doc-item-meta").textContent = formatDocMeta(doc);
    node.addEventListener("click", () => {
      state.activeDocId = doc.id;
      state.activeFileHandle = null;
      render();
    });
    elements.docList.appendChild(node);
  });
}

function renderDocumentSurface() {
  const activeDoc = getActiveDoc();
  if (!activeDoc) return;

  if (elements.docTitleInput.value !== activeDoc.title) {
    elements.docTitleInput.value = activeDoc.title;
  }

  if (elements.editor.value !== activeDoc.content) {
    elements.editor.value = activeDoc.content;
  }

  const rendered = renderMarkdown(activeDoc.content);
  elements.preview.innerHTML = rendered.html;
  renderOutline(rendered.headings);
  renderStats(activeDoc.content);
}

function renderOutline(headings) {
  elements.sidebarOutline.innerHTML = "";
  elements.librarySectionTitle.textContent = state.sidebarMode === "outline" ? `大纲 · ${headings.length}` : "文档";
  elements.sidebarToggleBtn.textContent = state.sidebarMode === "outline" ? "文档" : "大纲";

  headings.forEach((heading) => {
    const button = document.createElement("button");
    button.className = "outline-link";
    button.dataset.level = String(heading.level);
    button.textContent = heading.text;
    button.addEventListener("click", () => {
      document.getElementById(heading.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      markOutlineActive(button);
    });
    elements.sidebarOutline.appendChild(button);
  });
}

function markOutlineActive(activeButton) {
  [...elements.sidebarOutline.querySelectorAll(".outline-link")].forEach((button) => {
    button.classList.toggle("active", button === activeButton);
  });
}

function renderStats(content) {
  const cleanText = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_\-\[\]()|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const wordCount = cleanText ? cleanText.length : 0;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 300));
  elements.wordCount.textContent = `${wordCount} 字`;
  elements.readTime.textContent = `${readMinutes} 分钟阅读`;
}

function syncWorkspaceMode() {
  elements.workspace.classList.remove("split-layout", "preview-layout", "focus-mode");

  if (state.focus) {
    elements.workspace.classList.add("focus-mode");
    return;
  }

  elements.workspace.classList.add(state.layout === "split" ? "split-layout" : "preview-layout");
}

function syncSidebarMode() {
  const showOutline = state.sidebarMode === "outline";
  elements.docList.classList.toggle("hidden", showOutline);
  elements.sidebarOutline.classList.toggle("hidden", !showOutline);
  elements.librarySectionTitle.textContent = showOutline
    ? `大纲 · ${elements.sidebarOutline.childElementCount}`
    : "文档";
  elements.sidebarToggleBtn.textContent = showOutline ? "文档" : "大纲";
}

function updateActiveDoc(patch, rerender = true) {
  const activeDoc = getActiveDoc();
  if (!activeDoc) return;
  Object.assign(activeDoc, patch);
  activeDoc.updatedAt = patch.updatedAt ?? Date.now();
  persistState();

  if (rerender) {
    renderDocList();
    renderDocumentSurface();
  } else if (state.sidebarMode === "docs") {
    renderDocList();
  }
}

function getActiveDoc() {
  return state.docs.find((doc) => doc.id === state.activeDocId) ?? null;
}

function getFilteredDocs() {
  if (!state.searchQuery) return state.docs;
  return state.docs.filter((doc) => `${doc.title} ${doc.content}`.toLowerCase().includes(state.searchQuery));
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (stored?.docs?.length) {
      return stored.docs;
    }
  } catch (error) {
    console.warn("Failed to load state", error);
  }
  return starterDocs;
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ docs: state.docs }));
}

function setSaveStatus(text) {
  elements.saveStatus.textContent = text;
}

function formatDocMeta(doc) {
  const preview = doc.content.replace(/\s+/g, " ").slice(0, 28) || "空白文档";
  const time = new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(doc.updatedAt);
  return `${time} · ${preview}`;
}

function loadThemeMode() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function applyTheme(mode) {
  state.themeMode = mode;
  const resolved = resolveTheme(mode);
  elements.body.dataset.theme = resolved;
  elements.themeLabel.textContent = themeLabels[mode];
  elements.themeBtn.textContent = mode === "light" ? "T" : mode === "dark" ? "D" : "S";
  localStorage.setItem(THEME_KEY, mode);
}

function resolveTheme(mode) {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

async function openLocalFile() {
  try {
    if ("showOpenFilePicker" in window) {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "Markdown Files", accept: { "text/markdown": [".md", ".markdown", ".txt"] } }],
      });
      if (!handle) return;
      const file = await handle.getFile();
      const content = await file.text();
      const newDoc = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
        content,
        updatedAt: Date.now(),
      };
      state.docs.unshift(newDoc);
      state.activeDocId = newDoc.id;
      state.activeFileHandle = handle;
      persistState();
      render();
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const content = await file.text();
      const newDoc = {
        id: crypto.randomUUID(),
        title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
        content,
        updatedAt: Date.now(),
      };
      state.docs.unshift(newDoc);
      state.activeDocId = newDoc.id;
      persistState();
      render();
    };
    input.click();
  } catch (error) {
    console.warn("Open file canceled", error);
  }
}

function exportHtml() {
  const activeDoc = getActiveDoc();
  if (!activeDoc) return;

  const { html } = renderMarkdown(activeDoc.content);
  const output = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(activeDoc.title)}</title>
  <style>
    body { max-width: 860px; margin: 48px auto; padding: 0 24px 96px; font: 18px/1.9 Georgia, "Noto Serif SC", serif; color: #24170e; }
    pre, code { font-family: Menlo, monospace; }
    pre { background: #f4eee4; padding: 16px 18px; border-radius: 16px; overflow: auto; }
    blockquote { margin: 16px 0; padding: 8px 18px; border-left: 3px solid #b45c34; background: #fff6ef; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #dbc9b6; padding: 10px 12px; text-align: left; }
    img { max-width: 100%; border-radius: 14px; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;

  downloadFile(`${activeDoc.title || "untitled"}.html`, output, "text/html");
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderMarkdown(markdown) {
  const headings = [];
  const codeBlocks = [];
  const normalized = markdown.replace(/\r\n/g, "\n");

  let text = normalized.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.push({
      language,
      code: escapeHtml(code.trimEnd()),
    }) - 1;
    return `@@CODEBLOCK_${index}@@`;
  });

  const lines = text.split("\n");
  const htmlParts = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed.startsWith("@@CODEBLOCK_")) {
      htmlParts.push(renderCodePlaceholder(trimmed, codeBlocks));
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      const level = trimmed.match(/^#+/)[0].length;
      const rawText = trimmed.replace(/^#{1,6}\s/, "");
      const textContent = rawText.replace(/[*_`~[\]]/g, "");
      const id = slugify(textContent, headings.length);
      headings.push({ level, text: textContent, id });
      htmlParts.push(`<h${level} id="${id}">${renderInline(rawText)}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      htmlParts.push("<hr />");
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [trimmed.replace(/^>\s?/, "")];
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1].trim())) {
        index += 1;
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
      }
      htmlParts.push(`<blockquote>${quoteLines.map((item) => `<p>${renderInline(item)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, index)) {
      const headerCells = splitTableRow(lines[index]);
      const bodyRows = [];
      index += 2;

      while (index < lines.length && /\|/.test(lines[index])) {
        bodyRows.push(splitTableRow(lines[index]));
        index += 1;
      }
      index -= 1;

      htmlParts.push(`
        <table>
          <thead>
            <tr>${headerCells.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      `);
      continue;
    }

    if (/^(\-|\*|\+)\s+/.test(trimmed)) {
      const items = [trimmed.replace(/^(\-|\*|\+)\s+/, "")];
      while (index + 1 < lines.length && /^(\-|\*|\+)\s+/.test(lines[index + 1].trim())) {
        index += 1;
        items.push(lines[index].trim().replace(/^(\-|\*|\+)\s+/, ""));
      }
      htmlParts.push(`<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [trimmed.replace(/^\d+\.\s+/, "")];
      while (index + 1 < lines.length && /^\d+\.\s+/.test(lines[index + 1].trim())) {
        index += 1;
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
      }
      htmlParts.push(`<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [trimmed];
    while (index + 1 < lines.length && lines[index + 1].trim()) {
      const nextLine = lines[index + 1].trim();
      if (
        /^#{1,6}\s/.test(nextLine) ||
        /^>\s?/.test(nextLine) ||
        /^(\-|\*|\+)\s+/.test(nextLine) ||
        /^\d+\.\s+/.test(nextLine) ||
        /^(-{3,}|\*{3,})$/.test(nextLine) ||
        nextLine.startsWith("@@CODEBLOCK_") ||
        isTableStart(lines, index + 1)
      ) {
        break;
      }
      index += 1;
      paragraph.push(nextLine);
    }
    htmlParts.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return { html: htmlParts.join("\n"), headings };
}

function renderCodePlaceholder(line, codeBlocks) {
  const index = Number(line.match(/@@CODEBLOCK_(\d+)@@/)?.[1] || -1);
  const block = codeBlocks[index];
  if (!block) return "";
  return `<pre><code>${block.code}</code></pre>`;
}

function renderInline(source) {
  let html = escapeHtml(source);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  return html;
}

function splitTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableStart(lines, index) {
  const current = lines[index]?.trim();
  const next = lines[index + 1]?.trim();
  return Boolean(current && next && /\|/.test(current) && /^[:\-|\s]+$/.test(next) && next.includes("-"));
}

function slugify(text, seed) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40) || `section-${seed + 1}`
  );
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
