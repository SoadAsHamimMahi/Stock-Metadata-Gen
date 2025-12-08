// src/lib/util.ts
export const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export const dedupe = <T,>(arr: T[]) => Array.from(new Set(arr));

export const sanitizeWords = (words: string[]) =>
  dedupe(words.map(w => String(w).trim().toLowerCase()).filter(Boolean));

export const stripNegatives = (arr: string[], neg: string[]) =>
  arr.filter(k => !neg.includes(k.toLowerCase()));

export const truncateByChars = (s: string, max: number, flexibleLimit?: number, absoluteMax: number = 200) => {
  // Calculate dynamic flexible limit: 13% of max or minimum 17 chars
  const calculatedFlexibleLimit = flexibleLimit ?? Math.max(Math.round(max * 0.13), 17);
  if (s.length <= max) return s;
  
  // Calculate the flexible maximum (base limit + flexible, but never exceed absolute max)
  const flexibleMax = Math.min(max + calculatedFlexibleLimit, absoluteMax);
  
  // If the string is within the flexible range, try to find a good boundary
  if (s.length <= flexibleMax) {
    // First, try to find sentence boundaries (period, exclamation, question mark) within flexible range
    // Look backwards from the end of the string within the flexible range
    for (let i = Math.min(s.length, flexibleMax); i >= max; i--) {
      const char = s[i - 1];
      if (char === '.' || char === '!' || char === '?') {
        // Found a sentence ender, check if there's whitespace after it or it's at the end
        if (i === s.length || (i < s.length && s[i] === ' ')) {
          return s.slice(0, i).trimEnd();
        }
      }
    }
    
    // If no sentence boundary found, try word boundaries
    for (let i = Math.min(s.length, flexibleMax); i >= max; i--) {
      if (i < s.length && s[i] === ' ') {
        // Found a space, check if it's a good word boundary
        const candidate = s.slice(0, i);
        if (candidate.length >= max * 0.7) {
          return candidate.trimEnd();
        }
      }
    }
    
    // If we're within flexible range and no good boundary found, return as-is
    // This allows titles to exceed the base limit by up to calculatedFlexibleLimit chars for sentence completion
    return s;
  }
  
  // String exceeds flexible max, must truncate
  // Try to find sentence boundaries first within the flexible range
  const truncated = s.slice(0, flexibleMax);
  for (let i = flexibleMax; i >= max; i--) {
    const char = truncated[i - 1];
    if (char === '.' || char === '!' || char === '?') {
      // Found a sentence ender
      return truncated.slice(0, i).trimEnd();
    }
  }
  
  // Try word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > max * 0.7) {
    return truncated.slice(0, lastSpace).trimEnd() + '…';
  }
  
  // No good boundary found, truncate at flexible max
  return truncated.trimEnd() + '…';
};

// Junk tokens that must NOT become subject hints
const STOP = new Set([
  'generated','generate','image','img','photo','photograph','picture','wallpaper',
  'final','copy','export','new','untitled','file','files','download',
  'high','quality','professional','commercial','stock','royalty','royalty-free','rf',
  'gemini','mistral','gpt','ai','stable','midjourney','version','v1','v2','v3',
  'jpeg','jpg','png','webp','svg','eps','ai','mp4','mov','m4v','webm'
]);

/** Extract compact, meaningful tokens from a filename. */
export function filenameHints(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .split(/[\s._-]+/g)
    .map(w => w.toLowerCase())
    .filter(w => w && !STOP.has(w) && !/^\d+$/.test(w))
    .slice(0, 12);
}

// Check if a title appears to be just filename parts
export function isFilenameBased(title: string, filename: string): boolean {
  if (!title || !filename) return false;
  const titleLower = title.toLowerCase();
  const filenameLower = filename.toLowerCase().replace(/\.[^.]+$/, '');
  
  if (/\b(gemini|mistral|google|openai)\b/i.test(titleLower)) return true;
  
  const filenameNumbers = filenameLower.match(/\d{3,}/g) || [];
  if (filenameNumbers.some(num => titleLower.includes(num))) return true;
  
  const filenameWords = filenameLower.split(/[\s._-]+/g).filter(w => w.length > 2 && !/^\d+$/.test(w));
  if (filenameWords.some(w => w.length > 3 && titleLower === w)) return true;
  
  const titleWords = titleLower.split(/\s+/).filter(w => w.length > 2);
  const matchingWords = titleWords.filter(tw => filenameWords.some(fw => tw === fw || tw.includes(fw) || fw.includes(tw)));
  if (titleWords.length > 0 && matchingWords.length / titleWords.length > 0.5) {
    return true;
  }
  
  if (/\b[0-9a-f]{8,}-?[0-9a-f]{4,}/i.test(titleLower)) return true;
  if (/\b[0-9]{10,}\b/.test(titleLower)) return true;
  
  if (title.length < 20 && filenameWords.some(w => titleLower.includes(w) && w.length > 4)) {
    return true;
  }
  
  return false;
}

// Check if a keyword appears to be from the filename
export function isKeywordFromFilename(keyword: string, filename: string): boolean {
  if (!keyword || !filename) return false;
  const keywordLower = keyword.toLowerCase().trim();
  const filenameLower = filename.toLowerCase().replace(/\.[^.]+$/, '');
  
  // Extract all parts from filename (words, numbers, hashes)
  const filenameParts = filenameLower.split(/[\s._-]+/g);
  
  // Check for exact matches (case-insensitive)
  if (filenameParts.includes(keywordLower)) return true;
  
  // Check for long alphanumeric strings (hashes/IDs) - if keyword contains them
  const longAlphanumeric = filenameLower.match(/[0-9a-f]{8,}/gi) || [];
  if (longAlphanumeric.some(hash => keywordLower.includes(hash))) return true;
  
  // Check for long numbers (10+ digits)
  const longNumbers = filenameLower.match(/\d{10,}/g) || [];
  if (longNumbers.some(num => keywordLower.includes(num))) return true;
  
  // Check if keyword is a significant part of filename (4+ chars)
  const significantParts = filenameParts.filter(p => p.length >= 4);
  if (significantParts.some(part => keywordLower === part || keywordLower.includes(part))) return true;
  
  return false;
}

// Filter out filename-based keywords from an array
export function filterFilenameBasedKeywords(keywords: string[], filename: string): string[] {
  if (!keywords || !filename) return keywords || [];
  return keywords.filter(k => !isKeywordFromFilename(k, filename));
}

// localStorage helpers
export function getJSON<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setJSON<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Encryption helpers for sensitive data
async function getSessionKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined') return null;
  try {
    const keyData = localStorage.getItem('smg_session_key');
    if (!keyData) {
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      const exported = await crypto.subtle.exportKey('raw', key);
      localStorage.setItem('smg_session_key', btoa(String.fromCharCode(...new Uint8Array(exported))));
      return key;
    }
    const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
    return await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

export async function setEncryptedJSON<T>(key: string, value: T): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const sessionKey = await getSessionKey();
    if (!sessionKey) {
      setJSON(key, value);
      return;
    }
    const data = JSON.stringify(value);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, encoded);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    localStorage.setItem(key, btoa(String.fromCharCode(...combined)));
  } catch {
    setJSON(key, value);
  }
}

export async function getDecryptedJSON<T>(key: string, defaultValue: T): Promise<T> {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    const sessionKey = await getSessionKey();
    if (!sessionKey) {
      return getJSON(key, defaultValue);
    }
    const combined = Uint8Array.from(atob(item), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sessionKey, encrypted);
    const data = new TextDecoder().decode(decrypted);
    return JSON.parse(data);
  } catch {
    return getJSON(key, defaultValue);
  }
}

// Title quality scoring
export interface TitleQualityScore {
  score: number; // 0-100
  issues: string[];
  strengths: string[];
}

const GENERIC_WORDS = new Set(['design', 'graphic', 'image', 'photo', 'picture', 'element', 'item', 'object', 'thing']);
// Minimal banned words - only AI model names
const BANNED_IN_TITLE = new Set(['gemini', 'mistral']);

export function scoreTitleQuality(
  title: string, 
  filename: string, 
  expectedLength: number,
  hasImage: boolean,
  platform?: 'general' | 'adobe' | 'shutterstock'
): TitleQualityScore {
  const issues: string[] = [];
  const strengths: string[] = [];
  let score = 100;
  
  // Length check - account for flexible limit (13% or min 17 chars over, max 200)
  const flexibleLimit = Math.max(Math.round(expectedLength * 0.13), 17);
  const flexibleMax = Math.min(expectedLength + flexibleLimit, 200);
  const hardMax = 200;
  
  if (title.length > hardMax) {
    issues.push(`Title exceeds hard limit of ${hardMax} characters (${title.length} chars)`);
    score -= 20;
  } else if (title.length > flexibleMax) {
    issues.push(`Title exceeds flexible limit: ${title.length} chars (base: ${expectedLength}, flexible: ${flexibleMax})`);
    score -= 10;
  } else if (title.length > expectedLength) {
    // Within flexible range - this is allowed for sentence completion, no penalty
    strengths.push(`Title within flexible range (${title.length} chars, base limit: ${expectedLength})`);
  } else if (title.length < 10) {
    issues.push('Title is too short (less than 10 characters)');
    score -= 15;
  } else {
    strengths.push(`Title length appropriate (${title.length} chars)`);
  }
  
  // Check for banned words
  const titleLower = title.toLowerCase();
  for (const banned of BANNED_IN_TITLE) {
    if (titleLower.includes(banned)) {
      issues.push(`Contains banned word: "${banned}"`);
      score -= 10;
    }
  }
  
  // Check for generic words (too many = bad)
  const titleWords = titleLower.split(/\s+/);
  const genericCount = titleWords.filter(w => GENERIC_WORDS.has(w)).length;
  if (genericCount > 2) {
    issues.push(`Too many generic words (${genericCount})`);
    score -= 10;
  } else if (genericCount === 0) {
    strengths.push('No generic filler words');
  }
  
  // Check for filename-based title
  if (hasImage && isFilenameBased(title, filename)) {
    issues.push('Title appears to be based on filename, not image content');
    score -= 25;
  }
  
  // Check for specificity (more unique words = better)
  const uniqueWords = new Set(titleWords.filter(w => w.length > 3));
  if (uniqueWords.size < 3) {
    issues.push('Title lacks specificity (too few unique descriptive words)');
    score -= 15;
  } else {
    strengths.push(`Good specificity (${uniqueWords.size} unique descriptive words)`);
  }
  
  // Adobe-specific checks
  if (platform === 'adobe') {
    // Length warning (not error, but note recommendation)
    if (title.length > 70) {
      issues.push('Adobe Stock: Title exceeds 70 character recommendation (up to 200 allowed)');
      score -= 5; // Minor penalty, not a hard error
    }
    
    // Check for keyword list format (too many commas/semicolons)
    const commaCount = (title.match(/,/g) || []).length;
    const semicolonCount = (title.match(/;/g) || []).length;
    if (commaCount > 3 || semicolonCount > 1) {
      issues.push('Adobe Stock: Title appears to be a keyword list (too many commas/semicolons). Use descriptive phrases instead.');
      score -= 15;
    }
    
    // Check for style references
    const STYLE_REF_PATTERNS = [
      /in the style of/i,
      /inspired by/i,
      /influenced by/i,
      /similar to/i,
      /like\s+(?:the\s+)?(?:movie|film|comic|book|game|franchise)/i,
      /drawing on/i,
      /in the tradition of/i
    ];
    for (const pattern of STYLE_REF_PATTERNS) {
      if (pattern.test(title)) {
        issues.push('Adobe Stock: Title contains style reference (prohibited by Adobe guidelines)');
        score -= 20;
        break;
      }
    }
    
    // Check for third-party IP (basic brand detection)
    const COMMON_BRANDS = new Set([
      'apple', 'google', 'microsoft', 'amazon', 'facebook', 'meta', 'twitter', 'x', 'instagram',
      'youtube', 'netflix', 'disney', 'nike', 'adidas', 'coca-cola', 'pepsi', 'starbucks',
      'mcdonalds', 'burger king', 'toyota', 'honda', 'ford', 'tesla', 'bmw', 'mercedes',
      'samsung', 'sony', 'nintendo', 'playstation', 'xbox', 'iphone', 'ipad', 'android',
      'windows', 'macos', 'linux', 'adobe', 'photoshop', 'illustrator'
    ]);
    const titleWordsForIP = titleLower.split(/\W+/).filter(w => w.length > 2);
    const foundBrands = titleWordsForIP.filter(w => COMMON_BRANDS.has(w));
    if (foundBrands.length > 0) {
      issues.push(`Adobe Stock: Title contains third-party IP/brand names: ${foundBrands.join(', ')} (prohibited)`);
      score -= 25;
    }
    
    // Check for person/artist names (basic pattern - multiple capitalized words)
    const words = title.split(/\s+/);
    const capitalizedWords = words.filter(w => /^[A-Z][a-z]+$/.test(w) && w.length > 3);
    if (capitalizedWords.length > 2 && !title.match(/^[A-Z]/)) {
      issues.push('Adobe Stock: Title may contain person/artist names (prohibited)');
      score -= 15;
    }
    
    // Check for background mention (if white background is common)
    if (!titleLower.includes('white') && !titleLower.includes('background') && !titleLower.includes('isolated')) {
      // Not necessarily an issue, but could be a strength if background is mentioned
    }
  }
  
  // Check for incomplete sentences (ends with common cut-off patterns)
  if (title.match(/\.\.\.$|…$|,$/)) {
    issues.push('Title appears to be truncated or incomplete');
    score -= 20;
  }
  
  // Check for proper capitalization (should be title case or sentence case)
  const firstChar = title[0];
  if (firstChar && firstChar === firstChar.toLowerCase()) {
    issues.push('Title should start with capital letter');
    score -= 5;
  }
  
  // Minimum score
  score = Math.max(0, Math.min(100, score));
  
  return { score, issues, strengths };
}

// Keyword quality scoring
export interface KeywordQualityScore {
  score: number; // 0-100
  issues: string[];
  strengths: string[];
}

const BANNED_KEYWORDS = new Set(['professional', 'high quality', 'stock', 'commercial', 'royalty free', 'royalty-free', 'image', 'photo', 'photograph', 'picture', 'generated', 'gemini', 'mistral']);

export function scoreKeywordQuality(
  keywords: string[],
  expectedCount: number,
  title?: string
): KeywordQualityScore {
  const issues: string[] = [];
  const strengths: string[] = [];
  let score = 100;
  
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return { score: 0, issues: ['No keywords provided'], strengths: [] };
  }
  
  // Count check
  if (keywords.length !== expectedCount) {
    issues.push(`Keyword count mismatch: ${keywords.length} (expected ${expectedCount})`);
    score -= 15;
  } else {
    strengths.push(`Correct keyword count (${keywords.length})`);
  }
  
  // Check for duplicates
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  const duplicates = lowerKeywords.filter((k, i) => lowerKeywords.indexOf(k) !== i);
  if (duplicates.length > 0) {
    issues.push(`Duplicate keywords: ${[...new Set(duplicates)].join(', ')}`);
    score -= 10;
  } else {
    strengths.push('No duplicate keywords');
  }
  
  // Check for banned keywords
  const bannedFound = keywords.filter(k => BANNED_KEYWORDS.has(k.toLowerCase()));
  if (bannedFound.length > 0) {
    issues.push(`Banned keywords: ${bannedFound.join(', ')}`);
    score -= 15;
  } else {
    strengths.push('No banned keywords');
  }
  
  // Check keyword length (too short or too long)
  const shortKeywords = keywords.filter(k => k.length < 2);
  const longKeywords = keywords.filter(k => k.length > 30);
  if (shortKeywords.length > 0) {
    issues.push(`Too short keywords: ${shortKeywords.length}`);
    score -= 5;
  }
  if (longKeywords.length > 0) {
    issues.push(`Too long keywords: ${longKeywords.length}`);
    score -= 5;
  }
  
  // Check if title words appear in keywords (good practice)
  if (title) {
    const titleWords = title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);
    const keywordSet = new Set(lowerKeywords);
    const matchingTitleWords = titleWords.filter(w => keywordSet.has(w));
    if (matchingTitleWords.length > 0) {
      strengths.push(`Title words in keywords (${matchingTitleWords.length})`);
    } else if (titleWords.length > 0) {
      issues.push('Title words not found in keywords');
      score -= 5;
    }
  }
  
  // Check for generic keywords (too many = bad)
  const genericKeywords = ['design', 'graphic', 'element', 'item', 'object', 'thing'];
  const genericCount = keywords.filter(k => genericKeywords.includes(k.toLowerCase())).length;
  if (genericCount > keywords.length * 0.3) {
    issues.push(`Too many generic keywords (${genericCount})`);
    score -= 10;
  }
  
  // Minimum score
  score = Math.max(0, Math.min(100, score));
  
  return { score, issues, strengths };
}
