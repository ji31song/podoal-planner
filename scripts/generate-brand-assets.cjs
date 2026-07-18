const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const storeDir = path.join(root, "store-assets");
const resDir = path.join(root, "android", "app", "src", "main", "res");
const sourcePath = process.argv[2] || path.join(storeDir, "icon-source.png");
fs.mkdirSync(storeDir, { recursive: true });

const IVORY = "#FFFFFF";
const GRAPE = "#8E62AC";
const INK = "#3F372F";

async function transparentMascot(input) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const distanceFromWhite = 255 - Math.min(data[i], data[i + 1], data[i + 2]);
    if (distanceFromWhite <= 5) data[i + 3] = 0;
    else if (distanceFromWhite < 35) data[i + 3] = Math.round(((distanceFromWhite - 5) / 30) * 255);
    else data[i + 3] = 255;
  }

  return sharp(data, { raw: info })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 4 })
    .png()
    .toBuffer();
}

async function mascotLayer(mascot, width, height, scale) {
  return sharp(mascot)
    .resize({ width: Math.round(width * scale), height: Math.round(height * scale), fit: "inside" })
    .png()
    .toBuffer();
}

async function squareIcon(mascot, size, output, scale = 0.86) {
  const layer = await mascotLayer(mascot, size, size, scale);
  const meta = await sharp(layer).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: IVORY } })
    .composite([{ input: layer, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function roundIcon(mascot, size, output) {
  const layer = await mascotLayer(mascot, size, size, 0.78);
  const meta = await sharp(layer).metadata();
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
  await sharp({ create: { width: size, height: size, channels: 4, background: IVORY } })
    .composite([
      { input: layer, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) },
      { input: mask, blend: "dest-in" },
    ])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function adaptiveForeground(mascot, size, output) {
  // Samsung 등 제조사별 아이콘 마스크에서도 잎사귀가 잘리지 않도록
  // 원본 이미지처럼 충분한 흰 여백이 남는 안전 영역 안에 배치한다.
  const layer = await mascotLayer(mascot, size, size, 0.54);
  const meta = await sharp(layer).metadata();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: layer, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function splash(mascot, width, height, output) {
  const layer = await mascotLayer(mascot, width, height, 0.46);
  const meta = await sharp(layer).metadata();
  await sharp({ create: { width, height, channels: 4, background: IVORY } })
    .composite([{ input: layer, left: Math.round((width - meta.width) / 2), top: Math.round((height - meta.height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function featureGraphic(mascot) {
  const width = 1024;
  const height = 500;
  const layer = await mascotLayer(mascot, 430, 430, 0.92);
  const meta = await sharp(layer).metadata();
  const background = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="500" rx="28" fill="${IVORY}"/>
    <circle cx="90" cy="70" r="110" fill="#EFE7F6"/>
    <circle cx="960" cy="445" r="155" fill="#E7EDD4"/>
    <text x="470" y="205" fill="${INK}" font-size="64" font-weight="800" font-family="Malgun Gothic, sans-serif">포도알 플래너</text>
    <text x="474" y="272" fill="#6E655A" font-size="30" font-weight="600" font-family="Malgun Gothic, sans-serif">우리 가족의 하루를 함께 채워요</text>
    <rect x="474" y="315" width="322" height="48" rx="24" fill="${GRAPE}"/>
    <text x="635" y="347" text-anchor="middle" fill="white" font-size="21" font-weight="700" font-family="Malgun Gothic, sans-serif">일정 · 체크리스트 · 포도알 응원</text>
  </svg>`);
  await sharp(background)
    .composite([{ input: layer, left: Math.round(235 - meta.width / 2), top: Math.round(250 - meta.height / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(storeDir, "feature-graphic.png"));
}

(async () => {
  const mascot = await transparentMascot(sourcePath);
  const storedSource = path.join(storeDir, "icon-source.png");
  if (path.resolve(sourcePath) !== path.resolve(storedSource)) {
    await sharp(sourcePath).png({ compressionLevel: 9 }).toFile(storedSource);
  }

  await squareIcon(mascot, 512, path.join(storeDir, "store-icon.png"));
  await squareIcon(mascot, 512, path.join(root, "icon-512.png"));
  await squareIcon(mascot, 192, path.join(root, "icon-192.png"));
  await featureGraphic(mascot);

  const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(launcherSizes)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    await squareIcon(mascot, size, path.join(dir, "ic_launcher.png"), 0.82);
    await roundIcon(mascot, size, path.join(dir, "ic_launcher_round.png"));
    await adaptiveForeground(mascot, Math.round(size * 2.25), path.join(dir, "ic_launcher_foreground.png"));
  }

  const splashSizes = {
    "drawable": [480, 320],
    "drawable-land-mdpi": [480, 320],
    "drawable-land-hdpi": [800, 480],
    "drawable-land-xhdpi": [1280, 720],
    "drawable-land-xxhdpi": [1600, 960],
    "drawable-land-xxxhdpi": [1920, 1280],
    "drawable-port-mdpi": [320, 480],
    "drawable-port-hdpi": [480, 800],
    "drawable-port-xhdpi": [720, 1280],
    "drawable-port-xxhdpi": [960, 1600],
    "drawable-port-xxxhdpi": [1280, 1920],
  };
  for (const [folder, dimensions] of Object.entries(splashSizes)) {
    await splash(mascot, dimensions[0], dimensions[1], path.join(resDir, folder, "splash.png"));
  }
})();
