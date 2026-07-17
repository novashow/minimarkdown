export type EditorMode = "source" | "split" | "live" | "preview";
export type ThemeMode = "light" | "dark" | "system";
export type AppLocale = "zh-CN" | "en";

/** Each document corresponds to one .md file on disk.
 *  `id` is the absolute file path.
 *  `content_markdown` is "" when the doc is in the sidebar list (lazy-loaded). */
export type AppDocument = {
  id: string;               // absolute file path
  title: string;            // filename stem (without .md)
  content_markdown: string; // full content (empty in list view, loaded on selection)
  updated_at: string;       // ISO string from file mtime
};

export type DocumentPatch = {
  title?: string;
  content_markdown?: string;
};
