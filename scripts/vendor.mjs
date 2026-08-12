// 把 node_modules 里的浏览器端依赖复制到 lib/，让页面保持零构建、可离线直开。
// 用法：npm install && npm run vendor
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const assets = [
  { pkg: "marked", from: "lib/marked.umd.js", to: "lib/marked.umd.js" },
  { pkg: "dompurify", from: "dist/purify.min.js", to: "lib/purify.min.js" },
];

await mkdir(resolve(root, "lib"), { recursive: true });

for (const { pkg, from, to } of assets) {
  const pkgDir = resolve(root, "node_modules", pkg);
  const { version } = JSON.parse(await readFile(resolve(pkgDir, "package.json"), "utf8"));
  await copyFile(resolve(pkgDir, from), resolve(root, to));
  console.log(`${to} <- ${pkg}@${version}`);
}
