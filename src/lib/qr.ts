import QRCode from "qrcode";

export interface QrCodeOptions {
  width?: number;
  margin?: number;
  darkColor?: string;
  lightColor?: string;
}

export interface QrCodeDownload {
  body: Buffer;
  headers: Readonly<Record<string, string>>;
}

const DEFAULT_OPTIONS = {
  width: 768,
  margin: 3,
  darkColor: "#171614ff",
  lightColor: "#fffdf9ff",
} as const;

export async function createQrPng(
  target: string,
  options: QrCodeOptions = {},
): Promise<Buffer> {
  const value = qrTarget(target);
  const settings = qrSettings(options);
  return QRCode.toBuffer(value, {
    type: "png",
    errorCorrectionLevel: "Q",
    width: settings.width,
    margin: settings.margin,
    color: {
      dark: settings.darkColor,
      light: settings.lightColor,
    },
  });
}

export async function createQrSvg(
  target: string,
  options: QrCodeOptions = {},
): Promise<string> {
  const value = qrTarget(target);
  const settings = qrSettings(options);
  return QRCode.toString(value, {
    type: "svg",
    errorCorrectionLevel: "Q",
    width: settings.width,
    margin: settings.margin,
    color: {
      dark: settings.darkColor,
      light: settings.lightColor,
    },
  });
}

export async function createQrDownload(
  target: string,
  filename = "invitation-qr.png",
  options: QrCodeOptions = {},
): Promise<QrCodeDownload> {
  return {
    body: await createQrPng(target, options),
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${safePngFilename(filename)}"`,
      // Personalized QR codes may contain invitation tokens and must not be cached publicly.
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  };
}

function qrTarget(value: string): string {
  if (value.length > 4_096) throw new Error("QR target is too long.");

  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new Error("QR target must be an absolute URL.");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("QR target must use HTTP or HTTPS.");
  }
  return target.toString();
}

function qrSettings(options: QrCodeOptions) {
  const width = options.width ?? DEFAULT_OPTIONS.width;
  const margin = options.margin ?? DEFAULT_OPTIONS.margin;
  const darkColor = options.darkColor ?? DEFAULT_OPTIONS.darkColor;
  const lightColor = options.lightColor ?? DEFAULT_OPTIONS.lightColor;

  if (!Number.isInteger(width) || width < 128 || width > 2_048) {
    throw new Error("QR width must be an integer between 128 and 2048 pixels.");
  }
  if (!Number.isInteger(margin) || margin < 0 || margin > 16) {
    throw new Error("QR margin must be an integer between 0 and 16 modules.");
  }
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(darkColor)) {
    throw new Error("QR dark color must be a 6- or 8-digit hex color.");
  }
  if (!/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(lightColor)) {
    throw new Error("QR light color must be a 6- or 8-digit hex color.");
  }

  return { width, margin, darkColor, lightColor };
}

function safePngFilename(value: string): string {
  const withoutExtension = value.replace(/\.png$/i, "");
  const safe = withoutExtension
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safe || "invitation-qr"}.png`;
}
