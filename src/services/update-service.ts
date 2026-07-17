import type { Update } from "@tauri-apps/plugin-updater";

export type UpdateProgress = {
  downloaded: number;
  total: number | null;
  percent: number | null;
};

export type AvailableUpdate = Update;

export const updateService = {
  async check(): Promise<AvailableUpdate | null> {
    const { check } = await import("@tauri-apps/plugin-updater");
    return check({ timeout: 30_000 });
  },

  async download(
    update: AvailableUpdate,
    onProgress: (progress: UpdateProgress) => void,
  ): Promise<void> {
    let downloaded = 0;
    let total: number | null = null;

    await update.download((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
        onProgress({ downloaded, total, percent: total ? 0 : null });
        return;
      }

      if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        onProgress({
          downloaded,
          total,
          percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
        });
        return;
      }

      onProgress({ downloaded: total ?? downloaded, total, percent: 100 });
    });
  },

  async install(update: AvailableUpdate): Promise<void> {
    await update.install();
  },

  async relaunch(): Promise<void> {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  },
};
