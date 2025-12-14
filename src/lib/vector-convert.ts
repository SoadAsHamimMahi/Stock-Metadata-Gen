import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

/**
 * Convert a vector file (currently SVG only) into a PNG buffer.
 *
 * Notes:
 * - SVG is supported via `sharp`.
 * - EPS/AI typically require Ghostscript/Illustrator and are not supported here by default.
 *   The caller is expected to handle failures gracefully.
 */
export async function convertVectorToPng(absPath: string): Promise<Buffer> {
  const ext = path.extname(absPath).toLowerCase();
  const data = await fs.readFile(absPath);

  if (ext === '.svg') {
    return await sharp(data).png().toBuffer();
  }

  // EPS/AI are not supported out-of-the-box with sharp in most environments.
  throw new Error(`Vector conversion not supported for "${ext}". Supported: .svg`);
}
