import { useEffect, useRef, type RefObject } from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Transaction, type Extension } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExtension } from "@codemirror/view";
import { markdownSyntaxHighlighting } from "@/lib/editor-highlight";
import { editorSearchExtension } from "@/lib/editor-search";
import { livePreviewCompartment } from "@/lib/editor-compartments";
import { livePreviewExtension } from "@/lib/live-preview";
import type { EditorMode } from "@/types/document";

type MarkdownEditorProps = {
  value: string;
  onChange: (markdown: string) => void;
  placeholder: string;
  viewRef: RefObject<EditorView | null>;
  mode: EditorMode;
  documentSession: number;
  documentPath: string | null;
};

const editorTheme = EditorView.theme({
  "&": { width: "100%", color: "var(--foreground)", backgroundColor: "transparent" },
  ".cm-scroller": {
    overflow: "visible",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: "1.9",
  },
  ".cm-content": { padding: "0", caretColor: "var(--foreground)", minHeight: "240px" },
  ".cm-line": { padding: "0" },
  ".cm-gutters": { display: "none" },
  "&.cm-focused": { outline: "none" },
  ".cm-placeholder": { color: "color-mix(in oklab, var(--foreground) 20%, transparent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent) !important",
  },
  ".cm-search-match": {
    backgroundColor: "color-mix(in oklab, var(--primary) 18%, transparent)",
    borderRadius: "2px",
  },
  ".cm-search-current": {
    backgroundColor: "color-mix(in oklab, var(--primary) 38%, transparent)",
    borderRadius: "2px",
  },
});

export function MarkdownEditor({
  value, onChange, placeholder, viewRef, mode, documentSession, documentPath,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const extensionsRef = useRef<Extension[] | null>(null);
  const lastDocumentSessionRef = useRef(documentSession);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return;
    const extensions: Extension[] = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      markdown(),
      markdownSyntaxHighlighting,
      editorSearchExtension,
      livePreviewCompartment.of([]),
      placeholderExtension(placeholder),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
    ];
    extensionsRef.current = extensions;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions,
      }),
    });
    viewRef.current = view;
    return () => {
      if (viewRef.current === view) viewRef.current = null;
      view.destroy();
    };
    // The view is intentionally created once; value changes are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (lastDocumentSessionRef.current !== documentSession && extensionsRef.current) {
      lastDocumentSessionRef.current = documentSession;
      view.setState(EditorState.create({ doc: value, extensions: extensionsRef.current }));
      return;
    }
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: { anchor: 0 },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value, viewRef, documentSession]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: livePreviewCompartment.reconfigure(mode === "live" ? livePreviewExtension(documentPath) : []),
    });
  }, [mode, viewRef, documentPath]);

  return <div ref={hostRef} className="markdown-editor" />;
}
