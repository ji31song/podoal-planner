import { cp, mkdir, rm } from "node:fs/promises";

const outputDir = "policy-site";
const policyFiles = [
  "privacy.html",
  "terms.html",
  "delete-account.html",
  "support.html",
];

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp("policy-index.html", `${outputDir}/index.html`);

for (const file of policyFiles) {
  await cp(file, `${outputDir}/${file}`);
}

console.log(`Policy site prepared: ${policyFiles.length + 1} files`);
