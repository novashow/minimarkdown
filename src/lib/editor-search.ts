import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export function setEditorSearch(view: EditorView, query: string, current: number, matchAt?: number) {
  // Build against the live view, then send the finished set through a temporary effect.
  const text = view.state.doc.toString();
  const needle = query.toLocaleLowerCase();
  const ranges: Array<{ from: number; to: number; value: Decoration }> = [];
  if (needle) {
    const haystack = text.toLocaleLowerCase();
    let from = 0;
    let index = 0;
    while (from <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, from);
      if (found < 0) break;
      ranges.push({
        from: found,
        to: found + query.length,
        value: Decoration.mark({ class: index === current ? "cm-search-current" : "cm-search-match" }),
      });
      index += 1;
      from = found + Math.max(1, needle.length);
    }
  }
  view.dispatch({ effects: replaceSearchDecorations.of(Decoration.set(ranges, true)) });
  if (matchAt != null) view.dispatch({ effects: EditorView.scrollIntoView(matchAt, { y: "center" }) });
}

const replaceSearchDecorations = StateEffect.define<DecorationSet>();

export const editorSearchExtension = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(replaceSearchDecorations)) return effect.value;
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});
