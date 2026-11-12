import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "projects.js",
  "links.js",
  "sync-config.js",
  "legacy/index.html",
  "legacy/styles.css",
  "legacy/app.js",
  "assets/dashboard-icon-3.png",
];
const assets = {};
for (const name of files) {
  const b = await readFile(name);
  assets["/" + name] = {
    body: b.toString("base64"),
    type: name.endsWith(".png")
      ? "image/png"
      : name.endsWith(".css")
        ? "text/css; charset=utf-8"
        : name.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : "text/html; charset=utf-8",
  };
}
await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const source = await readFile("worker/index.js", "utf8");
const projects = await readFile("projects.js", "utf8");
await writeFile(
  "dist/server/index.js",
  source.replace("import {projects} from '../projects.js';", projects) +
    `\nconst ASSETS=${JSON.stringify(assets)};\n`,
);
await writeFile(
  "dist/.openai/hosting.json",
  await readFile(".openai/hosting.json"),
);
console.log("Built Worker and " + files.length + " embedded assets.");
