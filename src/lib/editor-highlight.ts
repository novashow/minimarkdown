import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5em", fontWeight: "700", color: "var(--foreground)" },
  { tag: tags.heading2, fontSize: "1.35em", fontWeight: "700", color: "var(--foreground)" },
  { tag: tags.heading3, fontSize: "1.2em", fontWeight: "650", color: "var(--foreground)" },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "650", color: "var(--foreground)" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  {
    tag: tags.monospace,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    color: "var(--foreground)",
  },
  { tag: [tags.link, tags.url], color: "var(--primary)", textDecoration: "underline" },
  { tag: [tags.quote, tags.list, tags.meta], color: "var(--muted-foreground)" },
  { tag: tags.processingInstruction, color: "var(--muted-foreground)" },
]);

export const markdownSyntaxHighlighting = syntaxHighlighting(markdownHighlightStyle);
