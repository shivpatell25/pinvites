import { describe, expect, it } from "vitest";

import { createQrPng, createQrSvg } from "./qr";

describe("QR utilities", () => {
  it("generates real PNG and SVG QR assets", async () => {
    const target = "https://invites.example.test/i/secure-token";
    const [png, svg] = await Promise.all([
      createQrPng(target, { width: 256 }),
      createQrSvg(target, { width: 256 }),
    ]);

    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox=");
  });

  it("rejects executable URL schemes", async () => {
    await expect(createQrPng("javascript:alert(1)")).rejects.toThrow(
      "HTTP or HTTPS",
    );
  });
});
