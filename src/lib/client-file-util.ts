// Client-side file utilities for browser-based file handling
// These functions work entirely in the browser without server-side dependencies

const MAX_DIMENSION = 2048; // Max width or height for compression
const QUALITY = 0.5; // JPEG/WebP quality (0-1), stronger compression to reduce size
const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB

/**
 * Convert a File object to a base64 data URL
 * @param file - The File object to convert
 * @returns Base64-encoded data URL (e.g., "data:image/jpeg;base64,...")
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress an image file using HTML5 Canvas API
 * @param file - The image File to compress
 * @param options - Compression options
 * @returns A new compressed File object
 */
export async function compressImageClient(
  file: File,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'jpeg' | 'webp' | 'png';
  } = {}
): Promise<File> {
  const maxWidth = options.maxWidth || MAX_DIMENSION;
  const maxHeight = options.maxHeight || MAX_DIMENSION;
  const quality = options.quality || QUALITY;
  const format = options.format || 'jpeg';

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with specified format and quality
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // Create a new File object with the compressed blob
            const compressedFile = new File(
              [blob],
              file.name,
              { type: blob.type, lastModified: Date.now() }
            );
            resolve(compressedFile);
          },
          `image/${format}`,
          quality
        );
      } catch (error: any) {
        reject(new Error(`Compression failed: ${error?.message || 'Unknown error'}`));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate a blob URL for file preview
 * @param file - The File object
 * @returns Blob URL string
 */
export function getFilePreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Revoke a blob URL to free memory
 * @param url - The blob URL to revoke
 */
export function revokePreviewUrl(url: string): void {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

/**
 * Validate file size
 * @param file - The File to validate
 * @returns true if file size is within limits
 */
export function validateFileSize(file: File): boolean {
  return file.size <= MAX_FILE_SIZE;
}

/**
 * Get file extension from filename
 * @param filename - The filename
 * @returns Lowercase extension without dot
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Check if file is an image
 * @param file - The File to check
 * @returns true if file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || 
    ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(getFileExtension(file.name));
}

/**
 * Check if file is a video
 * @param file - The File to check
 * @returns true if file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || 
    ['mp4', 'mov', 'm4v', 'webm'].includes(getFileExtension(file.name));
}

/**
 * Check if file is a vector
 * @param file - The File to check
 * @returns true if file is a vector
 */
export function isVectorFile(file: File): boolean {
  return ['svg', 'eps', 'ai'].includes(getFileExtension(file.name));
}

/**
 * Extract three representative frames (start, middle, end) from a video and
 * combine them into a single vertical strip image.
 *
 * Returns a base64-encoded JPEG data URL (e.g., "data:image/jpeg;base64,...").
 */
export async function extractVideoFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      try {
        const duration = video.duration;

        // Decide timestamps to capture (in seconds)
        const times: number[] = [];
        if (!isFinite(duration) || duration <= 0) {
          // Fallback: just grab a single frame at t=0
          times.push(0);
        } else {
          times.push(0); // first frame
          times.push(duration / 2); // middle frame
          times.push(Math.max(duration - 0.1, 0)); // last-ish frame
        }

        const frameCount = times.length;

        // Determine target size for each frame so whole strip fits within MAX_DIMENSION
        let frameWidth = video.videoWidth;
        let frameHeight = video.videoHeight;

        const maxStripHeight = MAX_DIMENSION;
        const maxSingleHeight = maxStripHeight / frameCount;

        if (frameWidth > MAX_DIMENSION || frameHeight > maxSingleHeight) {
          const ratio = Math.min(MAX_DIMENSION / frameWidth, maxSingleHeight / frameHeight);
          frameWidth = Math.round(frameWidth * ratio);
          frameHeight = Math.round(frameHeight * ratio);
        }

        canvas.width = frameWidth;
        canvas.height = frameHeight * frameCount;

        let index = 0;

        const finish = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                URL.revokeObjectURL(video.src);
                reject(new Error('Failed to extract video frames'));
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                URL.revokeObjectURL(video.src);
                resolve(result);
              };
              reader.onerror = () => {
                URL.revokeObjectURL(video.src);
                reject(new Error('Failed to convert combined frames to base64'));
              };
              reader.readAsDataURL(blob);
            },
            'image/jpeg',
            QUALITY
          );
        };

        const drawCurrentFrame = () => {
          try {
            const destY = frameHeight * index;
            ctx.drawImage(
              video,
              0,
              0,
              video.videoWidth,
              video.videoHeight,
              0,
              destY,
              frameWidth,
              frameHeight
            );
          } catch (err) {
            console.warn('Failed to draw video frame, continuing:', err);
          }
          index += 1;
          seekToNext();
        };

        const seekToNext = () => {
          if (index >= times.length) {
            finish();
            return;
          }
          try {
            video.currentTime = times[index];
          } catch (err) {
            console.warn('Video seek failed, drawing current frame instead:', err);
            drawCurrentFrame();
          }
        };

        video.onseeked = () => {
          drawCurrentFrame();
        };

        seekToNext();
      } catch (error: any) {
        URL.revokeObjectURL(video.src);
        reject(new Error(`Frame extraction failed: ${error?.message || 'Unknown error'}`));
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video'));
    };

    // Load video from file
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Convert File to base64 with optional compression for images
 * @param file - The File to convert
 * @param compress - Whether to compress images before conversion
 * @returns Base64 data URL
 */
export async function fileToBase64WithCompression(
  file: File,
  compress: boolean = true
): Promise<string> {
  // Handle videos - extract representative frames and combine into one image
  if (isVideoFile(file)) {
    try {
      const frameData = await extractVideoFrame(file);
      // Frame is already compressed JPEG, return as-is
      return frameData;
    } catch (error) {
      console.warn('Video frame extraction failed:', error);
      throw error; // Re-throw so caller knows it failed
    }
  }

  let fileToConvert = file;

  // Detect PNG so we can preserve transparency but still reduce file size
  const ext = getFileExtension(file.name);
  const isPng = ext === 'png' || file.type === 'image/png';

  // Compress images if requested:
  // - PNG → stay PNG (keeps alpha, avoids artificial black background)
  // - Others → JPEG (better compression, background already opaque)
  if (compress && isImageFile(file)) {
    try {
      if (isPng) {
        fileToConvert = await compressImageClient(file, {
          maxWidth: MAX_DIMENSION,
          maxHeight: MAX_DIMENSION,
          quality: 0.92,      // PNG ignores quality in most browsers but safe to pass
          format: 'png'       // Preserve transparency, avoid black fill
        });
      } else {
        fileToConvert = await compressImageClient(file, {
          maxWidth: MAX_DIMENSION,
          maxHeight: MAX_DIMENSION,
          quality: QUALITY,
          format: 'jpeg'      // Use JPEG for better compression
        });
      }
    } catch (error) {
      console.warn('Image compression failed, using original:', error);
      // Continue with original file if compression fails
    }
  }

  return fileToBase64(fileToConvert);
}

