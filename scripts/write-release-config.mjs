import { writeFile } from "node:fs/promises";
import process from "node:process";

const repository = process.env.GITHUB_REPOSITORY?.trim();

if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
  throw new Error("GITHUB_REPOSITORY is missing or invalid");
}

const endpoint = `https://github.com/${repository}/releases/latest/download/latest.json`;
const config = {
  bundle: {
    createUpdaterArtifacts: true,
  },
  plugins: {
    updater: {
      endpoints: [endpoint],
    },
  },
};

await writeFile(
  new URL("../src-tauri/tauri.release.conf.json", import.meta.url),
  `${JSON.stringify(config, null, 2)}\n`,
  "utf8",
);

console.log(`Release updater endpoint configured for ${repository}`);
