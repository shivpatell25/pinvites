import path from "node:path";
import { mkdir } from "node:fs/promises";

import sharp from "sharp";

const source = path.resolve("public/brand/pinvites-app-icon.svg");
const outputs = [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
];

await Promise.all(
  outputs.map(([filename, size]) =>
    sharp(source)
      .resize(size, size)
      .png({ compressionLevel: 9, palette: true })
      .toFile(path.resolve("public/brand", filename)),
  ),
);

const emailAssetDirectory = path.resolve("public/brand/hotlink-ok");
await mkdir(emailAssetDirectory, { recursive: true });

await Promise.all([
  sharp(path.resolve("public/brand/pinvites-source.png"))
    .trim()
    .resize({ width: 360, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.resolve(emailAssetDirectory, "pinvites-wordmark-email.png")),
  sharp(path.resolve("public/brand/pinvites-square.png"))
    .trim()
    .resize({ width: 180, height: 180, fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(path.resolve(emailAssetDirectory, "pinvites-mark-email.png")),
]);
