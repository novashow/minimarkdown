import {
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  stat,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { AppDocument, DocumentPatch } from "@/types/document";

export const VAULT_KEY = "minimarkdown-vault-path";

class DocumentRepository {
  private vault = "";

  // ── Initialise with the user's chosen vault folder ──────────────────────────
  async initialize(vaultPath: string) {
    this.vault = normalizePath(vaultPath);
    try {
      await mkdir(this.vault, { recursive: true });
    } catch {
      // folder already exists — ignore
    }
  }

  // ── List all .md files (metadata only, content_markdown is "") ──────────────
  async listDocuments(): Promise<AppDocument[]> {
    const entries = await readDir(this.vault);
    const mdEntries = entries.filter((e) => e.isFile && e.name?.toLowerCase().endsWith(".md"));

    const docs = await Promise.all(
      mdEntries.map(async (entry): Promise<AppDocument | null> => {
        const filePath = `${this.vault}/${entry.name}`;
        try {
          const info = await stat(filePath);
          const title = entry.name!.replace(/\.md$/i, "");
          return {
            id: filePath,
            title,
            content_markdown: "",
            updated_at: mtimeToIso(info.mtime),
          };
        } catch {
          return null;
        }
      }),
    );

    return docs
      .filter((d): d is AppDocument => d !== null)
      .sort(sortDocuments);
  }

  // ── Load the full content of a single document ──────────────────────────────
  async getDocument(id: string): Promise<AppDocument | null> {
    try {
      const [content, info] = await Promise.all([readTextFile(id), stat(id)]);
      const name = id.split("/").pop() ?? "";
      const title = name.replace(/\.md$/i, "");
      return {
        id,
        title,
        content_markdown: content,
        updated_at: mtimeToIso(info.mtime),
      };
    } catch {
      return null;
    }
  }

  // ── Create a new empty document in the vault ─────────────────────────────────
  async createDocument(seed?: { title?: string }): Promise<AppDocument> {
    const baseTitle = seed?.title?.trim() || "未命名文档";
    const filePath = await this.resolveNewPath(baseTitle);
    await writeTextFile(filePath, "");
    const info = await stat(filePath);
    const title = stemOf(filePath);
    return { id: filePath, title, content_markdown: "", updated_at: mtimeToIso(info.mtime) };
  }

  // ── Save changes; renames the file if the title changed ──────────────────────
  async updateDocument(id: string, patch: DocumentPatch): Promise<AppDocument> {
    let filePath = id;

    // Rename file when title changes
    if (patch.title !== undefined) {
      const currentTitle = stemOf(id);
      const newTitle = patch.title.trim() || "未命名文档";
      if (newTitle !== currentTitle) {
        const newPath = await this.resolveNewPath(newTitle, id);
        if (newPath !== filePath) {
          await rename(filePath, newPath);
          filePath = newPath;
        }
      }
    }

    if (patch.content_markdown !== undefined) {
      await writeTextFile(filePath, patch.content_markdown);
    }

    const info = await stat(filePath);
    const title = stemOf(filePath);
    return {
      id: filePath,
      title,
      content_markdown: patch.content_markdown ?? "",
      updated_at: mtimeToIso(info.mtime),
    };
  }

  // ── Delete a document (moves to OS Trash not supported — permanent delete) ──
  async deleteDocument(id: string): Promise<void> {
    await remove(id);
  }

  // ── Import an external .md file into the vault (copies if outside vault) ────
  async importFile(sourcePath: string, content: string): Promise<AppDocument> {
    const normalized = normalizePath(sourcePath);

    // File is already inside the vault — register without copying
    if (normalized.startsWith(this.vault + "/")) {
      const info = await stat(sourcePath);
      const title = stemOf(sourcePath);
      return {
        id: normalized,
        title,
        content_markdown: content,
        updated_at: mtimeToIso(info.mtime),
      };
    }

    // Copy into vault (resolve conflicts if a file with the same name exists)
    const baseTitle = stemOf(sourcePath);
    const targetPath = await this.resolveNewPath(baseTitle);
    await writeTextFile(targetPath, content);
    const info = await stat(targetPath);
    return {
      id: targetPath,
      title: stemOf(targetPath),
      content_markdown: content,
      updated_at: mtimeToIso(info.mtime),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Find a unique path in the vault for the given title.
   *  `excludePath` is the current path when renaming (won't count as a conflict). */
  private async resolveNewPath(title: string, excludePath?: string): Promise<string> {
    const base = sanitizeFilename(title);

    const candidate = (suffix: string) => `${this.vault}/${base}${suffix}.md`;

    const exists = async (p: string): Promise<boolean> => {
      if (excludePath && normalizePath(p) === normalizePath(excludePath)) return false;
      try {
        await stat(p);
        return true;
      } catch {
        return false;
      }
    };

    if (!(await exists(candidate("")))) return candidate("");
    for (let i = 2; i <= 999; i++) {
      const p = candidate(` ${i}`);
      if (!(await exists(p))) return p;
    }
    return candidate(`-${Date.now()}`);
  }
}

// ── Module-level utilities ───────────────────────────────────────────────────

function stemOf(filePath: string): string {
  return (filePath.split("/").pop() ?? "").replace(/\.md$/i, "");
}

function normalizePath(p: string): string {
  return p.replace(/\/+/g, "/").replace(/\/$/, "");
}

function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[/\\:*?"<>|]/g, "-")
      .replace(/\.+$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "未命名文档"
  );
}

function mtimeToIso(mtime: Date | number | null | undefined): string {
  if (!mtime) return new Date().toISOString();
  return new Date(mtime).toISOString();
}

function sortDocuments(a: AppDocument, b: AppDocument): number {
  return b.updated_at.localeCompare(a.updated_at);
}

export const documentRepository = new DocumentRepository();
