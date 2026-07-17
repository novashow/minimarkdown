import type { Range } from "@codemirror/state";
import { convertFileSrc } from "@tauri-apps/api/core";
import katex from "katex";
import {
  Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType,
} from "@codemirror/view";

class MathWidget extends WidgetType {
  private readonly source: string;
  private readonly displayMode: boolean;
  private readonly position: number;

  constructor(
    source: string,
    displayMode: boolean,
    position: number,
  ) {
    super();
    this.source = source;
    this.displayMode = displayMode;
    this.position = position;
  }

  eq(other: MathWidget) {
    return this.source === other.source && this.displayMode === other.displayMode;
  }

  toDOM(view: EditorView) {
    const element = document.createElement(this.displayMode ? "div" : "span");
    element.className = this.displayMode ? "cm-live-math-block" : "cm-live-math-inline";
    try {
      element.innerHTML = katex.renderToString(this.source, {
        displayMode: this.displayMode,
        throwOnError: true,
        output: "html",
      });
    } catch {
      element.classList.add("cm-live-math-error");
      element.textContent = this.displayMode ? `$$${this.source}$$` : `$${this.source}$`;
    }
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.position } });
      view.focus();
    });
    return element;
  }
}

class ImageWidget extends WidgetType {
  private readonly src: string;
  private readonly alt: string;
  private readonly position: number;

  constructor(
    src: string,
    alt: string,
    position: number,
  ) {
    super();
    this.src = src;
    this.alt = alt;
    this.position = position;
  }

  eq(other: ImageWidget) {
    return this.src === other.src && this.alt === other.alt;
  }

  toDOM(view: EditorView) {
    const image = document.createElement("img");
    image.className = "cm-live-image";
    image.src = this.src;
    image.alt = this.alt;
    image.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.position } });
      view.focus();
    });
    return image;
  }
}

class TaskWidget extends WidgetType {
  private readonly checked: boolean;
  private readonly position: number;

  constructor(
    checked: boolean,
    position: number,
  ) {
    super();
    this.checked = checked;
    this.position = position;
  }

  eq(other: TaskWidget) {
    return this.checked === other.checked;
  }

  toDOM(view: EditorView) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "cm-live-task";
    checkbox.checked = this.checked;
    checkbox.setAttribute("aria-label", this.checked ? "标记为未完成" : "标记为已完成");
    checkbox.addEventListener("mousedown", (event) => event.preventDefault());
    checkbox.addEventListener("click", (event) => {
      event.preventDefault();
      view.dispatch({ changes: { from: this.position + 1, to: this.position + 2, insert: this.checked ? " " : "x" } });
      view.focus();
    });
    return checkbox;
  }
}

function isLineSelected(view: EditorView, from: number, to: number) {
  return view.state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

function resolveImageSource(source: string, documentPath: string | null) {
  if (/^(?:https?:|data:|blob:)/i.test(source)) return source;
  if (source.startsWith("/") && documentPath) return convertFileSrc(source);
  if (!documentPath) return source;
  const baseParts = documentPath.split("/").slice(0, -1);
  for (const part of source.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  return convertFileSrc(baseParts.join("/"));
}

function addInlineDecorations(
  text: string,
  offset: number,
  ranges: Range<Decoration>[],
  documentPath: string | null,
) {
  const pattern = /!\[([^\]\n]*)\]\(([^)\n]+)\)|(\*\*|__)(.+?)\3|~~(.+?)~~|`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\n]+)\)|\$([^$\n]+)\$|(?<!\*)\*([^*\n]+)\*(?!\*)|(?<!_)_([^_\n]+)_(?!_)/g;
  for (const match of text.matchAll(pattern)) {
    const start = offset + (match.index ?? 0);
    const end = start + match[0].length;
    if (match[1] != null) {
      ranges.push(Decoration.replace({
        widget: new ImageWidget(resolveImageSource(match[2], documentPath), match[1], start),
      }).range(start, end));
    } else if (match[4] != null) {
      const markerLength = match[3].length;
      ranges.push(Decoration.replace({}).range(start, start + markerLength));
      ranges.push(Decoration.mark({ class: "cm-live-strong" }).range(start + markerLength, end - markerLength));
      ranges.push(Decoration.replace({}).range(end - markerLength, end));
    } else if (match[5] != null) {
      ranges.push(Decoration.replace({}).range(start, start + 2));
      ranges.push(Decoration.mark({ class: "cm-live-strike" }).range(start + 2, end - 2));
      ranges.push(Decoration.replace({}).range(end - 2, end));
    } else if (match[6] != null) {
      ranges.push(Decoration.replace({}).range(start, start + 1));
      ranges.push(Decoration.mark({ class: "cm-live-code" }).range(start + 1, end - 1));
      ranges.push(Decoration.replace({}).range(end - 1, end));
    } else if (match[7] != null) {
      const labelStart = start + 1;
      const labelEnd = labelStart + match[7].length;
      ranges.push(Decoration.replace({}).range(start, labelStart));
      ranges.push(Decoration.mark({
        class: "cm-live-link",
        attributes: { "data-url": match[8] },
      }).range(labelStart, labelEnd));
      ranges.push(Decoration.replace({}).range(labelEnd, end));
    } else if (match[9] != null) {
      ranges.push(Decoration.replace({
        widget: new MathWidget(match[9], false, start),
      }).range(start, end));
    } else {
      ranges.push(Decoration.replace({}).range(start, start + 1));
      ranges.push(Decoration.mark({ class: "cm-live-emphasis" }).range(start + 1, end - 1));
      ranges.push(Decoration.replace({}).range(end - 1, end));
    }
  }
}

function buildLivePreview(view: EditorView, documentPath: string | null): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  let inFence = false;
  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    const line = view.state.doc.line(number);
    const trimmed = line.text.trimStart();
    const lineSelected = isLineSelected(view, line.from, line.to);
    const singleLineMath = line.text.match(/^\s*\$\$(.+)\$\$\s*$/);
    if (singleLineMath && !lineSelected) {
      ranges.push(Decoration.replace({
        widget: new MathWidget(singleLineMath[1], true, line.from),
      }).range(line.from, line.to));
      continue;
    }
    if (trimmed === "$$") {
      let closingLine = number + 1;
      while (closingLine <= view.state.doc.lines && view.state.doc.line(closingLine).text.trim() !== "$$") {
        closingLine += 1;
      }
      if (closingLine <= view.state.doc.lines) {
        const closing = view.state.doc.line(closingLine);
        if (!isLineSelected(view, line.from, closing.to)) {
          const source = view.state.doc.sliceString(line.to + 1, closing.from).trim();
          ranges.push(Decoration.replace({
            widget: new MathWidget(source, true, line.from),
          }).range(line.from, closing.to));
          number = closingLine;
          continue;
        }
      }
    }
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      ranges.push(Decoration.line({ class: "cm-live-code-line" }).range(line.from));
      continue;
    }
    if (inFence) {
      ranges.push(Decoration.line({ class: "cm-live-code-line" }).range(line.from));
      continue;
    }
    const heading = line.text.match(/^(#{1,6})\s+/);
    let contentOffset = line.from;
    let contentText = line.text;
    if (heading) {
      const level = heading[1].length;
      if (!lineSelected) {
        ranges.push(Decoration.replace({}).range(line.from, line.from + heading[0].length));
      }
      ranges.push(Decoration.line({ class: `cm-live-heading cm-live-h${level}` }).range(line.from));
      contentOffset += heading[0].length;
      contentText = line.text.slice(heading[0].length);
    } else if (/^>\s?/.test(line.text)) {
      ranges.push(Decoration.line({ class: "cm-live-quote" }).range(line.from));
    } else if (/^\s*(?:[-*+] |\d+\. )/.test(line.text)) {
      ranges.push(Decoration.line({ class: "cm-live-list" }).range(line.from));
    } else if (!lineSelected && /^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line.text)) {
      ranges.push(Decoration.mark({ class: "cm-live-divider" }).range(line.from, line.to));
    }
    const task = line.text.match(/^\s*[-*+]\s+(\[([ xX])\])/);
    if (!lineSelected && task && task.index != null) {
      const position = line.from + task.index + task[0].lastIndexOf(task[1]);
      ranges.push(Decoration.replace({
        widget: new TaskWidget(task[2].toLowerCase() === "x", position),
      }).range(position, position + 3));
    }
    if (!lineSelected) addInlineDecorations(contentText, contentOffset, ranges, documentPath);
  }
  return Decoration.set(ranges, true);
}

export function livePreviewExtension(documentPath: string | null) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildLivePreview(view, documentPath);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildLivePreview(update.view, documentPath);
      }
    }
  }, {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(event) {
        if (!(event.metaKey || event.ctrlKey)) return false;
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".cm-live-link") : null;
        const url = target?.dataset.url;
        if (!url) return false;
        window.open(url, "_blank", "noopener,noreferrer");
        event.preventDefault();
        return true;
      },
    },
  });
}
