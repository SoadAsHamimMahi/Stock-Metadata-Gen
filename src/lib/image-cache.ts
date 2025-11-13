// Image caching utility - caches base64 image data to avoid re-reading files
import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';

interface CacheEntry {
  imageData: string;
  timestamp: number;
  fileSize: number;
  filePath: string;
}

// In-memory cache (for production, consider Redis)
const imageCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100; // Max cached images

/**
 * Generate cache key from file path and modification time
 */
function getCacheKey(filePath: string, mtime: number): string {
  return createHash('md5').update(`${filePath}:${mtime}`).digest('hex');
}

/**
 * Get cached image data if available and not expired
 */
export async function getCachedImage(filePath: string): Promise<string | null> {
  try {
    const stats = await stat(filePath);
    const cacheKey = getCacheKey(filePath, stats.mtimeMs);
    const cached = imageCache.get(cacheKey);
    
    if (cached) {
      // Check if cache is still valid
      const age = Date.now() - cached.timestamp;
      if (age < CACHE_TTL && cached.fileSize === stats.size) {
        console.log(`✓ Using cached image for ${filePath}`);
        return cached.imageData;
      } else {
        // Cache expired or file changed
        imageCache.delete(cacheKey);
      }
    }
  } catch (error) {
    // File doesn't exist or can't be accessed
    return null;
  }
  
  return null;
}

/**
 * Cache image data
 */
export function cacheImage(filePath: string, imageData: string, fileSize: number): void {
  // Clean up old entries if cache is too large
  if (imageCache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(imageCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp); // Oldest first
    const toRemove = entries.slice(0, Math.floor(MAX_CACHE_SIZE * 0.2)); // Remove 20%
    toRemove.forEach(([key]) => imageCache.delete(key));
  }
  
  stat(filePath).then(stats => {
    const cacheKey = getCacheKey(filePath, stats.mtimeMs);
    imageCache.set(cacheKey, {
      imageData,
      timestamp: Date.now(),
      fileSize,
      filePath
    });
    console.log(`✓ Cached image for ${filePath}`);
  }).catch(() => {
    // Ignore errors
  });
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of imageCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  imageCache.clear();
}

