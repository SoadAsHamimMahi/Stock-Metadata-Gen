// src/lib/models.ts
import { filenameHints, truncateByChars, dedupe, filterFilenameBasedKeywords } from './util';

import type { GeminiModel, MistralModel } from './types';

export type ModelArgs = {
  platform: 'general' | 'adobe' | 'shutterstock';
  titleLen: number;
  descLen: number;           // usually 150
  keywordCount: number;
  assetType: 'photo'|'illustration'|'vector'|'3d'|'icon'|'video';
  filename: string;
  extension: string;
  prefix?: string;
  suffix?: string;
  negativeTitle: string[];
  negativeKeywords: string[];
  preview?: boolean;          // Deprecated: use geminiModel instead
  bearer?: string;           // optional key override from Authorization header
  videoHints?: { style?: string[]; tech?: string[] };
  imageData?: string;        // base64-encoded image data URL (for multimodal)
  imageUrl?: string;          // publicly accessible image URL (for multimodal)
  isolatedOnTransparentBackground?: boolean;
  isolatedOnWhiteBackground?: boolean;
  isVector?: boolean;
  isIllustration?: boolean;
  geminiModel?: GeminiModel;  // Selected Gemini model
  mistralModel?: MistralModel; // Selected Mistral model
};

export type ModelOut = { 
  title: string; 
  description: string; 
  keywords: string[];
  error?: string; // Error message if generation failed
};

// ---------- Prompt pieces
const BANNED_TITLE = [
  'professional','high quality','stock','commercial','royalty free','royalty-free',
  'image','photo','photograph','picture','wallpaper'
];
const BANNED_KEYWORDS = [
  ...BANNED_TITLE,
  'vector file','jpeg','jpg','png','webp','svg','eps','ai','file','download',
  'copy','generated','gemini','mistral','watermark','logo',
  'artist','style of','inspired by','influenced by','in the tradition of','drawing on'
];
const PLATFORM_TIPS = {
  adobe: `Commercial-safe. No brands, no celebrities, no private names, no artist names, no creative work names.
Titles can be up to 200 characters. Use short, factual phrases (NOT formal sentences, NOT keyword lists).
Include specific details: animal species names, location names (city/state/country), equipment names, specific actions.
Example: "Young woman playing catch with Jack Russel Terrier at beach in Portland, Oregon, USA"
Structure: [Subject] [action/description] [location/context]. Be precise and descriptive.
Use caring, engaged language when describing people. Never use demeaning or derogatory language.`,
  shutterstock: 'Rich synonyms but no repetition or stuffing.',
  general: 'Platform-agnostic, balanced metadata suitable for most stock sites.'
} as const;
const ASSET_TIPS = {
  photo: 'Photo terms allowed; do not invent camera models or releases.',
  illustration: 'Illustration terms; avoid camera/video jargon.',
  vector: 'Vector words (flat, outline, gradient, geometric, scalable). No camera/video terms.',
  '3d': '3D/CGI wording (isometric, render, material) allowed.',
  icon: 'Icon set wording (pack, symbols, ui).',
  video: 'Subject + action + setting; only TRUE tech tags if provided (e.g., 4k, 60fps, timelapse).'
} as const;

function rules(keywordCount: number, titleLen: number, hasImage: boolean = false, platform?: 'general' | 'adobe' | 'shutterstock', isVideo?: boolean) {
  // Clamp keyword count to a safe range (15-35) to avoid weak filler keywords
  const safeKeywordCount = Math.max(15, Math.min(keywordCount, 35));
  
  const imageInstructions = hasImage ? `
CRITICAL: An image is provided. You MUST:
1. Analyze the image carefully and describe what you actually see
${isVideo ? '2. NOTE: This image is a frame extracted from a video - it represents the video content. Generate metadata based on what you see in this frame.' : ''}
2. Pay special attention to the BACKGROUND: 
   - FIRST: Check if the background has transparency (alpha channel). If transparent, it has NO COLOR - describe as "transparent background" or "isolated" ONLY.
   - If transparent: DO NOT mention ANY background color (not green, not white, not any color) - ONLY say "transparent background" or "isolated"
   - If the background is white, include "white background" or "isolated on white"
   - If the background has a specific color (and is NOT transparent), mention that color
   - CRITICAL: If you see transparent areas, they have NO background color. DO NOT mention "green background", "colored background", or any color for transparent backgrounds.
   - FORBIDDEN: Never mention "green background" unless the background is actually a solid green color (not transparent)
3. Generate title based ONLY on visible content: subjects, objects, colors, textures, setting, AND background (only if visible/colored, not if transparent)
4. Generate keywords describing ONLY what you observe: subjects, objects, colors, textures, setting, AND background details (transparent/white/colored - be accurate!)
${isVideo ? '5. DO NOT use filename hints - analyze ONLY the frame image you see' : '5. Use filename hints only as secondary clues if the image is unclear'}
` : '';
  
  const adobeTitleGuidance = platform === 'adobe' ? `
For Adobe Stock: Titles should be COMPLETE and natural. Aim to stay within ${titleLen} characters (max 200).
Write a natural, descriptive title (a short phrase or sentence), not a keyword list.
IMPORTANT: Use no more than 3 commas (",") and at most 1 semicolon (";") in the title.
If you need to list many elements, group them with words like "and", "with", or simplify the phrase into a single descriptive clause.
Include specific details: animal species names, location names (city/state/country), equipment names (ONLY if the equipment is clearly visible and is a main subject, e.g., "drone", "smartphone", "camera lens" - do NOT invent camera models or metadata from EXIF), specific actions.
CRITICAL: Always mention the background accurately:
- If transparent: prefer "isolated" in the title, use "transparent background" primarily in keywords (unless including it in the title is clearly helpful for buyers)
- If white: use "white background" or "isolated on white"
- If colored (not transparent): mention the specific color
Examples (complete and natural):
- "Abstract futuristic microchip circuit board design isolated on white background"
- "Young woman playing catch with Jack Russel Terrier at beach"
- "Red apple on white background" (if background is white)
Structure: [Subject] [action/description] [location/context] [background if white/isolated]. Be precise and descriptive.
NEVER include: artist names, real people names, fictional characters, creative work names, style references like "in the style of...".
Use caring, engaged language when describing people.` : '';
  
  const adobeKeywordGuidance = platform === 'adobe' ? `
CRITICAL for Adobe Stock: Keyword order is the MOST IMPORTANT factor for search visibility.
FORBIDDEN in keywords: NEVER include ANY words, numbers, IDs, hashes, codes, or alphanumeric strings from the filename (e.g., if filename contains "Whisk_2cf81f816ae2", do NOT use "whisk", "2cf81f816ae2", or any part of the filename as keywords).
1. Include all important CONTENT words from the title in your keywords. Ignore stop words like "and", "with", "on", "at", "of", "the". Key nouns and meaningful adjectives from the title should appear in the top 10 keywords.
2. Separate descriptive elements: "white fluffy pup" → ["white", "fluffy", "pup"] (separate keywords, not combined).
3. Include multiple specificity levels: general ("animal", "mammal") AND specific ("Arctic Fox", "Vulpes lagopus").
4. For locations: include country with city/state (e.g., "Portland, Oregon, USA" → ["portland", "oregon", "usa"]).
5. Include conceptual elements: feelings, mood, trends (e.g., "solitude", "childhood", "milestones").
6. Include setting: "indoors", "outdoors", "day", "night", "sunny", "cloudy" (if visible).
7. CRITICAL: Background keywords - be ACCURATE:
   - If background is TRANSPARENT: use ONLY "transparent background" or "isolated" - DO NOT mention ANY color (not green, not white, not any color)
   - If background is WHITE: use "white background", "isolated on white", or "on white"
   - If background has a specific COLOR (and is not transparent): mention that color (e.g., "blue background")
   - FORBIDDEN: Never use "green background" unless the background is actually solid green (not transparent)
   - NEVER mention a background color if the background is actually transparent
8. Include viewpoint: "high-angle view", "aerial view", "drone point of view" (if applicable).
9. Include number of people: "one person", "three people", "nobody" (if applicable).
10. Include demographic info only if visible and with model consent: ethnicity, age, gender, etc.
Order keywords by importance: most important first, title words included.` : '';
  
  const titleLengthLimit = titleLen;
  
  const generalTitleGuidance = platform !== 'adobe' ? `
Titles should be concise and natural. Aim to stay within ${titleLengthLimit} characters when possible, but shorter is fine if the subject is simple.
The title must be complete and not cut off mid-sentence.
` : '';
  
  // Few-shot examples based on platform
  const fewShotExamples = platform === 'adobe' ? `
Examples of GOOD titles (within ${titleLen} chars, complete, specific):
{"title": "Red apple isolated on white background", "description": "Fresh red apple on white background, perfect for food photography and commercial use.", "keywords": ["apple", "red", "fruit", "fresh", "white", "background", "isolated", "food", "healthy", "commercial"]}
{"title": "Young woman playing catch with Jack Russel Terrier at beach", "description": "Happy woman playing with her dog on a sunny beach, showing joy and companionship.", "keywords": ["woman", "dog", "jack", "russel", "terrier", "beach", "playing", "catch", "outdoors", "sunny"]}
{"title": "Abstract futuristic microchip circuit board design isolated", "description": "Modern technology circuit board pattern with microchips, ideal for tech and innovation themes.", "keywords": ["circuit", "board", "microchip", "technology", "abstract", "futuristic", "design", "isolated", "white", "background"]}

Examples of BAD titles (avoid these):
- "Professional high quality stock photo" (too generic, contains banned words)
- "Image of something" (too vague, filename-based)
- "Design element graphic" (too generic, lacks specificity)
` : platform === 'shutterstock' ? `
Examples of GOOD titles:
{"title": "Vibrant sunset over mountain landscape with lake reflection", "description": "Beautiful sunset scene with mountains and lake, perfect for travel and nature themes.", "keywords": ["sunset", "mountain", "landscape", "lake", "reflection", "nature", "scenic", "outdoors", "peaceful", "serene"]}
{"title": "Modern minimalist office workspace with laptop and plants", "description": "Clean contemporary office setup featuring laptop, plants, and natural lighting.", "keywords": ["office", "workspace", "laptop", "plants", "modern", "minimalist", "contemporary", "desk", "work", "indoor"]}
` : `
Examples of GOOD titles:
{"title": "Hand-drawn floral pattern vector illustration", "description": "Elegant hand-drawn floral design in vector format, suitable for print and digital use.", "keywords": ["floral", "pattern", "vector", "illustration", "hand", "drawn", "design", "decorative", "artistic", "elegant"]}
`;

  return `
Return PURE JSON only: {"title": string, "description": string, "keywords": string[]}.
${imageInstructions}
Title: MUST be COMPLETE. Aim to stay within ${titleLengthLimit} characters (max 200).
Titles should be concise and natural. Aim for around 50–90 characters when possible, but shorter is fine if the subject is simple.
CRITICAL:
- NEVER copy or paraphrase the filename, or include file types or generic words such as "copy", "final", "jpeg", "jpg", "png", "webp".
- NEVER include ANY words, numbers, IDs, hashes, or codes from the filename in the title (e.g., if filename contains "Whisk_2cf81f816ae2", do NOT use "whisk" or "2cf81f816ae2" in the title).
- NEVER include brand or product names (apple, google, microsoft, tesla, coca-cola, nike, etc.).
- NEVER include AI/model names (gemini, mistral, gpt, midjourney, stable diffusion, etc.).
- NEVER include person names (real people, artists, fictional characters).
- If your draft title violates any of these rules, FIX it before you return the JSON.
The title must be a complete phrase, not truncated or cut off mid-sentence.
${generalTitleGuidance}
Write a natural, descriptive title (a short phrase or sentence), not a keyword list. Subject-first; DO NOT use filler words:
[${BANNED_TITLE.join(', ')}].
${adobeTitleGuidance}
${fewShotExamples}
Description: ≤150 chars, 1 sentence, subject + style/setting/use-case; no brand/celebrity/release claims.
NOTE: Titles and keywords are PRIMARY for search visibility. Description is supporting context.
Keywords: Use up to ${safeKeywordCount} highly relevant keywords. Ideal range: 20–35. Never add weak or generic filler just to reach the maximum.
CRITICAL: NEVER include ANY words, numbers, IDs, hashes, codes, or alphanumeric strings from the filename in keywords. Base keywords ONLY on what is visible in the image or described in the title.
Order keywords by importance (MOST CRITICAL for Adobe Stock search visibility).
${adobeKeywordGuidance}
All keywords: lowercase, unique, no quotes, no duplicates.
NEVER include banned keywords: [${BANNED_KEYWORDS.join(', ')}].
`.trim();
}

export function buildUserPrompt(a: ModelArgs) {
  const hints = filenameHints(a.filename);
  const hasImage = !!(a.imageData || a.imageUrl);
  const isPNG = a.extension?.toLowerCase() === 'png';
  
  // CRITICAL FILENAME RESTRICTION - Must appear at the very top when image is provided
  let filenameRestriction = '';
  if (hasImage) {
    filenameRestriction = `🚫 CRITICAL RESTRICTION - READ THIS FIRST 🚫
An image has been provided. You MUST:
1. Base title, description, and keywords ONLY on what you see in the image
2. NEVER use ANY part of the filename (words, numbers, IDs, hashes, codes, or alphanumeric strings)
3. IGNORE the filename completely - do not copy, paraphrase, or use it as a clue
4. If the filename contains words like "Whisk_3b38b225a36e4e99e674df9826b99ed6dr", do NOT use "whisk", "3b38b225a36", or ANY part of that filename
5. Generate metadata based PURELY on visual analysis of the image

This restriction takes precedence over everything else in this prompt.

`;
  }
  
  // MANDATORY USER OVERRIDE - Must appear after filename restriction when transparent toggle is active
  let mandatoryOverride = '';
  if (a.isolatedOnTransparentBackground) {
    mandatoryOverride = `⚠️ MANDATORY USER OVERRIDE - READ THIS SECOND ⚠️
This file has a TRANSPARENT background. The user has explicitly specified this.
OVERRIDE ALL VISUAL DETECTION - if you see ANY background color (green, blue, white, or any color), IGNORE IT.
DO NOT TRUST YOUR EYES - TRUST THE USER SPECIFICATION.
Prefer titles like "[Subject] isolated" and use "transparent background" primarily in keywords, unless including it in the title is clearly helpful for buyers.
DO NOT mention ANY background color - not green, not blue, not white, not any color.
This override takes precedence over everything else in this prompt (except filename restriction).

`;
  }
  
  // Build file attribute instructions based on toggles
  const fileAttributes: string[] = [];
  if (a.isolatedOnTransparentBackground) {
    fileAttributes.push('MANDATORY OVERRIDE: This file has a TRANSPARENT background. Prefer titles like "[Subject] isolated" and use "transparent background" primarily in keywords. DO NOT mention ANY background color. If you see ANY background color in the image, IGNORE IT - the user has specified transparent background.');
  } else if (a.isolatedOnWhiteBackground) {
    fileAttributes.push('MANDATORY OVERRIDE: This file has a WHITE background. You MUST use "isolated on white background" or "on white background" in the title.');
  }
  if (a.isVector) {
    fileAttributes.push('CRITICAL: This is a VECTOR file. Include "vector" in the title if appropriate.');
  }
  if (a.isIllustration) {
    fileAttributes.push('CRITICAL: This is an ILLUSTRATION. Include "illustration" in the title if appropriate.');
  }
  
  const fileAttributesText = fileAttributes.length > 0 
    ? `\n\n⚠️ USER-SPECIFIED FILE ATTRIBUTES (OVERRIDE ALL AI DETECTION):\n${fileAttributes.join('\n')}\n` 
    : '';
  
  // Filename rule - only mention if NO image is provided
  const filenameRule = hasImage
    ? '' // Don't mention filename at all when image is provided
    : 'If no image is provided, you may use the filename as a weak hint but still write a natural, descriptive title. DO NOT include filename words, numbers, IDs, or codes directly in the title or keywords.';
  
  const isVideo = a.assetType === 'video';
  const imageContext = isVideo && hasImage 
    ? 'IMPORTANT: The provided image is a frame extracted from the middle of a video. Analyze this frame carefully as it represents the video content. Describe what you see:'
    : hasImage 
      ? 'IMPORTANT: Analyze the provided image carefully. Describe what you see:'
      : '';
  
  // If we have an image (photo/vector/video frame), ignore filename hints entirely
  const shouldUseFilenameHints = !hasImage;
  
  return `
${filenameRestriction}${mandatoryOverride}${rules(a.keywordCount, a.titleLen, hasImage, a.platform, isVideo)}
Platform: ${a.platform} (${PLATFORM_TIPS[a.platform]}).
Asset: ${a.assetType} (${ASSET_TIPS[a.assetType]}); ext: ${a.extension}.
${filenameRule ? `${filenameRule}\n` : ''}${fileAttributesText}${hasImage ? `${imageContext}
- Subjects and objects
- Colors and textures
- Setting and background (CRITICAL: 
  * ${isPNG ? 'This is a PNG file which may have transparency. ' : ''}${a.isolatedOnTransparentBackground ? '⚠️ MANDATORY USER OVERRIDE: This has a TRANSPARENT background - prefer "isolated" in the title, use "transparent background" primarily in keywords. If you see ANY background color (green, blue, white, or any color), IGNORE IT - the user has specified transparent background. DO NOT mention ANY background color. ' : ''}${a.isolatedOnWhiteBackground ? '⚠️ MANDATORY USER OVERRIDE: This has a WHITE background - use "isolated on white background" or "on white background". ' : ''}${!a.isolatedOnTransparentBackground && !a.isolatedOnWhiteBackground ? `If background is TRANSPARENT: prefer "isolated" in the title, use "transparent background" in keywords - DO NOT mention ANY color (not green, not white, not any color)
  * If background is WHITE: say "white background" or "isolated on white"
  * If background has a COLOR (not transparent): mention that color
  * FORBIDDEN: Never mention "green background" unless the background is actually a solid green color
  * NEVER guess or assume background colors - only describe what you actually see` : ''})
- Mood and style
- ${a.isolatedOnTransparentBackground ? '⚠️ REMINDER: Background is TRANSPARENT (user-specified) - prefer "isolated" in the title, use "transparent background" in keywords - NEVER mention a background color. If you see any color, IGNORE IT.' : a.isolatedOnWhiteBackground ? '⚠️ REMINDER: Background is WHITE (user-specified) - use "isolated on white background" or "on white background"' : 'If background is transparent, prefer "isolated" in the title, use "transparent background" in keywords - NEVER mention a background color'}` : ''}
Apply prefix="${a.prefix || ''}" and suffix="${a.suffix || ''}" to the title if provided.
Avoid title words: [${a.negativeTitle.join(', ')}].
Exclude keywords: [${a.negativeKeywords.join(', ')}].
${shouldUseFilenameHints
  ? `Filename hints: ${hints.join(', ') || 'none'}.`
  : ''}
${a.assetType === 'video'
  ? `Video hints (optional): style=[${a.videoHints?.style?.join(', ') || ''}], tech=[${a.videoHints?.tech?.join(', ') || ''}]`
  : ''
}
Return ONLY one JSON object like:
{"title":"…","description":"…","keywords":["…","…","…"]}.
`.trim();
}

// ---------- Providers

/**
 * Retry helper with exponential backoff
 * Supports retry event callbacks for real-time tracking
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  onRetry?: (attempt: number, error: any, delay: number) => void
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on certain errors (auth, validation, bad request)
      const isNonRetryable = 
        error?.status === 400 || 
        error?.status === 401 || 
        error?.status === 403 ||
        error?.message?.includes('API key') || 
        error?.message?.includes('invalid') || 
        error?.message?.includes('401') || 
        error?.message?.includes('403') ||
        error?.message?.includes('400');
      
      if (isNonRetryable) {
        throw error;
      }
      
      // Check if this is a retryable error (503, 429, 500, 502, 504)
      const isRetryable = 
        error?.status === 503 || 
        error?.status === 429 || 
        error?.status === 500 ||
        error?.status === 502 ||
        error?.status === 504 ||
        error?.message?.includes('overloaded') ||
        error?.message?.includes('503') ||
        error?.message?.includes('429') ||
        error?.message?.includes('rate limit');
      
      if (attempt < maxRetries - 1 && isRetryable) {
        // Use longer delays for server overload errors (503)
        const isOverloaded = error?.status === 503 || error?.message?.includes('overloaded');
        const delayMultiplier = isOverloaded ? 2 : 1; // Double delay for overloaded errors
        const delay = baseDelay * Math.pow(2, attempt) * delayMultiplier;
        
        const errorType = isOverloaded ? 'Server overloaded' : 'Temporary error';
        console.log(`⚠ ${errorType} (${error?.status || 'unknown'}), retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay...`);
        
        // Emit retry event if callback provided
        if (onRetry) {
          onRetry(attempt + 1, error, delay);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      } else if (attempt < maxRetries - 1) {
        // For other retryable errors, use standard exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`⚠ Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay...`);
        
        // Emit retry event if callback provided
        if (onRetry) {
          onRetry(attempt + 1, error, delay);
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function generateWithGemini(a: ModelArgs): Promise<ModelOut> {
  // Use bearer token if provided and not empty, otherwise fall back to environment variable
  let key: string | undefined;
  
  // Debug: Log what we're receiving
  console.log(`🔍 generateWithGemini - bearer provided: ${!!a.bearer}, bearer length: ${a.bearer?.length || 0}`);
  console.log(`🔍 generateWithGemini - env var exists: ${!!process.env.GEMINI_API_KEY}, env var length: ${process.env.GEMINI_API_KEY?.length || 0}`);
  
  if (a.bearer && a.bearer.trim().length > 0) {
    key = a.bearer.trim();
    console.log(`✓ Using bearer token from request (length: ${key.length})`);
  } else if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    key = process.env.GEMINI_API_KEY.trim();
    console.log(`✓ Using API key from environment variable (length: ${key.length})`);
  } else {
    console.error(`❌ No valid API key found - bearer: ${!!a.bearer}, env var: ${!!process.env.GEMINI_API_KEY}`);
  }
  
  // Validate key exists and is not empty
  if (!key || key.length === 0) {
    const errorMsg = a.bearer 
      ? 'Invalid API key: The Authorization header contains an empty or invalid key. Please check your API key in the "API Secrets" modal and ensure it is set as active.'
      : 'GEMINI_API_KEY environment variable is not set. Please set it in your .env.local file or provide an API key via the Authorization header in the "API Secrets" modal.';
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  
  // Additional validation: Gemini API keys are typically alphanumeric with some special chars
  // But we'll let the API validate the actual format
  if (key.length < 20) {
    console.warn(`⚠ API key seems unusually short (${key.length} chars). Gemini keys are typically longer.`);
  }
  
  // Log API key source for debugging (without exposing the actual key)
  const keySource = a.bearer ? 'Authorization header' : 'environment variable';
  const keyPreview = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '***';
  console.log(`🔑 Using Gemini API key from ${keySource} (${keyPreview}, length: ${key.length})`);
  
  // Additional validation: Check if key looks like a valid Gemini API key
  // Clean whitespace that might have been accidentally included
  if (key.includes(' ') || key.includes('\n') || key.includes('\t')) {
    console.warn(`⚠ API key contains whitespace characters. Cleaning...`);
    const originalLength = key.length;
    key = key.replace(/\s+/g, '').trim();
    console.log(`🔧 Cleaned API key (${originalLength} -> ${key.length} chars)`);
  }
  
  // Check for common placeholder values
  if (key === 'undefined' || key === 'null' || key.toLowerCase() === 'your_api_key_here') {
    throw new Error(`Invalid API key detected: The key appears to be a placeholder. Please provide a valid Gemini API key.`);
  }

  // Import retry tracker (dynamic import to avoid circular dependencies)
  const { retryTracker } = await import('@/lib/retry-tracker');
  const requestId = retryTracker.generateRequestId(a.filename);
  
  try {
    const result = await retryWithBackoff(async () => {
    try {
    const prompt = buildUserPrompt(a);
    const parts: any[] = [];
    let imageAdded = false;
    
    // Add image if provided (multimodal) - image must come BEFORE text per Gemini docs
    if (a.imageData) {
      console.log(`📸 Image data received, length: ${a.imageData.length} chars, first 50: ${a.imageData.substring(0, 50)}`);
      const match = a.imageData.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const base64Data = match[2];
        console.log(`✓ Image format matched - MIME: ${mimeType}, Base64 length: ${base64Data.length}`);
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data
          }
        });
        imageAdded = true;
        console.log(`✓ Image part added to request`);
      } else {
        console.error(`❌ CRITICAL: imageData exists but regex did not match! Expected format: data:image/jpeg;base64,{data}`);
        console.error(`   Actual format (first 100 chars): ${a.imageData.substring(0, 100)}`);
        throw new Error('Invalid image data format - must be data:image/{type};base64,{data}');
      }
    } else if (a.imageUrl) {
      console.log(`📸 Image URL provided: ${a.imageUrl}`);
      parts.push({
        file_data: {
          mime_type: 'image/jpeg',
          file_uri: a.imageUrl
        }
      });
      imageAdded = true;
      console.log(`✓ Image URL part added to request`);
    } else {
      console.log(`ℹ No image data or URL provided - text-only request`);
    }
    
    // Text prompt comes AFTER image (per Gemini best practices)
    parts.push({ text: prompt });
    
    // Validate that if imageData was provided, it was actually added
    if (a.imageData && !imageAdded) {
      throw new Error('Image data was provided but failed to be added to request parts');
    }
    
    const imageCount = parts.filter(p => p.inline_data || p.file_data).length;
    const textCount = parts.filter(p => p.text).length;
    console.log(`📤 Sending to Gemini: ${parts.length} parts (${imageCount} image(s), ${textCount} text)`);

    const body = { contents: [{ role: 'user', parts }] };
    
    // Debug: Log request structure (without full base64 data)
    const debugBody = JSON.parse(JSON.stringify(body));
    if (debugBody.contents[0].parts[0]?.inline_data) {
      const dataPreview = debugBody.contents[0].parts[0].inline_data.data.substring(0, 50);
      console.log(`🔍 Request structure: inline_data with mime_type="${debugBody.contents[0].parts[0].inline_data.mime_type}", data preview="${dataPreview}..."`);
    }
    
    // URL encode the key to handle any special characters safely
    const encodedKey = encodeURIComponent(key);
    
    // Select model based on geminiModel parameter or fallback to preview flag (for backward compatibility)
    // Map UI model names to API model names
    let modelName: string;
    if (a.geminiModel) {
      // Map from UI model names to API model names
      const modelMap: Record<GeminiModel, string> = {
        'gemini-2.5-flash': 'gemini-2.5-flash',
        'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite'
      };
      modelName = modelMap[a.geminiModel] || 'gemini-2.5-flash';
    } else if (a.preview) {
      // Backward compatibility: use preview flag if geminiModel not provided
      modelName = 'gemini-1.5-pro-latest';
    } else {
      // Default fallback
      modelName = 'gemini-2.5-flash';
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodedKey}`;
    
    console.log(`📡 Making request to Gemini API using model: ${modelName} (selected: ${a.geminiModel || 'default'})`);
    
    const res = await fetch(
      apiUrl,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error');
      let errorMessage = `Gemini API error (${res.status}): ${errorText.substring(0, 200)}`;
      
      // Parse error JSON if available
      let errorJson: any = null;
      try {
        errorJson = JSON.parse(errorText);
        if (errorJson?.error?.message) {
          errorMessage = `Gemini API error (${res.status}): ${errorJson.error.message}`;
        }
      } catch {
        // If parsing fails, use the original error message
      }
      
      // Determine if this is a retryable error
      const isRetryable = res.status === 503 || res.status === 429 || res.status === 500 || res.status === 502 || res.status === 504;
      const isNonRetryable = res.status === 400 || res.status === 401 || res.status === 403;
      
      // Provide more specific error messages for common issues
      if (res.status === 400) {
        if (errorJson?.error?.message?.includes('API key not valid') || errorJson?.error?.message?.includes('invalid')) {
          errorMessage = `Invalid API key (400): ${errorJson.error.message}. ` +
            `Please verify your API key is correct. ` +
            `If using Authorization header, check the Key Modal. ` +
            `If using environment variable, check your .env.local file.`;
        }
      }
      
      // For retryable errors, throw so retry logic can catch and retry
      if (isRetryable) {
        const error = new Error(errorMessage);
        (error as any).status = res.status;
        (error as any).isRetryable = true;
        console.error(`❌ ${errorMessage} (will retry)`);
        throw error; // This will trigger retryWithBackoff
      }
      
      // For non-retryable errors, log and return error object
      console.error(`❌ ${errorMessage}`);
      if (a.imageData) {
        errorMessage += ' Image was provided but API call failed.';
        console.error('   Note: Image was provided but API call failed. Check image format and size limits.');
      }
      
      // Return error instead of fallback when image is provided
      if (a.imageData) {
        return { title: '', description: '', keywords: [], error: errorMessage };
      }
      return fallback(a);
    }

    const data = await res.json();
    console.log(`📥 Gemini API response received, candidates: ${data?.candidates?.length || 0}`);
    let text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    console.log('📄 Gemini raw response (first 300 chars):', text.substring(0, 300));
    
    // Extract JSON from markdown code blocks if present
    // Gemini often returns: ```json\n{...}\n```
    if (text.includes('```json')) {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1].trim();
        console.log('✓ Extracted JSON from markdown code block');
      }
    } else if (text.includes('```')) {
      // Handle generic code blocks without language specifier
      const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch && codeMatch[1]) {
        text = codeMatch[1].trim();
        console.log('✓ Extracted JSON from generic code block');
      }
    }
    
    try { 
      const parsed = asModelOut(JSON.parse(text));
      console.log(`✓ Parsed successfully - Title: "${parsed.title || '(empty)'}", Keywords: ${parsed.keywords?.length || 0}`);
      if (a.imageData && (!parsed.title || parsed.title.length < 10)) {
        console.warn(`⚠ WARNING: Image was provided but title is very short or empty. This may indicate image wasn't analyzed.`);
        // Return error if image provided but result is clearly wrong
        if (parsed.title.length < 5) {
          return { 
            title: '', 
            description: '', 
            keywords: [], 
            error: 'Image analysis failed: AI returned empty or invalid title despite image being provided.' 
          };
        }
      }
      return parsed;
    } catch (parseError: any) {
      console.error('❌ JSON parse error:', parseError?.message);
      console.error('   Raw text (first 500 chars):', text.substring(0, 500));
      // Try to extract JSON more aggressively
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        try {
          const extractedJson = text.substring(jsonStart, jsonEnd + 1);
          console.log('🔄 Attempting to extract JSON from response...');
          const parsed = asModelOut(JSON.parse(extractedJson));
          console.log('✓ Successfully parsed extracted JSON');
          return parsed;
        } catch (retryError) {
          console.error('❌ Failed to parse extracted JSON:', retryError);
        }
      }
      // Return error instead of fallback when image is provided
      if (a.imageData) {
        return { 
          title: '', 
          description: '', 
          keywords: [], 
          error: `Failed to parse AI response: ${parseError?.message}. Raw response: ${text.substring(0, 100)}...` 
        };
      }
      return fallback(a);
    }
    } catch (error: any) {
      // If this is a retryable error that wasn't caught by retry logic, re-throw it
      // (This shouldn't happen since retry logic should catch it, but just in case)
      if (error?.isRetryable || error?.status === 503 || error?.status === 429 || error?.status === 500) {
        throw error; // Re-throw to let retry logic handle it
      }
      
      console.error('❌ generateWithGemini error:', error?.message || error);
      if (a.imageData) {
        const errorMsg = `Image analysis failed: ${error?.message || 'Unknown error'}. Check API key and image format.`;
        console.error('   Image was provided but request failed. Check logs above for details.');
        return { title: '', description: '', keywords: [], error: errorMsg };
      }
      return fallback(a);
    }
    }, 5, 2000, (attempt, error, delay) => {
    // Emit retry event for real-time tracking
    const isOverloaded = error?.status === 503 || error?.message?.includes('overloaded');
    const errorType = isOverloaded ? 'overloaded' : 
                     error?.status === 429 ? 'rate-limit' : 'server-error';
    
    retryTracker.emit({
      requestId,
      filename: a.filename,
      attempt,
      maxAttempts: 5,
      errorType,
      delay,
      status: 'retrying'
    });
  });
  
    // Emit success event after successful completion
    retryTracker.emit({
      requestId,
      filename: a.filename,
      attempt: 0,
      maxAttempts: 5,
      errorType: 'server-error',
      status: 'success'
    });
    
    return result;
  } catch (error) {
    // Emit failed event
    retryTracker.emit({
      requestId,
      filename: a.filename,
      attempt: 5,
      maxAttempts: 5,
      errorType: 'server-error',
      status: 'failed'
    });
    throw error;
  }
}

export async function generateWithMistral(a: ModelArgs): Promise<ModelOut> {
  // Use bearer token if provided and not empty, otherwise fall back to environment variable
  const key = (a.bearer && a.bearer.trim().length > 0) ? a.bearer.trim() : process.env.MISTRAL_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error('MISTRAL_API_KEY missing. Please provide an API key via Authorization header or set MISTRAL_API_KEY environment variable.');
  }

  const body = {
    model: 'mistral-small-latest',
    temperature: 0.7,
    messages: [
      { role: 'system', content: 'Respond with PURE JSON only: {"title": string, "description": string, "keywords": string[]}' },
      { role: 'user', content: buildUserPrompt(a) }
    ]
  };

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify(body)
  });
  if (!res.ok) return fallback(a);

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '{}';
  try { return asModelOut(JSON.parse(text)); } catch { return fallback(a); }
}

// ---------- Guards & fallback
function asModelOut(x: any): { title: string; description: string; keywords: string[] } {
  let t = String(x?.title ?? '').trim();
  let d = String(x?.description ?? '').trim();
  let k = Array.isArray(x?.keywords) ? x.keywords : [];
  k = k.map((s: any) => String(s).trim().toLowerCase()).filter(Boolean);
  return { title: t, description: d, keywords: k };
}

function fallback(a: ModelArgs) {
  const base = filenameHints(a.filename).slice(0, 8).join(' ') || 'commercial stock asset';
  if (a.imageData) {
    console.warn(`⚠ Fallback used despite image being provided. This indicates AI analysis failed.`);
    console.warn(`   Using filename-based fallback: "${base}"`);
  }
  return {
    title: truncateByChars(`${a.prefix ? a.prefix + ' ' : ''}${base}${a.suffix ? ' ' + a.suffix : ''}`, a.titleLen),
    description: truncateByChars(`Commercial ${a.assetType} of ${base}.`, a.descLen),
    keywords: dedupe([base, a.assetType, 'design', 'graphic', 'template'])
  };
}
