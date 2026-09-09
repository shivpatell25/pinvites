import path from "node:path";

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
