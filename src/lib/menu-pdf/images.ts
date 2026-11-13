import "server-only";

import sharp from "sharp";
import { imageUrlToDataUri } from "@/lib/poster/subjects";
import type { MenuPrintBackgroundTreatment } from "@/lib/menu-pdf-config";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_EDGE = 1200;

export async function menuImageToDataUri(
  url: string | null | undefined,
  treatment: MenuPrintBackgroundTreatment
): Promise<string | null> {
  if (treatment !== "cutout") {
    return imageUrlToDataUri(url);
  }
  if (!url || !/^https?:\/\//.test(url)) return null;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const source = Buffer.from(await response.arrayBuffer());
    if (source.byteLength === 0 || source.byteLength > MAX_SOURCE_BYTES) return null;

    const normalized = sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true
      })
      .ensureAlpha();
    const { data, info } = await normalized.raw().toBuffer({ resolveWithObject: true });
    if (info.width < 200 || info.height < 200 || info.channels !== 4) return null;

    const corners = [
      pixelAt(data, info.width, 0, 0),
      pixelAt(data, info.width, info.width - 1, 0),
      pixelAt(data, info.width, 0, info.height - 1),
      pixelAt(data, info.width, info.width - 1, info.height - 1)
    ];
    const background = averageColour(corners);
    const cornerSpread = Math.max(
      ...corners.map((colour) => colourDistance(colour, background))
    );
    // Busy or strongly varying corners are not safe to cut out automatically.
    if (cornerSpread > 55) return imageUrlToDataUri(url);

    for (let index = 0; index < data.length; index += 4) {
      const distance = colourDistance(
        [data[index], data[index + 1], data[index + 2]],
        background
      );
      const mask = distance <= 20
        ? 0
        : distance >= 72
          ? 255
          : Math.round(((distance - 20) / 52) * 255);
      data[index + 3] = Math.min(data[index + 3], mask);
    }

    const png = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 }
    }).png({ compressionLevel: 8 }).toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return imageUrlToDataUri(url);
  }
}

type Rgb = [number, number, number];

function pixelAt(data: Buffer, width: number, x: number, y: number): Rgb {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

function averageColour(colours: Rgb[]): Rgb {
  return [0, 1, 2].map((channel) =>
    Math.round(colours.reduce((sum, colour) => sum + colour[channel], 0) / colours.length)
  ) as Rgb;
}

function colourDistance(first: Rgb, second: Rgb): number {
  return Math.sqrt(
    (first[0] - second[0]) ** 2 +
    (first[1] - second[1]) ** 2 +
    (first[2] - second[2]) ** 2
  );
}
