import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git", ".gradle", ".idea", ".tools", ".vscode", "build", "node_modules", "policy-site", "www",
]);
const checkedExtensions = new Set([
  ".gradle", ".html", ".java", ".js", ".json", ".md", ".mjs", ".properties", ".xml",
]);
const firebaseClientConfigFiles = new Set([
  "firebase-config.js",
  "android/app/google-services.json",
]);
const generatedDirectoryPrefixes = ["android/app/build/", "android/app/src/main/assets/public/"];
const forbiddenPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /"private_key"\s*:/,
  /"client_secret"\s*:/,
  /(?:^|\W)FIREBASE_TOKEN\s*[:=]/m,
  /(?:^|\W)GOOGLE_APPLICATION_CREDENTIALS\s*[:=]/m,
  /(?:^|\W)(?:password|passwd)\s*[:=]\s*["'][^"']+["']/im,
];
const firebaseApiKeyPattern = /AIza[0-9A-Za-z_-]{30,}/;
const failures = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(absolute);
      continue;
    }
    if (!checkedExtensions.has(path.extname(entry.name))) continue;

    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (generatedDirectoryPrefixes.some(prefix => relative.startsWith(prefix))) continue;
    const content = await readFile(absolute, "utf8");
    if (forbiddenPatterns.some(pattern => pattern.test(content))) failures.push(relative);
    if (firebaseApiKeyPattern.test(content) && !firebaseClientConfigFiles.has(relative)) failures.push(relative);
  }
}

await scan(root);
const androidBuild = await readFile(path.join(root, "android/app/build.gradle"), "utf8");
const mainActivity = await readFile(path.join(root, "android/app/src/main/java/com/jisong/podoalplanner/MainActivity.java"), "utf8");
const androidManifest = await readFile(path.join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
if (!androidBuild.includes('applicationId "com.jisong.podoalplanner"')) failures.push("android/app/build.gradle");
if (!androidBuild.includes('namespace = "com.jisong.podoalplanner"')) failures.push("android/app/build.gradle");
if (!mainActivity.includes("package com.jisong.podoalplanner;")) failures.push("android/app/src/main/java/com/jisong/podoalplanner/MainActivity.java");
if (!androidManifest.includes('android:allowBackup="false"')) failures.push("android/app/src/main/AndroidManifest.xml");
if (!androidManifest.includes('android:networkSecurityConfig="@xml/network_security_config"')) failures.push("android/app/src/main/AndroidManifest.xml");
if (!androidBuild.includes('debugImplementation "com.google.firebase:firebase-appcheck-debug:')) failures.push("android/app/build.gradle");
if (mainActivity.includes("DebugAppCheckProviderFactory")) failures.push("android/app/src/main/java/com/jisong/podoalplanner/MainActivity.java");
const uniqueFailures = [...new Set(failures)].sort();
if (uniqueFailures.length) {
  console.error("비밀정보로 의심되는 파일이 있습니다:");
  for (const file of uniqueFailures) console.error(`- ${file}`);
  process.exitCode = 1;
} else {
  console.log("비밀 키, 서비스 계정, 비밀번호 노출 검사를 통과했습니다.");
  console.log("Firebase 클라이언트 설정 파일은 공개 식별자로 분류해 별도로 허용했습니다.");
}
