/* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability, react-hooks/preserve-manual-memoization, react-hooks/exhaustive-deps -- Legacy single-component orchestration is retained during the editor migration. */
import {
  type MouseEvent as ReactMouseEvent,
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import type { EditorView } from "@codemirror/view";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  AlignLeft, BookOpen, Download, FilePlus,
  FolderOpen, MoonStar, PanelLeftClose, PanelLeftOpen,
  Search, Settings, SlidersHorizontal, Sun, SunMoon, Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { themeService } from "@/services/theme-service";
import { updateService } from "@/services/update-service";
import type { EditorMode, ThemeMode, AppLocale } from "@/types/document";
import {
  buildExportHtml, ensureKatex, extractHeadings, fileStem,
  getBlockStartLines, hasMath, markdownToHtml,
} from "@/lib/markdown";
import { cn } from "@/lib/utils";
import "./lib/i18n";

import { MarkdownSourceToolbar } from "@/components/markdown-toolbar";
import { DocumentSearch } from "@/components/document-search";
import { MarkdownEditor } from "@/components/markdown-editor";
import { setEditorSearch } from "@/lib/editor-search";

// ── Types ─────────────────────────────────────────────────────────────────────

type DraftState = { title: string; markdown: string };
type RecentFile = { path: string; title: string; time: string };
type DirtyChoice = "save" | "discard" | "cancel";
type RecoverySnapshot = {
  version: 1;
  filePath: string | null;
  draft: DraftState;
  savedContent: DraftState | null;
  lastSavedAt: string | null;
  updatedAt: string;
};

// ── Recent-files helpers (localStorage) ─────────────────────────────────────

const RECENT_KEY = "minimarkdown-recent-files";
const RECOVERY_KEY = "minimarkdown-recovery-v1";
const MAX_RECENT = 20;

function loadRecentFiles(): RecentFile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function persistRecentFiles(files: RecentFile[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(files));
}

function loadRecoverySnapshot(): RecoverySnapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? "null") as Partial<RecoverySnapshot> | null;
    if (
      !value || value.version !== 1
      || !value.draft || typeof value.draft.title !== "string" || typeof value.draft.markdown !== "string"
      || (value.filePath !== null && typeof value.filePath !== "string")
    ) return null;
    const saved = value.savedContent;
    const savedContent = saved && typeof saved.title === "string" && typeof saved.markdown === "string"
      ? { title: saved.title, markdown: saved.markdown }
      : null;
    return {
      version: 1,
      filePath: value.filePath ?? null,
      draft: { title: value.draft.title, markdown: value.draft.markdown },
      savedContent,
      lastSavedAt: typeof value.lastSavedAt === "string" ? value.lastSavedAt : null,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    };
  } catch {
    localStorage.removeItem(RECOVERY_KEY);
    return null;
  }
}

// ── Misc constants ────────────────────────────────────────────────────────────

type LocalePref = "system" | AppLocale;

const themeCycle: ThemeMode[] = ["light", "dark", "system"];
const LOCALE_PREF_KEY = "minimarkdown-locale-pref";
const AUTOSAVE_KEY = "minimarkdown-autosave";
const AUTOSAVE_INTERVAL_KEY = "minimarkdown-autosave-interval";
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 480;
const SIDEBAR_WIDTH_KEY = "minimarkdown-sidebar-width";

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { t, i18n } = useTranslation();
  const [initialRecovery] = useState<RecoverySnapshot | null>(loadRecoverySnapshot);

  // ── Document state ─────────────────────────────────────────────────────────
  const [filePath, setFilePath] = useState<string | null>(initialRecovery?.filePath ?? null);
  const [draft, setDraft] = useState<DraftState>(initialRecovery?.draft ?? { title: "", markdown: "" });
  /** What's on disk. null = never saved. */
  const [savedContent, setSavedContent] = useState<DraftState | null>(initialRecovery?.savedContent ?? null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(loadRecentFiles);
  const [dirtyResolve, setDirtyResolve] = useState<((r: DirtyChoice) => void) | null>(null);
  const [documentSession, setDocumentSession] = useState(0);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [sidebarMode, setSidebarMode] = useState<"outline" | "documents">("outline");
  const [editorMode, setEditorMode] = useState<EditorMode>("live");
  const [lastEditingMode, setLastEditingMode] = useState<Exclude<EditorMode, "preview">>("live");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_MIN;
  });
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [openFileExpanded, setOpenFileExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [docSearchOpen, setDocSearchOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [sidebarSearchVisible, setSidebarSearchVisible] = useState(false);

  // ── App state ──────────────────────────────────────────────────────────────
  const [themeMode, setThemeMode] = useState<ThemeMode>(themeService.getMode());
  const [locale, setLocale] = useState<AppLocale>(i18n.language === "en" ? "en" : "zh-CN");
  const [localePreference, setLocalePreference] = useState<LocalePref>(() => {
    const s = localStorage.getItem(LOCALE_PREF_KEY);
    return (s === "system" || s === "zh-CN" || s === "en") ? s : "system";
  });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => localStorage.getItem(AUTOSAVE_KEY) !== "false");
  const [autoSaveIntervalSec, setAutoSaveIntervalSec] = useState<number>(() => {
    const v = Number(localStorage.getItem(AUTOSAVE_INTERVAL_KEY));
    return [30, 60, 180, 300].includes(v) ? v : 60;
  });
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialRecovery?.lastSavedAt ?? null);
  const [activeHeadingId, setActiveHeadingId] = useState<string>("");
  const [saveToast, setSaveToast] = useState(false);
  const [appVersion, setAppVersion] = useState("…");
  const [updateToast, setUpdateToast] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [recoveryToast, setRecoveryToast] = useState(Boolean(initialRecovery));

  // ── Refs ───────────────────────────────────────────────────────────────────
  const draftRef = useRef(draft);
  const filePathRef = useRef(filePath);
  const savedContentRef = useRef(savedContent);
  const isClosingRef = useRef(false);      // prevents re-entrant close-request
  const guardInProgressRef = useRef(false); // prevents concurrent dirty-check dialogs
  const hasPromotedRef = useRef(false);    // tracks if current file has been promoted on first edit
  const saveToastTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const sourceScrollRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const ignoreScrollRef = useRef<{ source: boolean; preview: boolean }>({ source: false, preview: false });
  const scrollAnchorsRef = useRef<Array<{ src: number; prev: number }>>([]);
  /** Preview scroll position to restore when switching preview → split. */
  const pendingPreviewScrollRef = useRef<number | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const folderRef = useRef<HTMLDivElement | null>(null);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const folderMenuTimer = useRef<number | null>(null);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { filePathRef.current = filePath; }, [filePath]);
  useEffect(() => { savedContentRef.current = savedContent; }, [savedContent]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    if (!savedContent) return draft.markdown.trim() !== "" || draft.title.trim() !== "";
    return draft.markdown !== savedContent.markdown || draft.title !== savedContent.title;
  }, [draft, savedContent]);

  const isDirtyRef = useRef(isDirty);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // Keep a local recovery copy of every unsaved change. It is cleared after save or discard.
  useEffect(() => {
    if (!isDirty) {
      localStorage.removeItem(RECOVERY_KEY);
      return;
    }
    const snapshot: RecoverySnapshot = {
      version: 1,
      filePath,
      draft,
      savedContent,
      lastSavedAt,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snapshot));
  }, [isDirty, filePath, draft, savedContent, lastSavedAt]);

  useEffect(() => {
    if (!recoveryToast) return;
    const timer = window.setTimeout(() => setRecoveryToast(false), 3200);
    return () => window.clearTimeout(timer);
  }, [recoveryToast]);

  const headings = useMemo(() => extractHeadings(draft.markdown), [draft.markdown]);
  const previewHtml = useMemo(() => markdownToHtml(draft.markdown), [draft.markdown]);
  const findMatches = useMemo(() => computeMatches(draft.markdown, findQuery), [draft.markdown, findQuery]);
  const effectiveTitle = draft.title.trim() || t("documents.untitled");

  /** Current-doc card is only shown while editing (isDirty) or for a brand-new unsaved doc.
   *  When just viewing a saved file, it stays in its original list position. */
  const currentDocVisible = useMemo(
    () => isDirty,
    [isDirty],
  );

  const filteredRecent = useMemo(() => {
    // Only exclude the current file from the list when it is shown in the top "editing" card.
    // When just viewing (not dirty), keep it in its original position and highlight it.
    const base = currentDocVisible
      ? recentFiles.filter((f) => f.path !== filePath)
      : recentFiles;
    const q = sidebarSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((f) => f.title.toLowerCase().includes(q));
  }, [recentFiles, sidebarSearch, filePath, currentDocVisible]);

  const visibleHeadingId = useMemo(() => {
    if (activeHeadingId && headings.some((h) => h.id === activeHeadingId)) return activeHeadingId;
    return headings[0]?.id ?? "";
  }, [activeHeadingId, headings]);

  // ── Base effects ───────────────────────────────────────────────────────────

  useEffect(() => { themeService.setMode(themeMode); }, [themeMode]);

  // Sync locale preference → actual i18n language
  useEffect(() => {
    const resolved: AppLocale = localePreference === "system"
      ? (navigator.language.startsWith("zh") ? "zh-CN" : "en")
      : localePreference;
    setLocale(resolved);
    void i18n.changeLanguage(resolved);
    localStorage.setItem(LOCALE_PREF_KEY, localePreference);
  }, [localePreference]);

  // Auto-save interval
  // saveFile is stable (useCallback [addToRecent]) but defined below — omit from deps to avoid TDZ.
  useEffect(() => {
    if (!autoSaveEnabled) return;
    const id = window.setInterval(async () => {
      if (!isDirtyRef.current || !filePathRef.current) return;
      await saveFile(undefined, true);
    }, autoSaveIntervalSec * 1000);
    return () => window.clearInterval(id);
  }, [autoSaveEnabled, autoSaveIntervalSec]);

  // Read app version once on mount
  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) =>
      getVersion().then(setAppVersion).catch(() => setAppVersion("0.1.0")),
    );
  }, []);

  // Lazy-load KaTeX only when the document contains math ($).
  useEffect(() => {
    if (hasMath(draft.markdown)) void ensureKatex();
  }, [draft.markdown]);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const current = findMatches.length ? Math.min(findIndex, findMatches.length - 1) : 0;
    setEditorSearch(view, docSearchOpen ? findQuery : "", current, findMatches[current]);
  }, [docSearchOpen, findQuery, findIndex, findMatches]);

  // Reset promotion flag whenever the active file changes (open / new doc)
  useEffect(() => { hasPromotedRef.current = false; }, [filePath]);

  // Promote to top of recent list on the FIRST edit after opening.
  // addToRecent is intentionally omitted from deps — it's stable (useCallback []).
  useEffect(() => {
    if (!isDirty || hasPromotedRef.current || !filePath) return;
    hasPromotedRef.current = true;
    addToRecent(filePath, draft.title || stemOf(filePath));
  }, [isDirty, filePath, draft.title]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) setSettingsOpen(false);
      const inFolder = folderRef.current?.contains(target) || folderMenuRef.current?.contains(target);
      if (!inFolder) setOpenFileExpanded(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  // ── Recent-files helpers ───────────────────────────────────────────────────

  const addToRecent = useCallback((path: string, title: string) => {
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== path);
      const next = [{ path, title, time: new Date().toISOString() }, ...filtered].slice(0, MAX_RECENT);
      persistRecentFiles(next);
      return next;
    });
  }, []);

  const removeFromRecent = useCallback((path: string) => {
    setRecentFiles((prev) => {
      const next = prev.filter((file) => file.path !== path);
      persistRecentFiles(next);
      return next;
    });
  }, []);

  // Purge recent files that no longer exist on disk (checked on window focus)
  useEffect(() => {
    const check = async () => {
      const { exists } = await import("@tauri-apps/plugin-fs");
      setRecentFiles((prev) => {
        // Run async checks and update state once done
        void Promise.all(prev.map((f) => exists(f.path).then((ok) => ({ ...f, ok })))).then((results) => {
          const alive = results.filter((r) => r.ok).map(({ path, title, time }) => ({ path, title, time }));
          if (alive.length !== prev.length) {
            persistRecentFiles(alive);
            setRecentFiles(alive);
          }
        });
        return prev; // no immediate change
      });
    };
    window.addEventListener("focus", check);
    void check(); // also run once on mount
    return () => window.removeEventListener("focus", check);
  }, []);

  // ── Core file operations ───────────────────────────────────────────────────

  /** Write current draft to disk. Prompts for path when the doc is unsaved.
   *  Returns true on success, false if the user cancelled. */
  const saveFile = useCallback(async (asPath?: string, silent = false): Promise<boolean> => {
    const currentDraft = draftRef.current;
    const targetPath = asPath ?? filePathRef.current;

    if (!targetPath) {
      // No path yet — show save dialog
      const chosen = await save({
        defaultPath: `${sanitizeFilename(currentDraft.title || "未命名文档")}.md`,
        filters: [
          { name: "Markdown", extensions: ["md", "markdown"] },
          { name: "文本文件", extensions: ["txt"] },
        ],
      });
      if (!chosen) return false;
      return saveFile(chosen);
    }

    try {
      await writeTextFile(targetPath, currentDraft.markdown);
    } catch (err) {
      console.error("writeTextFile failed:", err);
      // Surface the error so it's visible during development
      alert(`保存失败：${String(err)}`);
      return false;
    }

    const stem = stemOf(targetPath);
    setFilePath(targetPath);
    setDraft((d) => ({ ...d, title: stem }));
    setSavedContent({ title: stem, markdown: currentDraft.markdown });
    // Sync isDirtyRef immediately so close handlers see the clean state
    // without waiting for the React re-render cycle.
    isDirtyRef.current = false;
    setLastSavedAt(new Date().toISOString());
    addToRecent(targetPath, stem);
    localStorage.removeItem(RECOVERY_KEY);

    // Show "已保存" toast (skip for silent auto-save)
    if (!silent) {
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
      setSaveToast(true);
      saveToastTimerRef.current = window.setTimeout(() => setSaveToast(false), 2000);
    }

    return true;
  }, [addToRecent]);

  const saveFileAs = useCallback(async (): Promise<boolean> => {
    const currentDraft = draftRef.current;
    const chosen = await save({
      defaultPath: `${sanitizeFilename(currentDraft.title || "未命名文档")}.md`,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "文本文件", extensions: ["txt"] },
      ],
    });
    if (!chosen) return false;
    return saveFile(chosen);
  }, [saveFile]);

  const showDirtyDialog = useCallback((): Promise<DirtyChoice> => {
    return new Promise((resolve) => { setDirtyResolve(() => resolve); });
  }, []);

  const resolveDirty = useCallback((choice: DirtyChoice) => {
    setDirtyResolve((prev: ((r: DirtyChoice) => void) | null) => { prev?.(choice); return null; });
  }, []);

  /** If dirty: show 保存/不保存/取消 dialog.
   *  保存 → native save dialog → proceed on success.
   *  不保存 → discard changes and proceed.
   *  取消 → abort.
   */
  const guardDirty = useCallback(async (): Promise<boolean> => {
    if (!isDirtyRef.current) return true;
    // Prevent ⌘Q triggering both keyboard handler and onCloseRequested simultaneously
    if (guardInProgressRef.current) return false;
    guardInProgressRef.current = true;
    try {
      const choice = await showDirtyDialog();
      if (choice === "cancel") return false;
      if (choice === "save") {
        const saved = await saveFile();
        if (!saved) return false;
      }
      if (choice === "discard") localStorage.removeItem(RECOVERY_KEY);
      return true;
    } finally {
      guardInProgressRef.current = false;
    }
  }, [showDirtyDialog, saveFile]);

  const newDocument = useCallback(async () => {
    if (!(await guardDirty())) return;
    setFilePath(null);
    setDraft({ title: "", markdown: "" });
    setSavedContent(null);
    setLastSavedAt(null);
    setDocumentSession((session) => session + 1);
    window.setTimeout(() => titleInputRef.current?.focus(), 30);
  }, [guardDirty]);

  const openFile = useCallback(async (path?: string) => {
    if (!(await guardDirty())) return;
    const targetPath = path ?? (await open({
      multiple: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "文本文件", extensions: ["txt"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    }));
    if (!targetPath || Array.isArray(targetPath)) return;
    try {
      const content = await readTextFile(targetPath);
      const stem = stemOf(targetPath);
      const normalizedMarkdown = normalizeMarkdownBody(content, stem);
      setFilePath(targetPath);
      setDraft({ title: stem, markdown: normalizedMarkdown });
      setSavedContent({ title: stem, markdown: normalizedMarkdown });
      setLastSavedAt(new Date().toISOString());
      setDocumentSession((session) => session + 1);
      setLastEditingMode("live");
      setEditorMode("live");
      // Do NOT call addToRecent here — opening is "view", not "edit".
      // The file will be promoted when the user first edits it.
      setSidebarMode("documents");
    } catch (error) {
      console.error("Failed to open file", error);
    }
  }, [guardDirty]);

  const exportHtml = useCallback(async () => {
    const d = draftRef.current;
    const path = await save({
      defaultPath: `${fileStem(d.title || "untitled")}.html`,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });
    if (!path) return;
    await writeTextFile(path, buildExportHtml(d.title, markdownToHtml(d.markdown)));
  }, []);

  const deleteDocument = useCallback(async () => {
    const currentPath = filePathRef.current;
    const currentDraft = draftRef.current;
    const displayName = currentDraft.title.trim() || "未命名文档";

    const ok = await confirm(
      currentPath
        ? `“${displayName}”将被永久删除，此操作无法撤销。`
        : `“${displayName}”尚未保存，清空后无法恢复。`,
      {
        title: currentPath ? "永久删除文稿" : "清空未保存文稿",
        kind: "warning",
        okLabel: currentPath ? "永久删除" : "清空",
        cancelLabel: "取消",
      },
    );
    if (!ok) return;
    if (currentPath) {
      try {
        await remove(currentPath);
        removeFromRecent(currentPath);
      } catch (error) {
        console.error("Failed to delete file", error);
        alert(`删除失败：${String(error)}`);
        return;
      }
    }
    // Reset to blank document
    setFilePath(null);
    setDraft({ title: "", markdown: "" });
    setSavedContent(null);
    setLastSavedAt(null);
    localStorage.removeItem(RECOVERY_KEY);
    setDocumentSession((session) => session + 1);
    window.setTimeout(() => titleInputRef.current?.focus(), 30);
  }, [removeFromRecent]);

  // ── Hover-intent for folder menu ───────────────────────────────────────────
  const openFolderMenu = useCallback(() => {
    if (folderMenuTimer.current) { window.clearTimeout(folderMenuTimer.current); folderMenuTimer.current = null; }
    setOpenFileExpanded(true);
  }, []);
  const scheduleCloseFolderMenu = useCallback(() => {
    if (folderMenuTimer.current) window.clearTimeout(folderMenuTimer.current);
    folderMenuTimer.current = window.setTimeout(() => setOpenFileExpanded(false), 260);
  }, []);

  // ── On window close: guard dirty state ────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          event.preventDefault();
          if (isClosingRef.current) return;
          if (isDirtyRef.current) {
            const canClose = await guardDirty();
            if (!canClose) return;
          }
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("hide_main_window");
        });
        if (disposed) unlisten?.();
      } catch (error) {
        console.error("Failed to register close handler", error);
      }
    })();
    return () => { disposed = true; unlisten?.(); };
  }, [guardDirty]);

  // ── Drag .md / .txt files onto window ────────────────────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          const paths = (event.payload.paths ?? []).filter((p) =>
            /\.(md|markdown|txt)$/i.test(p),
          );
          if (paths.length === 0) return;
          void openFile(paths[0]);
        });
        if (disposed) unlisten?.();
      } catch (error) {
        console.error("Failed to register drag-drop handler", error);
      }
    })();
    return () => { disposed = true; unlisten?.(); };
  }, [openFile]);

  // ── Native app menu ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { Menu, Submenu, MenuItem, PredefinedMenuItem } =
          await import("@tauri-apps/api/menu");
        if (cancelled) return;

        // 最近文稿 submenu (top 8)
        const recentMenuItems = recentFiles.length > 0
          ? await Promise.all(
              recentFiles.slice(0, 8).map((f) =>
                MenuItem.new({ text: f.title, action: () => void openFile(f.path) }),
              ),
            )
          : [await MenuItem.new({ text: "无最近文稿", enabled: false })];
        const recentSubmenu = await Submenu.new({ text: "最近文稿", items: recentMenuItems });

        const menu = await Menu.new({
          items: [
            // ── MiniMarkdown ─────────────────────────────────────────────
            await Submenu.new({
              text: "MiniMarkdown",
              items: [
                await PredefinedMenuItem.new({ item: { About: null } }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await PredefinedMenuItem.new({ item: "Services" }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await PredefinedMenuItem.new({ item: "Hide" }),
                await PredefinedMenuItem.new({ item: "HideOthers" }),
                await PredefinedMenuItem.new({ item: "ShowAll" }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await MenuItem.new({
                  id: "quit-app",
                  text: "退出 MiniMarkdown",
                  accelerator: "CmdOrCtrl+Q",
                }),
              ],
            }),
            // ── 文件 ─────────────────────────────────────────────────────
            await Submenu.new({
              text: "文件",
              items: [
                await MenuItem.new({ text: "新建", accelerator: "CmdOrCtrl+N", action: () => void newDocument() }),
                await MenuItem.new({ text: "打开…", accelerator: "CmdOrCtrl+O", action: () => void openFile() }),
                recentSubmenu,
                await PredefinedMenuItem.new({ item: "Separator" }),
                await MenuItem.new({ text: "保存", accelerator: "CmdOrCtrl+S", action: () => void saveFile() }),
                await MenuItem.new({ text: "另存为…", accelerator: "CmdOrCtrl+Shift+S", action: () => void saveFileAs() }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await MenuItem.new({ text: "删除文档", action: () => void deleteDocument() }),
              ],
            }),
            // ── 编辑 ─────────────────────────────────────────────────────
            await Submenu.new({
              text: "编辑",
              items: [
                await PredefinedMenuItem.new({ item: "Undo" }),
                await PredefinedMenuItem.new({ item: "Redo" }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await PredefinedMenuItem.new({ item: "Cut" }),
                await PredefinedMenuItem.new({ item: "Copy" }),
                await PredefinedMenuItem.new({ item: "Paste" }),
                await PredefinedMenuItem.new({ item: "SelectAll" }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await MenuItem.new({ text: "加粗", accelerator: "CmdOrCtrl+B", action: () => applyInlineFormat("**", "**", "粗体文字") }),
                await MenuItem.new({ text: "斜体", accelerator: "CmdOrCtrl+I", action: () => applyInlineFormat("*", "*", "斜体文字") }),
                await MenuItem.new({ text: "插入链接", accelerator: "CmdOrCtrl+K", action: () => applyLinkFormat() }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await MenuItem.new({ text: "查找", accelerator: "CmdOrCtrl+F", action: () => openSearch() }),
              ],
            }),
            // ── 视图 ─────────────────────────────────────────────────────
            await Submenu.new({
              text: "视图",
              items: [
                await MenuItem.new({ text: "折叠 / 展开侧边栏", accelerator: "CmdOrCtrl+\\", action: () => setSidebarCollapsed((v) => !v) }),
                await MenuItem.new({ text: "进入 / 退出阅读模式", accelerator: "CmdOrCtrl+E", action: () => toggleReadingMode() }),
              ],
            }),
            // ── 窗口 ─────────────────────────────────────────────────────
            await Submenu.new({
              text: "窗口",
              items: [
                await PredefinedMenuItem.new({ item: "Minimize" }),
                await PredefinedMenuItem.new({ item: "Maximize" }),
                await PredefinedMenuItem.new({ item: "Separator" }),
                await PredefinedMenuItem.new({ item: "CloseWindow" }),
              ],
            }),
          ],
        });

        if (!cancelled) await menu.setAsAppMenu();
      } catch (e) {
        console.error("Failed to build native menu", e);
      }
    })();
    return () => { cancelled = true; };
  }, [recentFiles]);

  // ── ?open=<path> on startup (new window) ──────────────────────────────────
  const openParamHandledRef = useRef(false);
  useEffect(() => {
    if (openParamHandledRef.current) return;
    const target = new URLSearchParams(window.location.search).get("open");
    if (target) {
      openParamHandledRef.current = true;
      void openFile(decodeURIComponent(target));
    }
  }, [openFile]);

  // ── OS file association: open .md / .markdown from Finder / Explorer ───────
  // macOS sends RunEvent::Opened; Windows/Linux pass the path via argv and the
  // single-instance plugin. The Rust side buffers paths and emits a nudge; we
  // drain them atomically via the `get_pending_open` command (no duplicates).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    const drainPending = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const paths = await invoke<string[]>("get_pending_open");
        if (paths.length > 0) void openFile(paths[0]);
      } catch (error) {
        console.error("Failed to drain pending open", error);
      }
    };
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("open-file-pending", () => void drainPending());
        if (disposed) { unlisten?.(); return; }
        void drainPending(); // cold start
      } catch (error) {
        console.error("Failed to register open-file listener", error);
      }
    })();
    return () => { disposed = true; unlisten?.(); };
  }, [openFile]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const toggleReadingMode = useCallback(() => {
    if (editorMode === "preview") {
      if (lastEditingMode === "split" && previewScrollRef.current) {
        pendingPreviewScrollRef.current = previewScrollRef.current.scrollTop;
      }
      setEditorMode(lastEditingMode);
      return;
    }
    setLastEditingMode(editorMode);
    setEditorMode("preview");
  }, [editorMode, lastEditingMode]);
  const selectEditingMode = useCallback((mode: Exclude<EditorMode, "preview">) => {
    setLastEditingMode(mode);
    setEditorMode(mode);
  }, []);
  const openSearch = useCallback(() => {
    setDocSearchOpen(true);
    setEditorMode((current) => current === "preview" ? lastEditingMode : current);
  }, [lastEditingMode]);
  const closeSearch = useCallback(() => { setDocSearchOpen(false); setFindQuery(""); setFindIndex(0); }, []);

  /** Shared quit logic — used by both keyboard handler and native menu. */
  const quitApp = useCallback(async () => {
    if (isClosingRef.current) return;
    const canQuit = await guardDirty();
    if (!canQuit) return;
    isClosingRef.current = true;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("quit_app");
  }, [guardDirty]);

  /** Wrap the editor selection with prefix/suffix. Falls back to placeholder when nothing is selected. */
  const applyInlineFormat = useCallback((prefix: string, suffix: string, placeholder: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    const { from: s, to: e } = view.state.selection.main;
    const selected = view.state.sliceDoc(s, e) || placeholder;
    const wrappedOutside = s >= prefix.length
      && e + suffix.length <= view.state.doc.length
      && view.state.sliceDoc(s - prefix.length, s) === prefix
      && view.state.sliceDoc(e, e + suffix.length) === suffix;
    if (wrappedOutside) {
      view.dispatch({
        changes: [
          { from: s - prefix.length, to: s, insert: "" },
          { from: e, to: e + suffix.length, insert: "" },
        ],
        selection: { anchor: s - prefix.length, head: e - prefix.length },
      });
      view.focus();
      return;
    }
    const newStart = s + prefix.length;
    const newEnd = newStart + selected.length;
    view.dispatch({
      changes: { from: s, to: e, insert: `${prefix}${selected}${suffix}` },
      selection: { anchor: newStart, head: newEnd },
    });
    view.focus();
  }, []);

  /** Insert a Markdown link. Selected text becomes the label; cursor lands on the URL slot. */
  const applyLinkFormat = useCallback(() => {
    const view = editorViewRef.current;
    if (!view) return;
    const { from: s, to: e } = view.state.selection.main;
    const label = view.state.sliceDoc(s, e) || "链接文字";
    const insert = `[${label}](url)`;
    // Always select the "url" placeholder so the user can type the address right away
    const urlStart = s + label.length + 3; // after `[label](`
    const urlEnd = urlStart + 3;           // covers `url`
    view.dispatch({
      changes: { from: s, to: e, insert },
      selection: { anchor: urlStart, head: urlEnd },
    });
    view.focus();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Escape — close search (no modifier required)
      if (event.key === "Escape") {
        if (docSearchOpen) { event.preventDefault(); closeSearch(); }
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;
      const key = event.key.toLowerCase();

      // ── File operations ────────────────────────────────────────────────
      if (key === "n") { event.preventDefault(); void newDocument(); }
      if (key === "o") { event.preventDefault(); void openFile(); }
      if (key === "s") {
        event.preventDefault();
        if (event.shiftKey) void saveFileAs();
        else void saveFile();
      }
      // ── View ───────────────────────────────────────────────────────────
      if (key === "e") { event.preventDefault(); toggleReadingMode(); }
      if (key === "f") { event.preventDefault(); openSearch(); }
      if (event.key === "\\") { event.preventDefault(); setSidebarCollapsed((v) => !v); }
      // ── Inline formatting ──────────────────────────────────────────────
      if (key === "b") { event.preventDefault(); applyInlineFormat("**", "**", "粗体文字"); }
      if (key === "i") { event.preventDefault(); applyInlineFormat("*", "*", "斜体文字"); }
      if (key === "k") { event.preventDefault(); applyLinkFormat(); }
      // ── App ────────────────────────────────────────────────────────────
      if (key === "q") { event.preventDefault(); void quitApp(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [newDocument, openFile, saveFile, saveFileAs, openSearch, closeSearch,
      quitApp, applyInlineFormat, applyLinkFormat, docSearchOpen, toggleReadingMode]);

  // ── Copy button on code blocks ────────────────────────────────────────────
  useEffect(() => {
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(".preview pre"));
    if (blocks.length === 0) return;
    const cleanups: Array<() => void> = [];
    blocks.forEach((pre) => {
      if (pre.querySelector(".code-copy-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "code-copy-btn"; btn.textContent = "复制";
      const onClick = async (ev: MouseEvent) => {
        ev.stopPropagation();
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = "已复制";
          window.setTimeout(() => { btn.textContent = "复制"; }, 1200);
        } catch (error) { console.error("Copy failed", error); }
      };
      btn.addEventListener("click", onClick);
      pre.appendChild(btn);
      cleanups.push(() => { btn.removeEventListener("click", onClick); btn.remove(); });
    });
    return () => cleanups.forEach((fn) => fn());
  }, [previewHtml, editorMode]);

  // ── Sidebar resize ────────────────────────────────────────────────────────
  const startSidebarResize = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + (ev.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  // ── Scroll sync (content-aware anchor interpolation) ─────────────────────

  const rebuildScrollAnchors = useCallback(() => {
    const view = editorViewRef.current;
    const srcScroller = sourceScrollRef.current;
    const prevScroller = previewScrollRef.current;
    if (!view || !srcScroller || !prevScroller) { scrollAnchorsRef.current = []; return; }

    const markdown = draftRef.current.markdown;
    const lines = markdown.split("\n");
    const prevContentTop = prevScroller.getBoundingClientRect().top - prevScroller.scrollTop;
    let anchorLines: number[] = [];
    let anchorPreviewYs: number[] = [];

    const blockLines = getBlockStartLines(markdown);
    const previewBody = prevScroller.querySelector(".preview-body");
    const previewBlocks = previewBody ? (Array.from(previewBody.children) as HTMLElement[]) : [];
    if (blockLines.length > 0 && previewBlocks.length === blockLines.length) {
      anchorLines = blockLines;
      anchorPreviewYs = previewBlocks.map((b) => b.getBoundingClientRect().top - prevContentTop);
    } else {
      const norm = (s: string) => s.replace(/[*_`~]/g, "").trim();
      const previewHeads = (
        Array.from(prevScroller.querySelectorAll("h1:not(.preview-document-title), h2, h3, h4, h5, h6")) as HTMLElement[]
      ).map((h) => ({ text: norm(h.textContent || ""), y: h.getBoundingClientRect().top - prevContentTop }));
      const sourceHeads: { line: number; text: string }[] = [];
      let inFence = false;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^(```|~~~)/.test(l)) { inFence = !inFence; continue; }
        if (inFence) continue;
        if (/^#{1,6}\s/.test(l)) { sourceHeads.push({ line: i, text: norm(l.replace(/^#{1,6}\s+/, "").replace(/\s+#+\s*$/, "")) }); continue; }
        const next = lines[i + 1]?.trim();
        if (l && next && (/^=+$/.test(next) || (/^-+$/.test(next) && !/^[-*>|]/.test(l)))) {
          sourceHeads.push({ line: i, text: norm(l) }); i += 1;
        }
      }
      let si = 0;
      for (const ph of previewHeads) {
        let sj = si;
        while (sj < sourceHeads.length && sourceHeads[sj].text !== ph.text) sj++;
        if (sj < sourceHeads.length) { anchorLines.push(sourceHeads[sj].line); anchorPreviewYs.push(ph.y); si = sj + 1; }
      }
    }

    const yByLine = new Map<number, number>();
    const editorTop = view.dom.getBoundingClientRect().top
      - srcScroller.getBoundingClientRect().top
      + srcScroller.scrollTop;
    for (const zeroBasedLine of anchorLines) {
      const lineNumber = Math.min(view.state.doc.lines, Math.max(1, zeroBasedLine + 1));
      const position = view.state.doc.line(lineNumber).from;
      yByLine.set(zeroBasedLine, editorTop + view.lineBlockAt(position).top);
    }

    const anchors: Array<{ src: number; prev: number }> = [{ src: 0, prev: 0 }];
    for (let k = 0; k < anchorLines.length; k++) {
      const y = yByLine.get(anchorLines[k]);
      if (y != null) anchors.push({ src: y, prev: anchorPreviewYs[k] });
    }
    anchors.push({ src: srcScroller.scrollHeight - srcScroller.clientHeight, prev: prevScroller.scrollHeight - prevScroller.clientHeight });
    scrollAnchorsRef.current = anchors.filter((a, i, arr) => i === 0 || (a.src > arr[i - 1].src && a.prev >= arr[i - 1].prev));
  }, []);

  const syncScroll = useCallback((from: "source" | "preview") => {
    if (ignoreScrollRef.current[from]) { ignoreScrollRef.current[from] = false; return; }
    const src = sourceScrollRef.current; const prev = previewScrollRef.current;
    if (!src || !prev) return;
    const lead = from === "source" ? src : prev;
    const follow = from === "source" ? prev : src;
    const followKey: "source" | "preview" = from === "source" ? "preview" : "source";
    const leadField: "src" | "prev" = from === "source" ? "src" : "prev";
    const followField: "src" | "prev" = from === "source" ? "prev" : "src";
    const leadPos = lead.scrollTop;
    const anchors = scrollAnchorsRef.current;
    let target: number;
    if (anchors.length >= 2) {
      let i = 0;
      while (i < anchors.length - 2 && anchors[i + 1][leadField] <= leadPos) i++;
      const a = anchors[i]; const b = anchors[i + 1];
      const span = b[leadField] - a[leadField] || 1;
      const frac = Math.min(1, Math.max(0, (leadPos - a[leadField]) / span));
      target = a[followField] + frac * (b[followField] - a[followField]);
    } else {
      const leadMax = lead.scrollHeight - lead.clientHeight;
      const followMax = follow.scrollHeight - follow.clientHeight;
      if (leadMax <= 0) return;
      target = (leadPos / leadMax) * followMax;
    }
    if (Math.abs(follow.scrollTop - target) < 1) return;
    ignoreScrollRef.current[followKey] = true;
    follow.scrollTop = target;
  }, []);

  useEffect(() => {
    if (editorMode !== "split") return;
    const id = window.setTimeout(() => rebuildScrollAnchors(), 120);
    const onResize = () => rebuildScrollAnchors();
    window.addEventListener("resize", onResize);
    return () => { window.clearTimeout(id); window.removeEventListener("resize", onResize); };
  }, [previewHtml, editorMode, rebuildScrollAnchors]);

  // Preview → split: align source scroll to where the user was reading.
  useEffect(() => {
    if (editorMode !== "split") return;
    const saved = pendingPreviewScrollRef.current;
    if (saved == null) return;
    pendingPreviewScrollRef.current = null;
    const id = window.setTimeout(() => {
      rebuildScrollAnchors();
      const prev = previewScrollRef.current;
      const src = sourceScrollRef.current;
      if (!prev || !src) return;
      prev.scrollTop = saved;
      ignoreScrollRef.current.source = true;
      syncScroll("preview");
    }, 120);
    return () => window.clearTimeout(id);
  }, [editorMode, rebuildScrollAnchors, syncScroll]);

  // ── Theme helpers ──────────────────────────────────────────────────────────
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "dark" ? MoonStar : SunMoon;
  const cycleTheme = () => {
    const next = themeCycle[(themeCycle.indexOf(themeMode) + 1) % themeCycle.length];
    themeService.setMode(next); setThemeMode(next);
  };
  const updateLocalePreference = (pref: LocalePref) => {
    setLocalePreference(pref);
  };

  const checkForUpdates = async () => {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateToast("正在检查更新…");

    try {
      const update = await updateService.check();
      if (!update) {
        setUpdateToast("已是最新版本");
        window.setTimeout(() => setUpdateToast(null), 2500);
        return;
      }

      setUpdateToast(null);
      const notes = update.body?.trim();
      const shouldInstall = await confirm(
        `发现新版本 ${update.version}。${notes ? `\n\n${notes.slice(0, 500)}` : ""}\n\n安装完成后应用会自动重启。`,
        {
          title: "发现新版本",
          kind: "info",
          okLabel: "更新并重启",
          cancelLabel: "稍后",
        },
      );
      if (!shouldInstall) return;

      setUpdateToast("正在下载更新…");
      await updateService.downloadAndInstall(update, ({ percent }) => {
        setUpdateToast(percent == null ? "正在下载更新…" : `正在下载更新… ${percent}%`);
      });
      setUpdateToast("更新完成，正在重启…");
      await updateService.relaunch();
    } catch (error) {
      console.error("Update failed:", error);
      const detail = String(error).toLowerCase();
      const isLocalBuild = detail.includes("endpoint") || detail.includes("configuration");
      setUpdateToast(isLocalBuild ? "当前版本未连接 GitHub 更新源" : "检查更新失败，请稍后重试");
      window.setTimeout(() => setUpdateToast(null), 4000);
    } finally {
      setUpdateBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <div className="flex h-full min-h-0 w-full">

        {/* ── Sidebar: collapses completely, matching the native window chrome. */}
        <aside
          style={{ width: sidebarWidth }}
          className={cn(
            "relative flex h-full shrink-0 flex-col select-none overflow-hidden border-r border-border/35 bg-sidebar",
            sidebarCollapsed && "hidden",
          )}
        >
          {/* Traffic lights and sidebar control stay on the same row. */}
          <div className="flex h-[52px] shrink-0 items-center border-b border-border/15">
            {/* Keep the native traffic-light hit area completely free of web drag layers. */}
            <div className="w-[78px] shrink-0 self-stretch" aria-hidden />
            <button
              data-tauri-drag-region="false"
              type="button"
              title="收起侧边栏"
              onClick={() => setSidebarCollapsed(true)}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-accent/50 hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
            <div className="flex-1 self-stretch" data-tauri-drag-region />
          </div>

          {!sidebarCollapsed && (
            <>
            {/* Sidebar resize handle */}
            <div
              onMouseDown={startSidebarResize}
              title="拖动调整侧边栏宽度"
              className="absolute right-0 top-0 z-30 h-full w-1.5 cursor-col-resize hover:bg-border/70 active:bg-border/90 transition-colors"
            />

            {/* Product name follows the ChatGPT sidebar title placement. */}
            <div className="flex h-11 shrink-0 items-center px-3.5">
              <span className="truncate text-[18px] font-semibold tracking-[-0.02em] text-sidebar-foreground/90">
                MiniMarkdown
              </span>
            </div>

            {/* Controls row: section, search and new document. */}
            <div className="flex items-center gap-0.5 px-2.5 pb-2">
              <button
                type="button"
                title={sidebarMode === "outline" ? "切换为文稿" : "切换为大纲"}
                onClick={() => setSidebarMode((v) => (v === "outline" ? "documents" : "outline"))}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground/70 hover:bg-accent/40 hover:text-foreground transition"
              >
                {sidebarMode === "outline"
                  ? <><AlignLeft className="size-3.5" /><span>大纲</span></>
                  : <><BookOpen className="size-3.5" /><span>文稿</span></>}
              </button>
              <div className="flex-1" />
              <button
                type="button" title="搜索文档"
                onClick={() => setSidebarSearchVisible((v) => !v)}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent/40 hover:text-foreground transition",
                  sidebarSearchVisible && "bg-accent/50 text-foreground",
                )}
              >
                <Search className="size-3.5" />
              </button>
              <button
                type="button" title="新建文档 (⌘N)"
                onClick={() => void newDocument()}
                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent/40 hover:text-foreground transition"
              >
                <FilePlus className="size-3.5" />
              </button>
            </div>

            {sidebarSearchVisible && (
              <div className="px-2.5 pb-2">
                <input
                  type="search" value={sidebarSearch} autoFocus
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="搜索文档名称…"
                  className="w-full rounded-md border border-border/55 bg-card/40 px-2.5 py-1 text-[11px] outline-none placeholder:text-muted-foreground/40 focus:border-border"
                />
              </div>
            )}

            {/* Main list area */}
            <div className="mt-1 min-h-0 flex-1 overflow-auto px-2 no-scrollbar">
              <div key={sidebarMode} className="flex flex-col gap-px">
                {sidebarMode === "documents" ? (
                  <>
                    {/* ── Editing: current doc card floats to top ────────────── */}
                    {currentDocVisible && (
                      <div className="rounded-md border border-border/65 bg-card/80 px-2.5 py-1.5 mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="text-[12px] font-medium leading-snug truncate flex-1">
                            {draft.title.trim() || t("documents.untitled")}
                          </div>
                          <span className="shrink-0 text-[9px] text-muted-foreground/45 border border-border/35 rounded px-1 py-0.5 leading-none select-none">
                            未保存
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground/50">
                          {lastSavedAt ? formatTimestamp(lastSavedAt, locale) : "从未保存"}
                        </span>
                      </div>
                    )}

                    {/* ── File list (current file highlighted when just viewing) ─ */}
                    {filteredRecent.length > 0 && filteredRecent.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => void openFile(file.path)}
                        className={cn(
                          "rounded-md border px-2.5 py-1.5 cursor-pointer transition",
                          filePath === file.path && !isDirty
                            ? "border-border/65 bg-card/80"
                            : "border-transparent hover:border-border/45 hover:bg-card/55",
                        )}
                      >
                        <div className="text-[12px] font-medium leading-snug truncate">
                          {file.title}
                        </div>
                        <span className="text-[10px] text-muted-foreground/55">
                          {formatTimestamp(file.time, locale)}
                        </span>
                      </div>
                    ))}

                    {/* ── Empty state ────────────────────────────────────────── */}
                    {!currentDocVisible && filteredRecent.length === 0 && (
                      <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/50 select-none">
                        没有最近文稿
                      </p>
                    )}
                  </>
                ) : headings.length > 0 ? (
                  headings.map((heading) => (
                    <button
                      key={heading.id} type="button"
                      onClick={() => {
                        setActiveHeadingId(heading.id);
                        const byId = document.getElementById(heading.id);
                        if (byId) { byId.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
                        const editorHeadings = Array.from(document.querySelectorAll(".wysiwyg h1,.wysiwyg h2,.wysiwyg h3,.wysiwyg h4,.wysiwyg h5,.wysiwyg h6"));
                        editorHeadings.find((h) => h.textContent?.trim() === heading.text)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className={cn(
                        "rounded-sm px-2 py-1 text-left text-[12px] leading-[1.5] text-muted-foreground/90 transition hover:text-foreground hover:underline",
                        visibleHeadingId === heading.id && "bg-accent/50 text-foreground",
                        heading.level === 1 && "font-medium text-foreground/80",
                        heading.level > 1 && "pl-4",
                        heading.level > 2 && "pl-7",
                        heading.level > 3 && "pl-10",
                      )}
                    >
                      {heading.text}
                    </button>
                  ))
                ) : (
                  <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/50 select-none">
                    {t("documents.noOutline")}
                  </p>
                )}
              </div>
            </div>

            {/* Sidebar bottom */}
            <div className="px-3 pb-3 pt-1 shrink-0">
              <div className="flex items-center gap-2.5">

                {/* Left: settings + theme icons */}
                <div className="relative" ref={settingsRef}>
                  <button type="button" title="设置"
                    onClick={() => setSettingsOpen((v) => !v)}
                    className="text-muted-foreground/40 hover:text-foreground transition">
                    <Settings className="size-3.5" />
                  </button>
                  {settingsOpen && (
                    <div className="absolute bottom-full left-0 mb-1.5 w-52 rounded-lg border border-border/55 bg-card/95 shadow-lg backdrop-blur-xl py-2 z-50">

                      {/* ── 语言 ─────────────────────────────────── */}
                      <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">语言</p>
                      {(
                        [["system", "跟随系统"], ["zh-CN", "中文"], ["en", "English"]] as [LocalePref, string][]
                      ).map(([val, label]) => (
                        <button key={val} type="button"
                          onClick={() => updateLocalePreference(val)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-accent/50 transition">
                          <span className={cn(
                            "size-1.5 rounded-full shrink-0 transition-colors",
                            localePreference === val ? "bg-foreground/80" : "border border-border/60",
                          )} />
                          <span className={cn(
                            "transition-colors",
                            localePreference === val ? "text-foreground font-medium" : "text-foreground/60",
                          )}>{label}</span>
                        </button>
                      ))}

                      <div className="my-1.5 mx-3 border-t border-border/25" />

                      {/* ── 自动保存 ─────────────────────────────── */}
                      <p className="px-3 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">自动保存</p>
                      <div className="flex items-center gap-2 px-3 py-1.5">
                        <span className="flex-1 text-[11px] text-foreground/70">自动保存</span>
                        <button type="button"
                          onClick={() => {
                            const next = !autoSaveEnabled;
                            setAutoSaveEnabled(next);
                            localStorage.setItem(AUTOSAVE_KEY, String(next));
                          }}
                          className={cn(
                            "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
                            autoSaveEnabled ? "bg-foreground/70" : "bg-border/50",
                          )}>
                          <span className={cn(
                            "absolute size-3 rounded-full bg-background shadow transition-transform",
                            autoSaveEnabled ? "translate-x-3.5" : "translate-x-0.5",
                          )} />
                        </button>
                      </div>
                      {autoSaveEnabled && (
                        <div className="flex items-center gap-2 px-3 pb-1.5">
                          <span className="flex-1 text-[10px] text-muted-foreground/60">保存间隔</span>
                          <select
                            value={autoSaveIntervalSec}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setAutoSaveIntervalSec(v);
                              localStorage.setItem(AUTOSAVE_INTERVAL_KEY, String(v));
                            }}
                            className="rounded border border-border/40 bg-card px-1.5 py-0.5 text-[10px] text-foreground/70 outline-none cursor-pointer"
                          >
                            <option value={30}>30 秒</option>
                            <option value={60}>1 分钟</option>
                            <option value={180}>3 分钟</option>
                            <option value={300}>5 分钟</option>
                          </select>
                        </div>
                      )}

                    </div>
                  )}
                </div>

                <button type="button" title={t("actions.theme")} onClick={cycleTheme}
                  className="text-muted-foreground/40 hover:text-foreground transition">
                  <ThemeIcon className="size-3.5" />
                </button>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Right: check update + version */}
                <button
                  type="button"
                  title="检查更新"
                  onClick={() => void checkForUpdates()}
                  disabled={updateBusy}
                  className="text-[10px] text-muted-foreground/35 hover:text-muted-foreground/70 transition select-none disabled:cursor-wait disabled:opacity-60"
                >
                  {updateBusy ? "检查中…" : "检查更新"}
                </button>
                <span className="text-[10px] text-muted-foreground/25 select-none">
                  v{appVersion}
                </span>

              </div>
            </div>

            {/* Update toast */}
            {updateToast && (
              <div className="absolute bottom-10 right-3 z-50 rounded-full border border-border/40 bg-card/95 px-3 py-1 text-[11px] text-foreground/70 shadow backdrop-blur-xl pointer-events-none select-none">
                {updateToast}
              </div>
            )}
            </>
          )}
        </aside>

        {/* ── Main card ──────────────────────────────────────────────────────── */}
        <main className="flex flex-1 h-full min-w-0 min-h-0 flex-col overflow-hidden bg-background">

          {/* Top bar */}
          <div
            className="relative flex h-[52px] shrink-0 items-center gap-1 border-b border-border/15 px-2.5"
          >
            {sidebarCollapsed && (
              <>
                {/* Native traffic lights own this area; no web drag layer may cover it. */}
                <div className="w-16 shrink-0 self-stretch" aria-hidden />
                <button
                  data-tauri-drag-region="false"
                  type="button"
                  title="展开侧边栏"
                  onClick={() => setSidebarCollapsed(false)}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition hover:bg-accent/50 hover:text-foreground"
                >
                  <PanelLeftOpen className="size-4" />
                </button>
                <div className="mx-1.5 h-5 w-px shrink-0 bg-border/30" />
              </>
            )}

            {toolbarVisible && editorMode !== "preview" && (
              <MarkdownSourceToolbar
                viewRef={editorViewRef}
              />
            )}
            <div data-tauri-drag-region className="min-w-0 flex-1 self-stretch" />

            {/* Group 1: toolbar visibility */}
            <div data-tauri-drag-region="false" className="flex items-center rounded-md border border-border/35 bg-card/35 p-0.5">
              <button type="button"
                title={toolbarVisible ? "隐藏工具栏" : "显示工具栏"}
                onClick={() => setToolbarVisible((v) => !v)}
                className={cn("inline-flex size-6 items-center justify-center rounded text-muted-foreground/65 transition hover:bg-accent/55 hover:text-foreground", toolbarVisible && "bg-accent/55 text-foreground")}>
                <SlidersHorizontal className="size-3.5" />
              </button>
            </div>

            {/* Group 2: direct text mode switching */}
            <div data-tauri-drag-region="false" className="flex items-center rounded-md border border-border/35 bg-card/35 p-0.5">
              {([
                ["source", t("editor.sourceModeShort")],
                ["split", t("editor.splitModeShort")],
                ["live", t("editor.liveModeShort")],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  title={t(`editor.${mode}Mode`)}
                  onClick={() => selectEditingMode(mode)}
                  className={cn(
                    "h-6 rounded px-2 text-[11px] font-medium text-muted-foreground/65 transition hover:bg-accent/55 hover:text-foreground",
                    editorMode === mode && "bg-accent/70 text-foreground shadow-sm",
                  )}
                >
                  {label}
                </button>
              ))}
              <div className="mx-0.5 h-3 w-px bg-border/40" />
              <button
                type="button"
                title={editorMode === "preview" ? t("editor.backToEditing") : t("editor.readingMode")}
                onClick={toggleReadingMode}
                className={cn(
                  "h-6 rounded px-2 text-[11px] font-medium text-muted-foreground/65 transition hover:bg-accent/55 hover:text-foreground",
                  editorMode === "preview" && "bg-accent/70 text-foreground shadow-sm",
                )}
              >
                {t("editor.readingModeShort")}
              </button>
            </div>

            {/* Group 3: search and file actions at the far right */}
            <div data-tauri-drag-region="false" className="flex items-center rounded-md border border-border/35 bg-card/35 p-0.5">
              <button type="button"
                title="查找 / 替换 (⌘F)"
                onClick={() => (docSearchOpen ? closeSearch() : openSearch())}
                className={cn("inline-flex size-6 items-center justify-center rounded text-muted-foreground/65 transition hover:bg-accent/55 hover:text-foreground", docSearchOpen && "bg-accent/60 text-foreground")}>
                <Search className="size-3.5" />
              </button>
              <div ref={folderRef}
                onMouseEnter={openFolderMenu} onMouseLeave={scheduleCloseFolderMenu}>
                <button type="button" title="文件操作"
                  onClick={openFolderMenu}
                  className={cn("inline-flex size-6 items-center justify-center rounded text-muted-foreground/65 transition hover:bg-accent/55 hover:text-foreground", openFileExpanded && "bg-accent/60 text-foreground")}>
                  <FolderOpen className="size-3.5" />
                </button>
              </div>
            </div>

            {/* Anchored popovers */}
            {docSearchOpen && (
              <div data-tauri-drag-region="false" className="absolute right-0 top-full z-50 mt-1">
                <DocumentSearch
                  query={findQuery} onQueryChange={(q) => { setFindQuery(q); setFindIndex(0); }}
                  current={findIndex} onCurrentChange={setFindIndex}
                  matches={findMatches}
                  viewRef={editorViewRef}
                  onClose={closeSearch}
                />
              </div>
            )}
            {openFileExpanded && (
              <div
                ref={folderMenuRef}
                data-tauri-drag-region="false"
                onMouseEnter={openFolderMenu} onMouseLeave={scheduleCloseFolderMenu}
                className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-border/55 bg-card/95 shadow-lg backdrop-blur-xl py-1.5"
              >
                <button data-tauri-drag-region="false" type="button"
                  onClick={() => { void newDocument(); setOpenFileExpanded(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-accent/50 hover:text-foreground transition">
                  <FilePlus className="size-3 shrink-0" />新建文档
                </button>
                <button data-tauri-drag-region="false" type="button"
                  onClick={() => { void openFile(); setOpenFileExpanded(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-accent/50 hover:text-foreground transition">
                  <FolderOpen className="size-3 shrink-0" />打开文件…
                </button>

                <div className="my-1 border-t border-border/30" />

                <button data-tauri-drag-region="false" type="button"
                  onClick={() => { void saveFile(); setOpenFileExpanded(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-foreground/80 hover:bg-accent/50 hover:text-foreground transition">
                  <Download className="size-3 shrink-0" />保存 (⌘S)
                </button>
                <button data-tauri-drag-region="false" type="button"
                  onClick={() => { void saveFileAs(); setOpenFileExpanded(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition">
                  <Download className="size-3 shrink-0" />另存为…
                </button>

                <div className="my-1 border-t border-border/30" />

                <button data-tauri-drag-region="false" type="button"
                  onClick={() => { void exportHtml(); setOpenFileExpanded(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-accent/50 hover:text-foreground transition">
                  <Download className="size-3 shrink-0" />{t("actions.exportHtml")}
                </button>

                <div className="my-1 border-t border-border/30" />

                <button data-tauri-drag-region="false" type="button"
                  onClick={() => { void deleteDocument(); setOpenFileExpanded(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-destructive/70 hover:bg-destructive/10 hover:text-destructive transition">
                  <Trash2 className="size-3 shrink-0" />删除文档
                </button>
              </div>
            )}
          </div>

          {/* Editor panels */}
          <section className="flex min-h-0 flex-1 overflow-hidden">
                <article className={cn(
                  "relative flex flex-1 h-full min-h-0 flex-col overflow-hidden",
                  editorMode === "preview" && "hidden",
                )}>
                  <span className="absolute top-3 left-4 text-[10px] text-muted-foreground/25 select-none pointer-events-none z-10">
                    {editorMode === "split" ? t("editor.markdownHint") : editorMode === "live" ? t("editor.liveMode") : t("editor.sourceMode")}
                  </span>
                  <div ref={sourceScrollRef} onScroll={() => syncScroll("source")}
                    className="min-h-0 flex-1 overflow-auto px-7 pt-10 pb-6 panel-scrollbar">
                    <div className="mx-auto max-w-[42rem]">
                      <input ref={titleInputRef} value={draft.title}
                        onChange={(e) => setDraft((c) => ({ ...c, title: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            editorViewRef.current?.focus();
                          }
                        }}
                        className="mb-3 w-full select-text bg-transparent text-[clamp(24px,3vw,34px)] font-bold leading-[1.18] tracking-tight outline-none placeholder:text-foreground/20"
                        placeholder={t("documents.untitled")}
                      />
                      <MarkdownEditor
                        value={draft.markdown}
                        onChange={(next) => setDraft((c) => ({ ...c, markdown: next }))}
                        placeholder={t("editor.placeholder")}
                        viewRef={editorViewRef}
                        mode={editorMode}
                        documentSession={documentSession}
                        documentPath={filePath}
                      />
                    </div>
                  </div>
                </article>
                <div className={cn("w-px bg-border/25 shrink-0", editorMode !== "split" && "hidden")} />
                <article className={cn(
                  "relative flex flex-1 h-full min-h-0 flex-col overflow-hidden",
                  editorMode !== "split" && editorMode !== "preview" && "hidden",
                )}>
                  {editorMode === "split" && (
                    <span className="absolute top-3 left-4 text-[10px] text-muted-foreground/25 select-none pointer-events-none z-10">预览</span>
                  )}
                  <div ref={previewScrollRef} onScroll={() => syncScroll("preview")}
                    className={cn(
                      "preview min-h-0 flex-1 overflow-auto select-text panel-scrollbar",
                      editorMode === "split" ? "px-7 pt-10 pb-6" : "px-10 py-8",
                    )}>
                    <div className="mx-auto max-w-[42rem]">
                      <h1 className={cn("preview-document-title", !draft.title.trim() && "text-foreground/20")}>{effectiveTitle}</h1>
                      <div className="preview-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    </div>
                  </div>
                </article>
          </section>

          {/* Footer */}
          <footer className="flex items-center justify-end gap-1.5 px-4 py-1 text-[9px] text-muted-foreground/40 select-none shrink-0">
            {isDirty ? (
              <span className="text-muted-foreground/60">未保存</span>
            ) : lastSavedAt ? (
              <span>已保存 {formatTimestamp(lastSavedAt, locale)}</span>
            ) : null}
            {(isDirty || lastSavedAt) && <span className="opacity-50">·</span>}
            <span>{draft.markdown.trim().length} {t("metrics.characters")}</span>
            <span className="opacity-50">·</span>
            <span>{Math.max(1, Math.ceil(draft.markdown.trim().length / 300))} {t("metrics.readMinutes")}</span>
          </footer>
        </main>
      </div>

      {/* ── 脏态确认弹窗 ─────────────────────────────────────────────────────── */}
      {dirtyResolve && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-80 rounded-xl border border-border/55 bg-card/95 shadow-2xl backdrop-blur-xl px-5 pt-5 pb-4">
            <p className="text-[13px] font-semibold mb-1 text-foreground/90">
              是否保存对「{draft.title.trim() || "未命名文档"}」的修改？
            </p>
            <p className="text-[11px] text-muted-foreground/70 mb-5 leading-relaxed">
              选择“不保存”只会放弃本次修改，不会删除磁盘中的原文件。
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => resolveDirty("discard")}
                className="px-3 py-1.5 text-[11px] rounded-md border border-destructive/40 text-destructive/80 hover:bg-destructive/10 hover:border-destructive/70 hover:text-destructive transition">
                不保存
              </button>
              <div className="flex-1" />
              <button type="button" onClick={() => resolveDirty("cancel")}
                className="px-3 py-1.5 text-[11px] rounded-md border border-border/55 text-muted-foreground hover:bg-accent/40 transition">
                取消
              </button>
              <button type="button" onClick={() => resolveDirty("save")}
                className="px-3 py-1.5 text-[11px] rounded-md bg-foreground text-background hover:opacity-90 transition font-medium">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 保存成功 toast ───────────────────────────────────────────────────── */}
      <div className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none",
        "px-4 py-2 rounded-full border border-border/40 bg-card/95 shadow-lg backdrop-blur-xl",
        "text-[12px] font-medium text-foreground/80 select-none",
        "transition-all duration-300",
        saveToast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}>
        已保存
      </div>

      {recoveryToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border/40 bg-card/95 px-4 py-2 text-[12px] font-medium text-foreground/80 shadow-lg backdrop-blur-xl pointer-events-none select-none">
          已恢复上次未保存的内容
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stemOf(filePath: string): string {
  return (filePath.split("/").pop() ?? "").replace(/\.(md|markdown|txt)$/i, "");
}

function sanitizeFilename(title: string): string {
  return (
    title.replace(/[/\\:*?"<>|]/g, "-").replace(/\.+$/, "").replace(/\s+/g, " ").trim().slice(0, 100)
    || "未命名文档"
  );
}

function formatTimestamp(value: string | null | undefined, locale: AppLocale) {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

function normalizeMarkdownBody(markdown: string, title: string) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return markdown;
  const match = markdown.match(/^#\s+(.+?)\s*(?:\n+|$)/);
  if (!match || match[1].trim() !== trimmedTitle) return markdown;
  return markdown.slice(match[0].length).replace(/^\n+/, "");
}

function computeMatches(text: string, query: string): number[] {
  if (!query) return [];
  const res: number[] = [];
  const hay = text.toLowerCase();
  const needle = query.toLowerCase();
  let i = hay.indexOf(needle);
  while (i !== -1) { res.push(i); i = hay.indexOf(needle, i + Math.max(1, needle.length)); }
  return res;
}
