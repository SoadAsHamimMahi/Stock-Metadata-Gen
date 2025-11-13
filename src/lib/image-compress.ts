// Image compression utility using Sharp library
import sharp from 'sharp';
import { readFile, stat } from 'fs/promises';
import { extname } from 'path';

const MAX_IMAGE_SIZE_KB = 2000; // 2MB base64 encoded (roughly 1.5MB original)
const MAX_DIMENSION = 2048; // Max width or height
const QUALITY = 85; // JPEG/WebP quality (1-100)

/**
 * Compress and resize image using Sharp
 * Returns the compressed file path and original/new sizes
 */
export async function compressImage(
  inputPath: string,
  outputPath: string,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'jpeg' | 'webp' | 'png';
  } = {}
): Promise<{ originalSize: number; compressedSize: number; ratio: number }> {
  const originalStats = await stat(inputPath);
  const originalSize = originalStats.size;

  const ext = extname(inputPath).toLowerCase();
  const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  
  if (!isImage) {
    // For non-images, just copy the file
    const fs = await import('fs/promises');
    await fs.copyFile(inputPath, outputPath);
    const newStats = await stat(outputPath);
    return {
      originalSize,
      compressedSize: newStats.size,
      ratio: newStats.size / originalSize
    };
  }

  const maxWidth = options.maxWidth || MAX_DIMENSION;
  const maxHeight = options.maxHeight || MAX_DIMENSION;
  const quality = options.quality || QUALITY;
  const format = options.format || (ext === '.png' ? 'png' : 'jpeg');

  let sharpInstance = sharp(inputPath)
    .resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true
    });

  if (format === 'jpeg') {
    sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
  } else if (format === 'webp') {
    sharpInstance = sharpInstance.webp({ quality });
  } else if (format === 'png') {
    sharpInstance = sharpInstance.png({ 
      quality,
      compressionLevel: 9,
      adaptiveFiltering: true
    });
  }

  await sharpInstance.toFile(outputPath);

  const compressedStats = await stat(outputPath);
  const compressedSize = compressedStats.size;

  return {
    originalSize,
    compressedSize,
    ratio: compressedSize / originalSize
  };
}

/**
 * Compress image for API (base64 encoding)
 * Uses the already-compressed file if available, or compresses on-the-fly
 */
export async function compressImageForAPI(
  filePath: string,
  maxSizeKB: number = MAX_IMAGE_SIZE_KB
): Promise<string> {
  try {
    const fileData = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    
    // Determine MIME type
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp'
    };
    
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    const base64Data = fileData.toString('base64');
    const sizeKB = Math.round((base64Data.length * 3) / 4 / 1024);
    
    // If image is still too large after compression, we might need additional compression
    // But since we compress on upload, this should rarely happen
    if (sizeKB > maxSizeKB) {
      console.warn(`⚠ Large image detected (${sizeKB}KB). File may need additional compression.`);
      if (sizeKB > maxSizeKB * 2) {
        // Try to compress further if needed
        const { tmpdir } = await import('os');
        const { join } = await import('path');
        const tempPath = join(tmpdir(), `api-compress-${Date.now()}.${ext}`);
        
        try {
          await compressImage(filePath, tempPath, {
            maxWidth: 1536, // Smaller for API
            maxHeight: 1536,
            quality: 75, // Lower quality for API
            format: ext === '.png' ? 'png' : 'jpeg'
          });
          
          const compressedData = await readFile(tempPath);
          const fs = await import('fs/promises');
          await fs.unlink(tempPath).catch(() => {});
          
          return `data:${mimeType};base64,${compressedData.toString('base64')}`;
        } catch (compressError) {
          // If additional compression fails, use original
          console.warn(`⚠ Additional compression failed, using stored file: ${compressError}`);
        }
      }
    }
    
    return `data:${mimeType};base64,${base64Data}`;
  } catch (error: any) {
    throw new Error(`Failed to compress image: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Check if image needs compression
 */
export async function needsCompression(filePath: string, maxSizeKB: number = MAX_IMAGE_SIZE_KB): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    const sizeKB = Math.round(stats.size / 1024);
    return sizeKB > maxSizeKB;
  } catch {
    return false;
  }
}
