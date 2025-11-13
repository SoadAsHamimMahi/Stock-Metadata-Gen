// Server-only utilities - these functions use Node.js modules
// This file should only be imported in API routes or server components
// DO NOT import this file in client-side code

import { readFile } from 'fs/promises';
import { extname } from 'path';

/**
 * Read an image file from disk and convert it to a base64 data URL
 * @param filePath - Absolute path to the image file
 * @returns Base64-encoded data URL (e.g., "data:image/jpeg;base64,...")
 */
export async function readImageAsBase64(filePath: string): Promise<string> {
  try {
    const fileData = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    
    // Determine MIME type based on extension
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp'
    };
    
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    const base64Data = fileData.toString('base64');
    
    return `data:${mimeType};base64,${base64Data}`;
  } catch (error: any) {
    throw new Error(`Failed to read image file: ${error?.message || 'Unknown error'}`);
  }
}

