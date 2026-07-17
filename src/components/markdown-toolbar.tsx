import { type RefObject } from "react";
import type { EditorView } from "@codemirror/view";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

type ToolItem = {
  icon: LucideIcon;
  title: string;
  action: () => void;
  isActive?: () => boolean;
};

function ToolbarBtn({ icon: Icon, title, action, isActive }: ToolItem) {
  return (
    <button
      data-tauri-drag-region="false"
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // keep the editor focused
        action();
      }}
      className={cn(
        "inline-flex items-center justify-center h-6 w-6 rounded transition-colors",
        "text-muted-foreground hover:text-foreground hover:bg-accent/60",
        isActive?.() && "bg-accent/80 text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function Sep() {
  return <span className="mx-1 inline-block h-4 w-px self-center bg-border/55 shrink-0" />;
}

function ToolbarRow({ items }: { items: (ToolItem | "sep")[] }) {
  return (
    // Rendered inline inside the unified top bar (App header) — no row chrome of its own.
    // Buttons opt out of dragging individually; the bar's spacer handles window dragging.
    <div className="flex items-center gap-0.5 shrink-0">
      {items.map((item, i) =>
        item === "sep" ? <Sep key={i} /> : <ToolbarBtn key={item.title} {...item} />,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown source toolbar
// ---------------------------------------------------------------------------

export function MarkdownSourceToolbar({
  viewRef,
}: {
  viewRef: RefObject<EditorView | null>;
}) {
  const wrapText = (wrap: string) => {
    const view = viewRef.current;
    if (!view) return;
    const { from: s, to: e } = view.state.selection.main;
    const selected = view.state.sliceDoc(s, e);
    const wrappedOutside = s >= wrap.length
      && e + wrap.length <= view.state.doc.length
      && view.state.sliceDoc(s - wrap.length, s) === wrap
      && view.state.sliceDoc(e, e + wrap.length) === wrap;
    if (wrappedOutside) {
      view.dispatch({
        changes: [
          { from: s - wrap.length, to: s, insert: "" },
          { from: e, to: e + wrap.length, insert: "" },
        ],
        selection: { anchor: s - wrap.length, head: e - wrap.length },
      });
      view.focus();
      return;
    }
    if (selected.startsWith(wrap) && selected.endsWith(wrap) && selected.length >= wrap.length * 2) {
      const unwrapped = selected.slice(wrap.length, -wrap.length);
      view.dispatch({
        changes: { from: s, to: e, insert: unwrapped },
        selection: { anchor: s, head: s + unwrapped.length },
      });
      view.focus();
      return;
    }
    const insertion = `${wrap}${selected || "文字"}${wrap}`;
    view.dispatch({
      changes: { from: s, to: e, insert: insertion },
      selection: { anchor: s + wrap.length, head: s + wrap.length + (selected || "文字").length },
    });
    view.focus();
  };

  const prefixLine = (prefix: string) => {
    const view = viewRef.current;
    if (!view) return;
    const s = view.state.selection.main.from;
    const line = view.state.doc.lineAt(s);
    const removing = line.text.startsWith(prefix);
    const delta = removing ? -prefix.length : prefix.length;
    view.dispatch({
      changes: removing
        ? { from: line.from, to: line.from + prefix.length, insert: "" }
        : { from: line.from, insert: prefix },
      selection: { anchor: Math.max(line.from, s + delta) },
    });
    view.focus();
  };

  const insertCodeBlock = () => {
    const view = viewRef.current;
    if (!view) return;
    const { from: s, to: e } = view.state.selection.main;
    const selected = view.state.sliceDoc(s, e);
    const block = "```\n" + (selected || "代码") + "\n```";
    view.dispatch({
      changes: { from: s, to: e, insert: block },
      selection: { anchor: s + 4, head: s + 4 + (selected || "代码").length },
    });
    view.focus();
  };

  const insertHr = () => {
    const view = viewRef.current;
    if (!view) return;
    const s = view.state.selection.main.from;
    const insert = "\n\n---\n\n";
    view.dispatch({
      changes: { from: s, insert },
      selection: { anchor: s + insert.length },
    });
    view.focus();
  };

  const items: (ToolItem | "sep")[] = [
    { icon: Bold, title: "加粗", action: () => wrapText("**") },
    { icon: Italic, title: "斜体", action: () => wrapText("*") },
    { icon: Strikethrough, title: "删除线", action: () => wrapText("~~") },
    "sep",
    { icon: Heading1, title: "一级标题", action: () => prefixLine("# ") },
    { icon: Heading2, title: "二级标题", action: () => prefixLine("## ") },
    { icon: Heading3, title: "三级标题", action: () => prefixLine("### ") },
    "sep",
    { icon: List, title: "无序列表", action: () => prefixLine("- ") },
    { icon: ListOrdered, title: "有序列表", action: () => prefixLine("1. ") },
    { icon: Quote, title: "引用块", action: () => prefixLine("> ") },
    "sep",
    { icon: Code, title: "行内代码", action: () => wrapText("`") },
    { icon: Terminal, title: "代码块", action: insertCodeBlock },
    { icon: Minus, title: "分割线", action: insertHr },
  ];

  return <ToolbarRow items={items} />;
}
