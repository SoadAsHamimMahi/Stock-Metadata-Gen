// src/app/api/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateWithGemini, generateWithMistral, generateWithGroq, type ModelArgs } from '@/lib/models';
import { filenameHints, truncateByChars, isFilenameBased, scoreTitleQuality, filterFilenameBasedKeywords } from '@/lib/util';
import { enrichKeywords, addScientificNames, extractTechnicalKeywords, generateLongTailKeywords } from '@/lib/keyword-enrichment';
import { GeminiModelEnum, MistralModelEnum, GroqModelEnum } from '@/lib/types';
import path from 'path';
import { convertVectorToPng } from '@/lib/vector-convert';

// Infer by extension when assetType='auto'
const inferAsset = (ext: string) =>
  ['mp4','mov','m4v','webm'].includes(ext) ? 'video' :
  ['eps','ai','svg'].includes(ext) ? 'vector' :
  ['png','jpg','jpeg','webp'].includes(ext) ? 'photo' : 'illustration';

const Body = z.object({
  platform: z.enum(['general','adobe','shutterstock']),
  titleLen: z.number().min(20).max(200),
  descLen: z.literal(150),
  keywordMode: z.enum(['auto','fixed']).optional().default('fixed'),
  keywordCount: z.number().min(5).max(49),
  assetType: z.enum(['auto','photo','illustration','vector','3d','icon','video']),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  negativeTitle: z.array(z.string()).optional().default([]),
  negativeKeywords: z.array(z.string()).optional().default([]),
  model: z.object({ provider: z.enum(['gemini','mistral','groq']), preview: z.boolean().optional() }),
  geminiModel: GeminiModelEnum.optional(),
  mistralModel: MistralModelEnum.optional(),
  groqModel: GroqModelEnum.optional(),
  files: z.array(z.object({ 
    name: z.string(), 
    type: z.string(), 
    url: z.string(), 
    ext: z.string().optional(),
    imageData: z.string().optional() // Base64 image data from client
  })),
  videoHints: z.object({ style: z.array(z.string()).optional(), tech: z.array(z.string()).optional() }).optional(),
  singleMode: z.boolean().optional(),
  isolatedOnTransparentBackground: z.boolean().optional().default(false),
  isolatedOnWhiteBackground: z.boolean().optional().default(false),
  isVector: z.boolean().optional().default(false),
  isIllustration: z.boolean().optional().default(false),
  userId: z.string().optional(), // Firebase user ID for tracking
  userDisplayName: z.string().optional(), // User display name
  userEmail: z.string().optional(), // User email
  userPhotoURL: z.string().optional() // User photo URL
});

// Minimal banned words - only AI model names that shouldn't appear in content
const BAN = new Set([
  'gemini','mistral' // AI model names that shouldn't appear in generated content
]);
const MIN_LEN = 3;
const stemLite = (s: string) => s.replace(/(ing|ers|es|s)$/,'');
const AUTO_KEYWORD_CAP = 35;
const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','in','into','is','it','of','on','or','out','the','to','with'
]);

// Common brand/IP names to detect
const COMMON_BRANDS = new Set([
  'apple', 'google', 'microsoft', 'amazon', 'facebook', 'meta', 'twitter', 'x', 'instagram',
  'youtube', 'netflix', 'disney', 'nike', 'adidas', 'coca-cola', 'pepsi', 'starbucks',
  'mcdonalds', 'burger king', 'toyota', 'honda', 'ford', 'tesla', 'bmw', 'mercedes',
  'samsung', 'sony', 'nintendo', 'playstation', 'xbox', 'iphone', 'ipad', 'android',
  'windows', 'macos', 'linux', 'adobe', 'photoshop', 'illustrator'
]);

// Style reference patterns
const STYLE_REF_PATTERNS = [
  /in the style of/i,
  /inspired by/i,
  /influenced by/i,
  /similar to/i,
  /like\s+(?:the\s+)?(?:movie|film|comic|book|game|franchise)/i,
  /drawing on/i,
  /in the tradition of/i
];

// Generic keywords that shouldn't dominate first 10
const GENERIC_KEYWORDS = new Set([
  'design', 'graphic', 'element', 'item', 'object', 'thing', 'image', 'photo', 'picture',
  'illustration', 'vector', 'icon', 'symbol', 'pattern', 'background', 'texture'
]);

// Helper to safely escape user-provided strings for use in RegExp
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Strict title cap that tries to keep a clean ending within the max length.
function strictTrimTitleToMax(input: string, max: number): string {
  let t = String(input || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;

  const slice = t.slice(0, max).trimEnd();

  // Prefer ending at a sentence boundary within the limit.
  for (let i = slice.length; i >= Math.max(0, Math.floor(max * 0.7)); i--) {
    const c = slice[i - 1];
    if (c === '.' || c === '!' || c === '?') {
      return slice.slice(0, i).trimEnd();
    }
  }

  // Otherwise, end at the last word boundary.
  const lastSpace = slice.lastIndexOf(' ');
  t = (lastSpace > Math.floor(max * 0.6) ? slice.slice(0, lastSpace) : slice).trimEnd();

  // Cleanup: remove trailing punctuation and dangling connector words.
  for (let i = 0; i < 5; i++) {
    const before = t;
    t = t.replace(/[,\-–—:;]+$/g, '').trimEnd();
    t = t.replace(/\b(by|with|and|or|of|to|for|from|in|on|at|into|as)$/i, '').trimEnd();
    if (t === before) break;
  }

  // Final safety: ensure we don't exceed max after trimming (shouldn't happen, but keep safe).
  if (t.length > max) t = t.slice(0, max).trimEnd();
  return t;
}

// Adobe Stock title validation
function validateAdobeTitle(title: string, expectedLen: number): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const titleLower = title.toLowerCase();
  
  // 1. Length warning for Adobe (recommend ≤70, but allow up to 200)
  if (title.length > 70) {
    warnings.push(`Title exceeds Adobe's recommended 70 characters (${title.length} chars). Adobe recommends ≤70 for optimal performance.`);
  }
  
  // 2. Check for keyword list format (too many commas/semicolons)
  const commaCount = (title.match(/,/g) || []).length;
  const semicolonCount = (title.match(/;/g) || []).length;
  if (commaCount > 3 || semicolonCount > 1) {
    // Downgraded to a warning so it never blocks generation
    warnings.push(
      'Title appears to be a keyword list (too many commas/semicolons). Adobe requires descriptive phrases, not tag dumps. Use no more than 3 commas and at most 1 semicolon.'
    );
  }
  
  // 3. Detect style references
  for (const pattern of STYLE_REF_PATTERNS) {
    if (pattern.test(title)) {
      errors.push('Title contains style reference (e.g., "in the style of", "inspired by"). Adobe prohibits referencing other creative works.');
      break;
    }
  }
  
  // 4. Detect third-party IP (brand names)
  const titleWords = titleLower.split(/\W+/).filter(w => w.length > 2);
  const foundBrands = titleWords.filter(w => COMMON_BRANDS.has(w));
  if (foundBrands.length > 0) {
    errors.push(`Title contains third-party IP/brand names: ${foundBrands.join(', ')}. Adobe prohibits brand/product names.`);
  }
  
  // 5. Detect person/artist names (basic pattern - capitalized words that look like names)
  // This is a simple heuristic - could be improved
  const words = title.split(/\s+/);
  const capitalizedWords = words.filter(w => /^[A-Z][a-z]+$/.test(w) && w.length > 3);
  if (capitalizedWords.length > 2 && !title.match(/^[A-Z]/)) {
    // Multiple capitalized words in middle of sentence might be names
    warnings.push('Title may contain person/artist names. Adobe prohibits names of real people, artists, or fictional characters.');
  }
  
  return { warnings, errors };
}

// Adobe Stock keyword validation
function validateAdobeKeywords(keywords: string[], title: string): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return { warnings, errors };
  }
  
  // 1. Check for combined phrases (keywords with multiple descriptors)
  const combinedPhrases: string[] = [];
  keywords.forEach(kw => {
    const words = kw.toLowerCase().split(/\s+/);
    // If keyword has 3+ words and contains adjectives, it's likely a combined phrase
    if (words.length >= 3) {
      combinedPhrases.push(kw);
    }
  });
  if (combinedPhrases.length > 0) {
    warnings.push(`Found combined phrases in keywords (should be split): ${combinedPhrases.slice(0, 3).join(', ')}. Adobe requires individual words, not combined descriptors.`);
  }
  
  // 2. Check first 10 keywords for too many generic terms
  const first10 = keywords.slice(0, 10);
  const genericCount = first10.filter(k => GENERIC_KEYWORDS.has(k.toLowerCase())).length;
  if (genericCount > 3) {
    warnings.push(`First 10 keywords contain too many generic terms (${genericCount}). Adobe emphasizes first keywords are most important - use specific, descriptive terms.`);
  }
  
  // 3. Detect third-party IP in keywords
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const foundBrands = lowerKeywords.filter(k => {
    const words = k.split(/\W+/);
    return words.some(w => COMMON_BRANDS.has(w));
  });
  if (foundBrands.length > 0) {
    errors.push(`Keywords contain third-party IP/brand names: ${foundBrands.join(', ')}. Adobe prohibits brand/product names.`);
  }
  
  // 4. Basic person name detection (simple heuristic)
  const namePattern = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/;
  const possibleNames = keywords.filter(k => namePattern.test(k));
  if (possibleNames.length > 0) {
    errors.push(`Keywords may contain person names: ${possibleNames.join(', ')}. Adobe prohibits personal names.`);
  }
  
  // 5. Language consistency (basic check - look for mixed character sets)
  // This is a simple heuristic - could be improved with a proper language detection library
  const hasNonLatin = keywords.some(k => /[^\x00-\x7F]/.test(k));
  const allLatin = keywords.every(k => /^[\x00-\x7F]+$/.test(k));
  if (hasNonLatin && !allLatin) {
    warnings.push('Keywords appear to contain mixed languages. Adobe requires all metadata in one language.');
  }
  
  return { warnings, errors };
}

// Response validation
function validateResponse(
  title: string,
  description: string,
  keywords: string[],
  expectedTitleLen: number,
  expectedKeywordCount: number | undefined,
  filename: string,
  hasImage: boolean,
  platform: 'general' | 'adobe' | 'shutterstock'
): { valid: boolean; issues: string[]; warnings?: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // Title validation
  if (!title || title.trim().length === 0) {
    issues.push('Title is empty');
  } else {
    const hardMax = 200;
    
    // Check against hard 200 limit only
    if (title.length > hardMax) {
      issues.push(`Title too long: ${title.length} chars (max ${hardMax})`);
    }
    
    if (title.length < 5) {
      issues.push(`Title too short: ${title.length} chars (min 5)`);
    }
    
    // Check for banned words in title (whole word matching only) - only gemini/mistral
    const titleLower = title.toLowerCase();
    const titleWords = titleLower.split(/\W+/).filter(w => w.length > 0);
    const titleWordsSet = new Set(titleWords);
    for (const banned of BAN) {
      if (titleWordsSet.has(banned)) {
        issues.push(`Title contains banned word: "${banned}"`);
      }
    }
    
    // Adobe-specific title validation
    if (platform === 'adobe') {
      const adobeValidation = validateAdobeTitle(title, expectedTitleLen);
      warnings.push(...adobeValidation.warnings);
      issues.push(...adobeValidation.errors);
    }
  }
  
  // Description validation
  if (!description || description.trim().length === 0) {
    issues.push('Description is empty');
  } else if (description.length > 150) {
    issues.push(`Description too long: ${description.length} chars (max 150)`);
  }
  
  // Keywords validation
  if (!Array.isArray(keywords)) {
    issues.push('Keywords is not an array');
  } else {
    if (typeof expectedKeywordCount === 'number' && keywords.length !== expectedKeywordCount) {
      issues.push(`Keyword count mismatch: ${keywords.length} (expected ${expectedKeywordCount})`);
    }
    // Check for banned keywords (only gemini/mistral)
    const bannedKeywords = keywords.filter(k => BAN.has(k.toLowerCase()));
    if (bannedKeywords.length > 0) {
      issues.push(`Keywords contain banned words: ${bannedKeywords.join(', ')}`);
    }
    // Check for duplicates
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    const duplicates = lowerKeywords.filter((k, i) => lowerKeywords.indexOf(k) !== i);
    if (duplicates.length > 0) {
      issues.push(`Duplicate keywords found: ${[...new Set(duplicates)].join(', ')}`);
    }
    
    // Adobe-specific keyword validation
    if (platform === 'adobe') {
      const adobeKeywordValidation = validateAdobeKeywords(keywords, title);
      warnings.push(...adobeKeywordValidation.warnings);
      issues.push(...adobeKeywordValidation.errors);
    }
  }
  
  // Quality check: filename-based title when image is provided
  if (hasImage && title && isFilenameBased(title, filename)) {
    issues.push('Title appears filename-based despite image being provided');
  }
  
  return { valid: issues.length === 0, issues, warnings: warnings.length > 0 ? warnings : undefined };
}

function normalizeKeywords(input: any, needed: number | undefined, seeds: string[], extraBlock: string[] = []) {
  const arr = Array.isArray(input) ? input : [];
  const block = new Set([...BAN, ...extraBlock.map(s => s.toLowerCase())]);
  const seen = new Set<string>();
  const out: string[] = [];
  
  const push = (raw: string) => {
    let k = String(raw).toLowerCase().trim();
    if (!k || k.length < MIN_LEN) return;
    if (block.has(k)) return;
    if (!/[a-z]/.test(k)) return;
    if (STOPWORDS.has(k)) return;
    const stem = stemLite(k);
    if (seen.has(stem)) return;
    seen.add(stem);
    out.push(k);
  };
  
  const cap = typeof needed === 'number' ? needed : 60;
  for (const k of arr) { push(String(k)); if (out.length >= cap) break; }
  for (const s of seeds) { if (out.length >= cap) break; push(String(s)); }
  return typeof needed === 'number' ? out.slice(0, needed) : out;
}

export async function POST(req: NextRequest) {
  try {
    // Extract bearer token, but only use it if it's not empty
    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.replace(/^Bearer\s+/i, '').trim();
    const bearerToken = bearer && bearer.length > 0 ? bearer : undefined;
    
    // Note: Firestore tracking will be handled client-side after successful generation
    // Server-side Firestore requires Firebase Admin SDK, which we'll skip for now
    // Client can call a separate tracking endpoint if needed
    
    // Debug logging (always log in development, also log key issues in production)
    console.log(`🔍 API Request - Bearer token provided: ${bearerToken ? 'YES' : 'NO'}`);
    if (bearerToken) {
      console.log(`🔍 API Request - Bearer token length: ${bearerToken.length}`);
      console.log(`🔍 API Request - Bearer token preview: ${bearerToken.length > 8 ? `${bearerToken.substring(0, 4)}...${bearerToken.substring(bearerToken.length - 4)}` : '***'}`);
    }
    console.log(`🔍 API Request - Env var GEMINI_API_KEY exists: ${!!process.env.GEMINI_API_KEY}`);
    if (process.env.GEMINI_API_KEY) {
      const envKeyLen = process.env.GEMINI_API_KEY.length;
      console.log(`🔍 API Request - Env var GEMINI_API_KEY length: ${envKeyLen}`);
      console.log(`🔍 API Request - Env var preview: ${envKeyLen > 8 ? `${process.env.GEMINI_API_KEY.substring(0, 4)}...${process.env.GEMINI_API_KEY.substring(envKeyLen - 4)}` : '***'}`);
    }
    const parse = Body.safeParse(await req.json());
    if (!parse.success) return NextResponse.json({ message: 'bad_request' }, { status: 400 });

    const a = parse.data;
    const rows: any[] = [];

    const handleOne = async (f: {name:string; type:string; url:string; ext?:string; imageData?:string}) => {
      const ext = (f.ext || f.name.split('.').pop() || '').toLowerCase();
      const effType = a.assetType === 'auto' ? inferAsset(ext) : a.assetType;

      // Use imageData from request body (already base64 encoded from client)
      let imageData: string | undefined = f.imageData;
      const imageExts = ['png', 'jpg', 'jpeg', 'webp'];
      const videoExts = ['mp4', 'mov', 'm4v', 'webm'];
      const vectorExts = ['eps', 'ai'];
      
      if (imageExts.includes(ext)) {
        if (imageData) {
          // Validate image data length is reasonable (warn if very large)
          const imageSizeKB = Math.round(imageData.length / 1024);
          if (imageSizeKB > 2000) {
            console.warn(`⚠ Large image detected (${imageSizeKB}KB). Gemini has 20MB limit for inline data.`);
          }
          
          // Validate format matches expected pattern
          if (!imageData.match(/^data:image\/(png|jpeg|jpg|webp);base64,/)) {
            console.warn(`⚠ Image data format may be unexpected: ${imageData.substring(0, 50)}`);
          }
          
          console.log(`✓ Using client-provided image data for ${f.name} (${imageSizeKB}KB base64 encoded)`);
        } else {
          console.warn(`⚠ No image data provided for ${f.name} (expected base64 data)`);
        }
      } else if (videoExts.includes(ext)) {
        if (imageData) {
          // Validate video frame data
          const imageSizeKB = Math.round(imageData.length / 1024);
          console.log(`✓ Using extracted video frame for ${f.name} (${imageSizeKB}KB base64 encoded)`);
          
          // Validate format matches expected pattern
          if (!imageData.match(/^data:image\/(jpeg|jpg);base64,/)) {
            console.warn(`⚠ Video frame data format may be unexpected: ${imageData.substring(0, 50)}`);
          }
        } else {
          console.warn(`⚠ No frame data extracted for ${f.name} - will use filename-based generation`);
        }
      } else if (vectorExts.includes(ext)) {
        // Try to convert EPS/AI vector files into PNG previews on the server
        if (!imageData && f.url) {
          try {
            // Assuming f.url looks like "/uploads/filename.eps"
            const relPath = f.url.replace(/^\/+/, ''); // strip leading slash
            const absPath = path.join(process.cwd(), 'public', relPath);

            const pngBuffer = await convertVectorToPng(absPath);
            const base64 = pngBuffer.toString('base64');
            imageData = `data:image/png;base64,${base64}`;

            const kb = Math.round(pngBuffer.length / 1024);
            console.log(`✓ Vector preview generated for ${f.name} (${kb}KB PNG with alpha)`);
          } catch (err) {
            console.warn(`⚠ Failed to convert vector ${f.name} to PNG preview:`, err);
          }
        }
      } else {
        console.log(`ℹ Skipping image load for ${f.name} (not a supported image/video file: ${ext})`);
      }

      // If this looks like an image/video/vector asset but we don't have imageData,
      // do NOT fall back to filename-based generation. Return an error instead.
      // The goal is to ensure metadata comes from visual analysis only.
      const expectsVisualAnalysis =
        imageExts.includes(ext) ||
        videoExts.includes(ext) ||
        ['svg', 'eps', 'ai'].includes(ext);

      if (expectsVisualAnalysis && !imageData) {
        rows.push({
          filename: f.name,
          platform: a.platform === 'adobe' ? 'Adobe Stock' : a.platform === 'general' ? 'General' : 'Shutterstock',
          title: '[ERROR] Image analysis failed: No image data available for visual analysis.',
          description: 'No preview image was available for the AI to analyze. Please re-upload, or provide a supported preview/format.',
          keywords: [],
          assetType: effType,
          extension: ext,
          error: 'Image analysis failed: Missing imageData'
        });
        return;
      }

      const args: ModelArgs = {
        platform: a.platform,
        titleLen: a.titleLen,
        descLen: a.descLen,
        keywordMode: a.keywordMode,
        keywordCount: a.keywordMode === 'fixed' ? a.keywordCount : 35,
        assetType: effType as any,
        filename: f.name,
        extension: ext,
        prefix: a.prefix,
        suffix: a.suffix,
        negativeTitle: a.negativeTitle,
        negativeKeywords: a.negativeKeywords,
        preview: a.model.preview, // Deprecated, kept for backward compatibility
        bearer: bearerToken,
        videoHints: a.videoHints,
        imageData,
        isolatedOnTransparentBackground: a.isolatedOnTransparentBackground || false,
        isolatedOnWhiteBackground: a.isolatedOnWhiteBackground || false,
        isVector: a.isVector || false,
        isIllustration: a.isIllustration || false,
        geminiModel: a.geminiModel,
        mistralModel: a.mistralModel,
        groqModel: a.groqModel
      };
      
      // Debug: Log the actual values being used
      console.log(`🔍 ModelArgs toggle values for ${f.name}:`, {
        isolatedOnTransparentBackground: args.isolatedOnTransparentBackground,
        isolatedOnWhiteBackground: args.isolatedOnWhiteBackground,
        isVector: args.isVector,
        isIllustration: args.isIllustration
      });

      // Note: generateWithGemini now emits retry events automatically via retryTracker
      const out = a.model.provider === 'gemini'
        ? await generateWithGemini(args)
        : a.model.provider === 'groq'
        ? await generateWithGroq(args)
        : await generateWithMistral(args);

      // Check for errors first
      if (out.error) {
        console.error(`❌ Error for ${f.name}: ${out.error}`);
        rows.push({
          filename: f.name,
          platform: a.platform === 'adobe' ? 'Adobe Stock' : a.platform === 'general' ? 'General' : 'Shutterstock',
          title: `[ERROR] ${out.error}`,
          description: 'Image analysis failed. Please check your API key and try again.',
          keywords: [],
          assetType: effType,
          extension: ext,
          error: out.error
        });
        return; // Skip to next file
      }

      // Normalize title/description
      let title = String(out.title || '').trim();
      
      // Validate: reject filename-based titles when image is provided
      if (imageData && title && isFilenameBased(title, f.name)) {
        console.warn(`⚠ Title "${title}" appears to be filename-based, but image was provided.`);
        // Return error instead of using fallback
        rows.push({
          filename: f.name,
          platform: a.platform === 'adobe' ? 'Adobe Stock' : a.platform === 'general' ? 'General' : 'Shutterstock',
          title: '[ERROR] Image analysis failed: Generated title appears to be based on filename, not image content.',
          description: 'The AI may not have analyzed the image properly. Please check your API key and image format.',
          keywords: [],
          assetType: effType,
          extension: ext,
          error: 'Image analysis failed: Title appears filename-based'
        });
        return;
      }
      
      if (!title) {
        if (imageData) {
          // Return error instead of generic fallback
          rows.push({
            filename: f.name,
            platform: a.platform === 'adobe' ? 'Adobe Stock' : a.platform === 'general' ? 'General' : 'Shutterstock',
            title: '[ERROR] Image analysis failed: No title generated.',
            description: 'The AI did not generate a title despite image being provided. Please check your API key.',
            keywords: [],
            assetType: effType,
            extension: ext,
            error: 'Image analysis failed: Empty title returned'
          });
          return;
        } else {
          const base = filenameHints(f.name).join(' ');
          title = base || 'commercial stock asset';
        }
      }
      // Auto-remove banned words from title (before length check)
      const titleWordsArray = title.split(/\s+/);
      const cleanedTitleWords = titleWordsArray.filter(word => {
        const wordLower = word.toLowerCase().replace(/[^\w]/g, ''); // Remove punctuation for comparison
        return !BAN.has(wordLower);
      });
      let cleanedTitle = cleanedTitleWords.join(' ').trim();
      
      if (cleanedTitle !== title && cleanedTitle.length > 0) {
        console.warn(`⚠ Auto-removed banned words from title: "${title}" → "${cleanedTitle}"`);
        title = cleanedTitle;
      } else if (cleanedTitle.length === 0 && title.length > 0) {
        // If all words were banned, use fallback
        console.warn(`⚠ All words in title were banned, using fallback`);
        const base = filenameHints(f.name).join(' ') || 'commercial stock asset';
        title = base;
      } else {
        title = cleanedTitle;
      }
      
      // Auto-remove style references from title (Adobe-specific)
      if (a.platform === 'adobe') {
        let styleRemoved = false;
        for (const pattern of STYLE_REF_PATTERNS) {
          if (pattern.test(title)) {
            // Remove the style reference phrase
            title = title.replace(pattern, '').replace(/\s+/g, ' ').trim();
            styleRemoved = true;
          }
        }
        if (styleRemoved) {
          console.warn(`⚠ Auto-removed style reference from title for ${f.name}`);
        }
      }

      // Append file attribute phrases if toggles are enabled and phrases are not already in title
      const titleLower = title.toLowerCase();
      const phrasesToAdd: string[] = [];
      
      // Log toggle values for debugging
      console.log(`🔍 Toggle values for ${f.name}:`, {
        isolatedOnTransparentBackground: a.isolatedOnTransparentBackground,
        isolatedOnWhiteBackground: a.isolatedOnWhiteBackground,
        isVector: a.isVector,
        isIllustration: a.isIllustration
      });
      console.log(`🔍 Current title: "${title}"`);
      
      // Post-process title to remove background color mentions when transparent toggle is active
      if (a.isolatedOnTransparentBackground) {
        const originalTitle = title;
        const titleLower = title.toLowerCase();
        
        // Detect background color mentions (common colors that might be detected incorrectly)
        const colorPatterns = [
          /\b(green|blue|red|yellow|orange|purple|pink|brown|black|gray|grey|colored|coloured)\s+background\b/gi,
          /\bon\s+(green|blue|red|yellow|orange|purple|pink|brown|black|gray|grey|colored|coloured)\s+background\b/gi,
          /\bwith\s+(green|blue|red|yellow|orange|purple|pink|brown|black|gray|grey|colored|coloured)\s+background\b/gi,
          /\b(green|blue|red|yellow|orange|purple|pink|brown|black|gray|grey)\s+bg\b/gi
        ];
        
        let colorMentionsRemoved = false;
        let removedColors: string[] = [];
        
        for (const pattern of colorPatterns) {
          const matches = title.match(pattern);
          if (matches) {
            colorMentionsRemoved = true;
            removedColors.push(...matches);
            // Replace color mentions with "transparent background" or remove if already has "isolated"
            if (/\bisolated\b/i.test(title)) {
              // If "isolated" is already present, just remove the color mention
              title = title.replace(pattern, '').replace(/\s+/g, ' ').trim();
            } else {
              // Replace with "transparent background"
              title = title.replace(pattern, 'transparent background');
            }
          }
        }
        
        if (colorMentionsRemoved) {
          console.warn(`⚠️ POST-PROCESSING: Removed background color mentions from title for ${f.name}:`, {
            original: originalTitle,
            corrected: title,
            removedColors: removedColors
          });
        }
        
        // Ensure title doesn't have conflicting background descriptions
        // Remove any remaining color + background combinations
        title = title.replace(/\b(green|blue|red|yellow|orange|purple|pink|brown|black|gray|grey|colored|coloured)\s+background\b/gi, 'transparent background');
        title = title.replace(/\s+/g, ' ').trim(); // Clean up extra spaces
        
        // Update titleLower after post-processing
        const updatedTitleLower = title.toLowerCase();
        
        // Check if title already contains the exact phrase or very similar wording
        const hasExactPhrase = /isolated\s+on\s+transparent\s+background/i.test(title);
        const hasTransparentBg = /transparent\s+background/i.test(updatedTitleLower);
        const hasIsolatedAlone = /\bisolated\b/i.test(title) && !/isolated\s+on\s+white/i.test(updatedTitleLower);
        
        console.log(`🔍 Transparent background detection:`, {
          hasExactPhrase,
          hasTransparentBg,
          hasIsolatedAlone,
          title: title
        });
        
        // Only skip if we have the exact phrase - otherwise append to ensure consistency
        if (!hasExactPhrase) {
          phrasesToAdd.push('isolated on transparent background');
          console.log(`✓ Will add "isolated on transparent background" to title (exact phrase not found)`);
        } else {
          console.log(`⚠ Title already contains exact phrase "isolated on transparent background", skipping`);
        }
      } else if (a.isolatedOnWhiteBackground) {
        // Check if title already contains the exact phrase or very similar wording
        const hasExactPhrase = /isolated\s+on\s+white\s+background/i.test(title);
        const hasWhiteBg = /white\s+background/i.test(titleLower) || /on\s+white\s+background/i.test(titleLower);
        
        console.log(`🔍 White background detection:`, {
          hasExactPhrase,
          hasWhiteBg,
          title: title
        });
        
        // Only skip if we have the exact phrase - otherwise append to ensure consistency
        if (!hasExactPhrase) {
          phrasesToAdd.push('isolated on white background');
          console.log(`✓ Will add "isolated on white background" to title (exact phrase not found)`);
        } else {
          console.log(`⚠ Title already contains exact phrase "isolated on white background", skipping`);
        }
      }
      
      if (a.isVector && !/vector/i.test(titleLower)) {
        // Only add "vector" if it's not already there and assetType is vector
        if (effType === 'vector') {
          phrasesToAdd.push('vector');
        }
      }
      
      if (a.isIllustration && !/illustration/i.test(titleLower)) {
        // Only add "illustration" if it's not already there and assetType is illustration
        if (effType === 'illustration') {
          phrasesToAdd.push('illustration');
        }
      }
      
      // Append phrases if they fit within the title length limit
      if (phrasesToAdd.length > 0) {
        const phrasesText = phrasesToAdd.join(' ');
        const newTitle = `${title} ${phrasesText}`.trim();
        // Strictly respect the user-selected titleLen
        if (newTitle.length <= a.titleLen) {
          title = newTitle;
          console.log(`✓ Added file attribute phrases to title: "${phrasesText}"`);
        } else {
          console.warn(`⚠ Could not add phrases "${phrasesText}" - would exceed title length limit (${newTitle.length} > ${a.titleLen})`);
        }
      }
      
      // Final validation: Ensure transparent background toggle is respected
      if (a.isolatedOnTransparentBackground) {
        const finalTitleLower = title.toLowerCase();
        // Check if title still contains any background color mentions (should have been removed)
        const stillHasColor = /\b(green|blue|red|yellow|orange|purple|pink|brown|black|gray|grey|colored|coloured)\s+background\b/i.test(title);
        if (stillHasColor) {
          console.error(`❌ VALIDATION FAILED: Title still contains background color mention despite transparent toggle for ${f.name}: "${title}"`);
          // Force remove any remaining color mentions
          title = title.replace(/\b(green|blue|red|yellow|orange|purple|pink|brown|black|gray|grey|colored|coloured)\s+background\b/gi, 'transparent background');
          title = title.replace(/\s+/g, ' ').trim();
          console.log(`🔧 Force-corrected title: "${title}"`);
        }
        
        // Ensure "isolated" or "transparent background" is present
        const hasTransparentPhrase = /isolated|transparent\s+background/i.test(title);
        if (!hasTransparentPhrase) {
          console.warn(`⚠️ VALIDATION: Title missing "isolated" or "transparent background" phrase for ${f.name}, adding it...`);
          const phraseToAdd = 'isolated on transparent background';
          const newTitle = `${title} ${phraseToAdd}`.trim();
          if (newTitle.length <= a.titleLen) {
            title = newTitle;
            console.log(`✓ Added missing transparent background phrase`);
          }
        }
      }

      // Apply user-defined prefix/suffix to the title AFTER all post-processing,
      // so the user's overrides are guaranteed to appear in the final result.
      if (a.prefix && a.prefix.trim().length > 0) {
        const pref = a.prefix.trim();
        const prefLower = pref.toLowerCase();
        const currentLower = title.toLowerCase();
        // Avoid duplicating prefix if model already added it
        if (!currentLower.startsWith(prefLower)) {
          title = `${pref} ${title}`.trim();
        }
      }

      if (a.suffix && a.suffix.trim().length > 0) {
        const suf = a.suffix.trim();
        const sufLower = suf.toLowerCase();
        const currentLower = title.toLowerCase();
        // Avoid duplicating suffix if model already added it
        if (!currentLower.endsWith(sufLower)) {
          title = `${title} ${suf}`.trim();
        }
      }
      
      // Ensure title strictly respects the user-selected limit (no flexible overflow)
      if (title.length > a.titleLen) {
        console.warn(`⚠ Title length ${title.length} exceeds limit ${a.titleLen}, trimming to max...`);
        title = strictTrimTitleToMax(title, a.titleLen);
      }

      // Apply user-specified negative title terms (case-insensitive).
      // Any words/phrases listed in negativeTitle will be stripped from the final title.
      if (Array.isArray(a.negativeTitle) && a.negativeTitle.length > 0) {
        const banned = a.negativeTitle
          .map(s => String(s).trim())
          .filter(Boolean);
        if (banned.length > 0) {
          const pattern = new RegExp(`\\b(${banned.map(escapeRegex).join('|')})\\b`, 'gi');
          const cleaned = title.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
          if (cleaned.length > 0) {
            title = cleaned;
          }
        }
      }

      let description = String(out.description || '').trim();
      // Strict 150 limit for descriptions (no flexible limit)
      if (description.length > 150) description = truncateByChars(description, 150, 0, 150);

      // EXACTLY N good keywords - Ensure title words appear in keywords for all platforms
      // Extract title words and ensure they're prioritized
      const titleWords = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= MIN_LEN && !BAN.has(w) && !STOPWORDS.has(w));
      
      // Auto-fix combined phrases in keywords (Adobe-specific)
      let rawKeywords = Array.isArray(out.keywords) ? out.keywords : [];
      if (a.platform === 'adobe') {
        const splitKeywords: string[] = [];
        rawKeywords.forEach(kw => {
          const kwStr = String(kw).trim();
          const words = kwStr.toLowerCase().split(/\s+/);
          // If keyword has 3+ words, split it into individual keywords
          if (words.length >= 3) {
            // Split into individual words, filtering out very short words
            words.forEach(word => {
              const cleanWord = word.replace(/[^\w]/g, '');
              if (cleanWord.length >= MIN_LEN) {
                splitKeywords.push(cleanWord);
              }
            });
            console.log(`⚠ Auto-split combined phrase: "${kwStr}" → ${words.filter(w => w.replace(/[^\w]/g, '').length >= MIN_LEN).join(', ')}`);
          } else {
            // Keep as-is if 2 words or less
            splitKeywords.push(kwStr.toLowerCase().replace(/[^\w\s]/g, ' ').trim());
          }
        });
        rawKeywords = splitKeywords;
      }
      
      // Prioritize title words for all platforms
      const seeds = titleWords.concat(filenameHints(f.name)); // Title words first for all platforms
      
      const targetCount = a.keywordMode === 'fixed' ? a.keywordCount : AUTO_KEYWORD_CAP;
      const requestedCount = targetCount;
      let keywords = normalizeKeywords(rawKeywords, requestedCount, seeds, a.negativeKeywords);
      
      // Apply keyword enrichment: add synonyms, related terms, and long-tail keywords
      if (keywords.length > 0) {
        // Step 1: Enrich with synonyms and related terms
        keywords = enrichKeywords(keywords, title, a.platform);
        
        // Step 2: Add scientific names (for plants/animals)
        keywords = addScientificNames(keywords);
        
        // Step 3: Extract technical keywords from title
        keywords = extractTechnicalKeywords(keywords, title);
        
        // Step 4: Generate long-tail keyword phrases (high-value search terms)
        const longTailKeywords = generateLongTailKeywords(keywords, title, a.platform);
        
        // Merge long-tail keywords with existing keywords, prioritizing buyer-intent ones
        const existingSet = new Set(keywords.map(k => k.toLowerCase()));
        const newLongTail = longTailKeywords
          .filter(lt => !existingSet.has(lt.toLowerCase()) && lt.length < 40)
          .slice(0, Math.min(15, targetCount - keywords.length));
        
        // Insert long-tail keywords strategically (after top 10, before position 25)
        if (newLongTail.length > 0) {
          const top10 = keywords.slice(0, 10);
          const after10 = keywords.slice(10);
          // Insert long-tail keywords in positions 11-25 range
          const insertPos = Math.min(15, after10.length);
          keywords = [
            ...top10,
            ...newLongTail.slice(0, insertPos),
            ...after10,
            ...newLongTail.slice(insertPos)
          ].slice(0, targetCount);
        }
        
        // Re-normalize to ensure no duplicates and proper formatting
        keywords = normalizeKeywords(keywords, targetCount, seeds, a.negativeKeywords);
      }
      
      // Post-processing: Filter out filename-based keywords when image is provided
      if (imageData && keywords.length > 0) {
        const originalKeywords = [...keywords];
        keywords = filterFilenameBasedKeywords(keywords, f.name);
        const removedKeywords = originalKeywords.filter(k => !keywords.includes(k));
        if (removedKeywords.length > 0) {
          console.warn(`⚠️ POST-PROCESSING: Removed filename-based keywords for ${f.name}:`, removedKeywords);
          // If we removed keywords, try to fill back up to the target count if possible
          if (keywords.length < targetCount) {
            // Use title words that weren't already in keywords
            const titleWordsForKeywords = titleWords
              .filter(w => w.length > 2 && !keywords.some(k => k.toLowerCase() === w.toLowerCase()))
              .slice(0, targetCount - keywords.length);
            keywords = [...keywords, ...titleWordsForKeywords].slice(0, targetCount);
          }
        }
      }
      
      // For all platforms, ensure title words appear in keywords if not already there
      if (titleWords.length > 0) {
        const existingKeywords = new Set(keywords.map(k => k.toLowerCase()));
        const missingTitleWords = titleWords.filter(w => !existingKeywords.has(w));
        
        // Insert missing title words into keywords
        if (missingTitleWords.length > 0) {
          // For Adobe Stock, insert into top 10 positions; for others, insert at the beginning
          if (a.platform === 'adobe') {
            const top10 = keywords.slice(0, 10);
            const after10 = keywords.slice(10);
            const existingInTop10 = new Set(top10.map(k => k.toLowerCase()));
            const toInsert = missingTitleWords
              .filter(w => !existingInTop10.has(w))
              .slice(0, Math.min(10 - top10.length, missingTitleWords.length));
            
            // Rebuild keywords with title words in top 10
            keywords = [...top10, ...toInsert, ...after10]
              .filter((k, idx, arr) => arr.indexOf(k) === idx) // Remove duplicates
              .slice(0, targetCount); // Ensure cap
          } else {
            // For other platforms, insert title words at the beginning
            // Calculate how many we can insert without exceeding the limit
            const availableSlots = targetCount - keywords.length;
            const toInsert = missingTitleWords.slice(0, Math.max(0, availableSlots));
            if (toInsert.length > 0) {
              keywords = [...toInsert, ...keywords]
                .filter((k, idx, arr) => arr.indexOf(k) === idx) // Remove duplicates
                .slice(0, targetCount); // Ensure cap
            }
          }
        }
      }
      
      // Assign keywords to finalKeywords for final processing
      let finalKeywords = [...keywords];
      
      // Apply user-specified negative keywords (case-insensitive) as a hard filter
      if (Array.isArray(a.negativeKeywords) && a.negativeKeywords.length > 0) {
        const negSet = new Set(
          a.negativeKeywords
            .map(s => String(s).trim().toLowerCase())
            .filter(Boolean)
        );
        if (negSet.size > 0) {
          finalKeywords = finalKeywords.filter(k => !negSet.has(String(k).trim().toLowerCase()));
        }
      }
      
      // Final post-processing: Filter out filename-based keywords when image is provided (after enrichment)
      if (imageData && finalKeywords.length > 0) {
        const originalFinalKeywords = [...finalKeywords];
        finalKeywords = filterFilenameBasedKeywords(finalKeywords, f.name);
        const removedFinalKeywords = originalFinalKeywords.filter(k => !finalKeywords.includes(k));
        if (removedFinalKeywords.length > 0) {
          console.warn(`⚠️ POST-PROCESSING: Removed filename-based keywords from final list for ${f.name}:`, removedFinalKeywords);
          // Fill back up to target count if needed
          if (finalKeywords.length < targetCount) {
            const titleWordsForKeywords = titleWords
              .filter(w => w.length > 2 && !finalKeywords.some(k => k.toLowerCase() === w.toLowerCase()))
              .slice(0, targetCount - finalKeywords.length);
            finalKeywords = [...finalKeywords, ...titleWordsForKeywords].slice(0, targetCount);
          }
        }
      }
      
      // Trim for fixed mode; auto mode remains flexible (no filler padding)
      if (a.keywordMode === 'fixed' && finalKeywords.length > a.keywordCount) {
        finalKeywords = finalKeywords.slice(0, a.keywordCount);
      }
      
      // Validate response quality - now using final processed data
      const validation = validateResponse(
        title,
        description,
        finalKeywords,
        a.titleLen,
        a.keywordMode === 'fixed' ? a.keywordCount : undefined,
        f.name,
        !!imageData,
        a.platform
      );
      
      // Score title quality
      const qualityScore = scoreTitleQuality(
        title,
        f.name,
        a.titleLen,
        !!imageData,
        a.platform
      );
      
      // Log quality metrics for monitoring (validation errors removed - prompt should prevent issues)
      if (validation.issues.length > 0) {
        console.warn(`⚠ Validation issues for ${f.name}: ${validation.issues.join('; ')}`);
      }
      if (qualityScore.score < 70) {
        console.warn(`⚠ Low quality title for ${f.name}: Score ${qualityScore.score}/100`);
        console.warn(`   Issues: ${qualityScore.issues.join(', ')}`);
      } else {
        console.log(`✓ Good quality title for ${f.name}: Score ${qualityScore.score}/100`);
      }
      
      // All responses pass through - validation rejection removed
      // The enhanced prompt should prevent validation issues from occurring

      rows.push({
        filename: f.name,
        platform: a.platform === 'adobe' ? 'Adobe Stock' : a.platform === 'general' ? 'General' : 'Shutterstock',
        title,
        description,
        keywords: finalKeywords,
        assetType: effType,
        extension: ext
      });
    };

    // Batch size optimization: process in optimal batches with concurrency limit
    const CONCURRENCY_LIMIT = 3; // Max 3 concurrent API calls
    
    if (a.singleMode) {
      // Single mode: process sequentially
      console.log(`🔄 Single mode: Processing ${a.files.length} files sequentially`);
      for (const f of a.files) {
        await handleOne(f);
      }
    } else {
      // Batch mode: process files with concurrency control
      console.log(`⚡ Batch mode: Processing ${a.files.length} files with concurrency limit of ${CONCURRENCY_LIMIT}`);
      
      // Process files in batches with concurrency limit
      for (let i = 0; i < a.files.length; i += CONCURRENCY_LIMIT) {
        const batch = a.files.slice(i, i + CONCURRENCY_LIMIT);
        console.log(`📦 Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}: ${batch.length} files`);
        await Promise.all(batch.map(f => handleOne(f)));
      }
    }

    // Note: Generation tracking will be handled client-side
    // The client will call a tracking endpoint after successful generation

    return NextResponse.json({ rows });
  } catch (error: any) {
    console.error('Generate route error:', error);
    return NextResponse.json({ 
      message: error?.message || 'Failed to generate metadata',
      error: error?.stack 
    }, { status: 500 });
  }
}
