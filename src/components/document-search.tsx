import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown, ChevronUp, Replace, X } from "lucide-react";
import type { EditorView } from "@codemirror/view";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * In-document find / replace bar (controlled).
 *
 * The query, the current index and the match list are owned by App so the source
 * pane can paint a highlight backdrop over every match. This bar drives them and
 * scrolls the current match into view; the visual highlight is the backdrop's job.
 */
export function DocumentSearch({
  query,
  onQueryChange,
  current,
  onCurrentChange,
  matches,
  viewRef,
  onClose,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  current: number;
  onCurrentChange: (next: number) => void;
  matches: number[];
  viewRef: RefObject<EditorView | null>;
  onClose: () => void;
}) {
  const [replaceText, setReplaceText] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Clamp the active index to the current result set (derived, not stored).
  const safeCurrent = matches.length ? Math.min(current, matches.length - 1) : 0;

  // Auto-focus the find input when the bar opens.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, []);

  const go = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    onCurrentChange((safeCurrent + dir + matches.length) % matches.length);
  };

  const replaceCurrent = () => {
    if (matches.length === 0 || !query) return;
    const view = viewRef.current;
    if (!view) return;
    const start = matches[safeCurrent];
    const end = start + query.length;
    view.dispatch({ changes: { from: start, to: end, insert: replaceText } });
  };

  const replaceAll = () => {
    if (!query) return;
    const view = viewRef.current;
    if (!view) return;
    const markdown = view.state.doc.toString();
    const re = new RegExp(escapeRegExp(query), "gi");
    const changes = Array.from(markdown.matchAll(re), (match) => ({
      from: match.index,
      to: match.index + match[0].length,
      insert: replaceText,
    }));
    if (changes.length) view.dispatch({ changes });
  };

  const counter = query ? (matches.length ? `${safeCurrent + 1}/${matches.length}` : "0/0") : "";

  return (
    <div
      data-tauri-drag-region="false"
      className="w-[340px] rounded-lg border border-border/55 bg-card/95 px-2 py-1.5 shadow-lg backdrop-blur-xl"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {/* Find row */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          title={showReplace ? "隐藏替换" : "显示替换"}
          onClick={() => setShowReplace((v) => !v)}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition"
        >
          <Replace className="size-3.5" />
        </button>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              go(e.shiftKey ? -1 : 1);
            }
          }}
          placeholder="在文档中查找"
          className="h-6 min-w-0 flex-1 rounded border border-border/50 bg-background/60 px-2 text-[11px] outline-none transition focus:border-ring"
        />
        <span className="shrink-0 px-1 text-[10px] tabular-nums text-muted-foreground/70">
          {counter}
        </span>
        <button
          type="button"
          title="上一个 (Shift+Enter)"
          onClick={() => go(-1)}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition disabled:opacity-30"
          disabled={matches.length === 0}
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          title="下一个 (Enter)"
          onClick={() => go(1)}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition disabled:opacity-30"
          disabled={matches.length === 0}
        >
          <ChevronDown className="size-3.5" />
        </button>
        <button
          type="button"
          title="关闭 (Esc)"
          onClick={onClose}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent/50 hover:text-foreground transition"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="inline-flex size-5 shrink-0" />
          <input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="替换为"
            className="h-6 min-w-0 flex-1 rounded border border-border/50 bg-background/60 px-2 text-[11px] outline-none transition focus:border-ring"
          />
          <button
            type="button"
            onClick={replaceCurrent}
            disabled={matches.length === 0}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition disabled:opacity-30"
          >
            替换
          </button>
          <button
            type="button"
            onClick={replaceAll}
            disabled={matches.length === 0}
            className="shrink-0 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition disabled:opacity-30"
          >
            全部
          </button>
        </div>
      )}
    </div>
  );
}

export default DocumentSearch;
