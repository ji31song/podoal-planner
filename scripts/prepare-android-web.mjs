import { cp, mkdir, rm } from "node:fs/promises";

const files = [
  "index.html",
  "firebase-config.js",
  "manifest.json",
  "icon.svg",
  "privacy.html",
  "terms.html",
  "delete-account.html",
  "support.html"
];

await rm("www", { recursive: true, force: true });
await mkdir("www", { recursive: true });

for (const file of files) {
  await cp(file, `www/${file}`);
}

console.log(`Android web files prepared: ${files.length}`);
