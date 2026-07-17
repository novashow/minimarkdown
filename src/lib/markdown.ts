import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
// Use the "common" subset (~40 languages, ~300 KB) instead of the full 5 MB build.
import hljs from "highlight.js/lib/common";

// ── Renderer (created once, reused on every parse) ────────────────────────
const renderer = new marked.Renderer();
renderer.heading = ({ tokens, depth }) => {
  const text = tokens.map((t) => ("text" in t ? t.text : "")).join("");
  return `<h${depth} id="${slugify(text, depth)}">${text}</h${depth}>`;
};

// ── Syntax highlighting (synchronous, uses the common hljs bundle) ────────
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code: string, lang: string) {
      try {
        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        return hljs.highlight(code, { language }).value;
      } catch {
        return code;
      }
    },
  }),
);

// ── KaTeX: loaded lazily on first document that contains math ─────────────
let katexReady = false;

export async function ensureKatex(): Promise<void> {
  if (katexReady) return;
  try {
    const [markedKatex] = await Promise.all([
      import("marked-katex-extension"),
      // Inject the KaTeX stylesheet dynamically so it doesn't block initial load
      new Promise<void>((resolve) => {
        if (document.querySelector('link[data-katex]')) { resolve(); return; }
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.dataset.katex = "1";
        link.href = "/node_modules/katex/dist/katex.min.css";
        link.onload = () => resolve();
        link.onerror = () => resolve(); // non-fatal
        document.head.appendChild(link);
      }),
    ]);
    marked.use(markedKatex.default({ throwOnError: false, nonStandard: true }));
    katexReady = true;
  } catch (e) {
    console.error("KaTeX failed to load", e);
  }
}

/** Returns true when the markdown string likely contains inline or display math. */
export function hasMath(markdown: string): boolean {
  return /\$/.test(markdown);
}

// ── Public API ────────────────────────────────────────────────────────────

export type OutlineHeading = {
  id: string;
  level: number;
  text: string;
};

export function extractHeadings(markdown: string): OutlineHeading[] {
  const lines = markdown.split("\n");
  const result: OutlineHeading[] = [];
  let inFence = false;
  let index = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (/^(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;

    if (/^#{1,6}\s/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1;
      const text = line.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "");
      result.push({ id: slugify(text, index), level, text });
      index += 1;
      continue;
    }

    const next = lines[i + 1]?.trim();
    if (line && next) {
      if (/^=+$/.test(next)) {
        result.push({ id: slugify(line, index), level: 1, text: line });
        index += 1; i += 1; continue;
      }
      if (/^-+$/.test(next) && !/^[-*>|]/.test(line)) {
        result.push({ id: slugify(line, index), level: 2, text: line });
        index += 1; i += 1;
      }
    }
  }
  return result;
}

export function getBlockStartLines(markdown: string): number[] {
  try {
    const tokens = marked.lexer(markdown);
    const result: number[] = [];
    let line = 0;
    for (const token of tokens) {
      const startLine = line;
      line += ((token.raw || "").match(/\n/g) || []).length;
      if (token.type === "space" || token.type === "def") continue;
      result.push(startLine);
    }
    return result;
  } catch { return []; }
}

export function slugify(text: string, index: number) {
  return (
    text.toLowerCase().trim()
      .replace(/[^\w一-龥\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 48)
    || `section-${index + 1}`
  );
}

export function previewText(markdown: string) {
  return markdown.replace(/\s+/g, " ").slice(0, 40) || "Blank";
}

export function fileStem(title: string) {
  return title.trim().replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, "-").toLowerCase();
}

export function markdownToHtml(markdown: string) {
  return marked.parse(markdown, { breaks: true, gfm: true, renderer }) as string;
}

export function buildExportHtml(title: string, previewHtml: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { max-width: 860px; margin: 48px auto; padding: 0 24px 96px; font: 18px/1.9 Georgia, "Songti SC", serif; color: #24170e; }
    pre, code { font-family: Menlo, monospace; }
    pre { background: #f4eee4; padding: 16px 18px; border-radius: 16px; overflow: auto; }
    blockquote { margin: 16px 0; padding: 8px 18px; border-left: 3px solid #b45c34; background: #fff6ef; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #dbc9b6; padding: 10px 12px; text-align: left; }
    img { max-width: 100%; border-radius: 14px; }
  </style>
</head>
<body>
  ${previewHtml}
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
