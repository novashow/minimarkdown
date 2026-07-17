import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const rawVersion = process.env.RELEASE_VERSION?.trim() ?? "";
const version = rawVersion.replace(/^v/i, "");

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid release version: ${rawVersion || "(empty)"}`);
}

const root = new URL("../", import.meta.url);
const packagePath = new URL("package.json", root);
const tauriConfigPath = new URL("src-tauri/tauri.conf.json", root);
const cargoPath = new URL("src-tauri/Cargo.toml", root);

const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
packageJson.version = version;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
tauriConfig.version = version;
await writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, "utf8");

const cargoToml = await readFile(cargoPath, "utf8");
const nextCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/,
  `$1"${version}"`,
);
if (nextCargoToml === cargoToml && !cargoToml.includes(`version = "${version}"`)) {
  throw new Error("Unable to update Cargo.toml package version");
}
await writeFile(cargoPath, nextCargoToml, "utf8");

console.log(`Release version set to ${version}`);
