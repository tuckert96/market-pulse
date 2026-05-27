import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const roots = ["src", "scripts", "test"];
const files = roots.flatMap((root) => listJs(root));

for (const file of files) {
  execFileSync("node", ["--check", file], { stdio: "inherit" });
}

console.log(`Checked ${files.length} JavaScript files.`);

function listJs(path) {
  try {
    const stat = statSync(path);
    if (stat.isFile()) return path.endsWith(".js") ? [path] : [];
    return readdirSync(path).flatMap((entry) => listJs(join(path, entry)));
  } catch {
    return [];
  }
}
