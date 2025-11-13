// Generates Adobe Stock metadata with Gemini or Mistral and enforces EXACTLY 49 keywords.

type Provider = 'gemini' | 'mistral';

export type AdobeOut = { title: string; keywords: string[] };

const PLATFORM_RULES = `
Role: Senior microstock editor.

Goal: Return PURE JSON only: {"title": string, "keywords": string[]}

Context: Platform=Adobe Stock, Asset can be photo/illustration/vector/video; use commercial-safe language.

CRITICAL: If an image is provided, you MUST:
1. First, carefully analyze the provided image in detail
2. Identify all visible subjects, objects, colors, textures, patterns, and details
3. Generate title based EXCLUSIVELY on what you actually see in the image
4. Generate keywords describing ONLY the visual content you observe
5. Do NOT rely on filename hints - use them only as secondary clues if image is unclear

Title rules:
- ≤ 200 characters
- Structure: "[Adjective] [Primary Subject] with [Secondary Elements] in [Setting/Context]"
- Example: "Cozy Christmas pillow with knitted bulldog in red hat and scarf"
- natural, descriptive; front-load subject + strong modifiers
- no brands, celebrities, private names, or release claims
- describe VISUAL CONTENT only - what you can see in the image
- NEVER include generic terms like "for commercial use", "photograph", "stock photo", "generated image"
- NEVER include numbers, IDs, or filename artifacts

Keyword rules:
- EXACTLY 49 items
- all lowercase
- unique (no duplicates), no quotes
- prioritize concrete, buyer-intent terms and variants
- Adobe-safe (no brand/celebrity names)
- describe VISUAL CONTENT: subjects, actions, emotions, settings, styles, colors

Generate keywords in this hierarchical order to maximize ranking:
1. PRIMARY SUBJECTS + SYNONYMS: For each main subject, include all synonyms and related terms
   Example: "bulldog" → include "dog", "puppy", "pet", "animal", "canine"
2. SECONDARY ELEMENTS: All visible objects, accessories, details
   Example: "pillow", "cushion", "beanie", "pompom", "scarf", "mittens", "hat"
3. STYLE/TECHNIQUE TERMS: Artistic style, materials, techniques - expand related terms
   Example: "knit" → include "knitted", "wool", "yarn", "embroidery", "applique", "handmade", "textile", "fabric", "craft"
4. SETTING/CONTEXT TERMS: Location, environment, mood, time - expand related terms
   Example: "christmas" → include "xmas", "holiday", "festive", "winter", "seasonal", "cozy", "warm"
5. RELATED CONCEPTS: Associated items, themes, decorative elements
   Example: "gift", "present", "candy cane", "snow", "snowflakes", "christmas tree", "pine tree", "ornament", "pattern"
6. LONG-TAIL SEARCH TERMS: Buyer-intent phrases, use cases, applications
   Example: "home decor", "living room", "sofa", "couch", "hygge", "winter decor", "design", "plush"

NEVER include generic terms like "commercial", "stock", "photo", "image", "picture"
NEVER include provider names like "gemini", "mistral"
`;

function buildUserPrompt(opts: {
  assetType?: 'photo'|'illustration'|'vector'|'video'|'3d'|'icon';
  extension?: string;
  filenameHints: string[];            // tokens like ["bulldog","pillow","christmas"]
  negativeTitle?: string[];
  negativeKeywords?: string[];
  hasImage?: boolean;
}) {
  const { assetType='photo', extension='', filenameHints, negativeTitle=[], negativeKeywords=[], hasImage=false } = opts;
  return [
    `${PLATFORM_RULES}`,
    ``,
    `${hasImage ? 'IMPORTANT: An image is provided. Analyze it carefully. Describe what you see: subjects, objects, colors, textures, setting, mood, style, and all visible details.' : ''}`,
    `AssetType:${assetType} Ext:${extension}`,
    `FilenameHints:${filenameHints.join(', ')} ${hasImage ? '(use only as secondary clues if image is unclear)' : '(interpret these as clues about visual content, do NOT use literally)'}`,
    `NegativeTitle:[${negativeTitle.join(', ') || 'none'}]`,
    `NegativeKeywords:[${negativeKeywords.join(', ') || 'none'}]`,
    ``,
    `KEYWORD GENERATION EXAMPLE:`,
    `For a "cozy christmas pillow with knitted bulldog", generate 49 keywords like:`,
    `- Primary subjects: bulldog, dog, puppy, pet, animal, canine`,
    `- Secondary elements: pillow, cushion, beanie, pompom, scarf, mittens, hat`,
    `- Style/technique: knit, knitted, wool, yarn, embroidery, applique, handmade, textile, fabric, craft`,
    `- Setting/context: christmas, xmas, holiday, festive, winter, seasonal, cozy, warm`,
    `- Related concepts: gift, present, candy cane, snow, snowflakes, christmas tree, pine tree, ornament, pattern, plush`,
    `- Long-tail: home decor, living room, sofa, couch, hygge, winter decor, design`,
    ``,
    `Output: {"title": "...", "keywords": ["k1","k2",...,"k49"]}`
  ].join('\n');
}

// Helper to find available Gemini model
async function findAvailableGeminiModel(key: string): Promise<{ model: string; version: string } | null> {
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const models = listData.models || [];
      const geminiModel = models.find((m: any) => 
        m.name && (
          m.name.includes('gemini-pro') || 
          m.name.includes('gemini-1.5') ||
          m.name.includes('gemini-2.0')
        ) && m.supportedGenerationMethods?.includes('generateContent')
      );
      if (geminiModel) {
        return { model: geminiModel.name.replace('models/', ''), version: 'v1' };
      }
    }
  } catch {
    // Continue
  }
  
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    if (listRes.ok) {
      const listData = await listRes.json();
      const models = listData.models || [];
      const geminiModel = models.find((m: any) => 
        m.name && (
          m.name.includes('gemini-pro') || 
          m.name.includes('gemini-1.5') ||
          m.name.includes('gemini-2.0')
        ) && m.supportedGenerationMethods?.includes('generateContent')
      );
      if (geminiModel) {
        return { model: geminiModel.name.replace('models/', ''), version: 'v1beta' };
      }
    }
  } catch {
    // Continue
  }
  
  return null;
}

// --- provider calls ----------------------------------------------------------

async function callGemini(prompt: string, apiKey?: string, imageData?: string) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');

  // Try to find available model
  let modelInfo = await findAvailableGeminiModel(key);
  
  // Fallback models to try in order
  const fallbackModels = [
    { model: 'gemini-pro', version: 'v1' },
    { model: 'gemini-1.5-flash-latest', version: 'v1beta' },
    { model: 'gemini-1.5-pro-latest', version: 'v1beta' },
    { model: 'gemini-1.5-flash', version: 'v1beta' },
    { model: 'gemini-1.5-pro', version: 'v1beta' },
    { model: 'gemini-pro', version: 'v1beta' }
  ];
  
  const modelsToTry = modelInfo ? [modelInfo, ...fallbackModels] : fallbackModels;

  const parts: any[] = [];
  
  // Add image if provided
  if (imageData) {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const base64Data = match[2];
      parts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data
        }
      });
    }
  }
  
  // Add text prompt
  parts.push({ text: `${PLATFORM_RULES}\n\n${prompt}` });

  const body = {
    contents: [
      {
        role: 'user',
        parts
      }
    ]
  };

  // Try each model until one works
  for (const { model, version } of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
      
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
        if (text) {
          try {
            return JSON.parse(text);
          } catch {
            continue; // Try next model
          }
        }
      }
    } catch {
      continue; // Try next model
    }
  }

  throw new Error('No available Gemini models found');
}

async function callMistral(prompt: string, apiKey?: string) {
  const key = apiKey || process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('MISTRAL_API_KEY missing');

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'Respond with PURE JSON only: {"title": string, "keywords": string[]}' },
        { role: 'user',   content: `${PLATFORM_RULES}\n\n${prompt}` }
      ]
    })
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Mistral API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(text);
}

// --- sanitization & enforcement ---------------------------------------------

function sanitize(out: any): AdobeOut {
  // title
  let title = String(out?.title ?? '').trim();
  
  // Remove generic terms
  title = title.replace(/\b(for\s+)?commercial\s+use\b/gi, '');
  title = title.replace(/\bstock\s+photo\b/gi, '');
  title = title.replace(/\bstock\s+image\b/gi, '');
  title = title.replace(/\bgenerated\s+image\b/gi, '');
  title = title.replace(/\b(gemini|mistral|google|openai)\b/gi, '');
  title = title.replace(/\b\d{3,}\b/g, ''); // Remove numbers like "33975"
  title = title.replace(/\s+/g, ' ').trim();
  
  if (!title) title = 'Commercial stock asset';

  // keywords
  let kws = Array.isArray(out?.keywords) ? out.keywords : [];
  kws = kws.map((k: any) => String(k).trim().toLowerCase()).filter(Boolean);
  
  // Remove generic terms from keywords
  const genericTerms = new Set(['commercial', 'stock', 'image', 'photo', 'picture', 'photograph', 'illustration', 'file', 'asset', 'generated', 'gemini', 'mistral']);
  kws = kws.filter(k => !genericTerms.has(k) && k.length > 1 && !/^\d+$/.test(k));

  // uniqueness & cap to 49
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const k of kws) {
    if (!seen.has(k)) { seen.add(k); uniq.push(k); }
    if (uniq.length === 49) break;
  }

  // if <49, pad with safe fallbacks from title words
  if (uniq.length < 49) {
    const seed = title.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !genericTerms.has(w));
    
    for (const w of seed) {
      if (!seen.has(w)) { seen.add(w); uniq.push(w); }
      if (uniq.length === 49) break;
    }
    // Contextual fallbacks (still descriptive, avoid generic platform terms)
    const contextual = ['cozy','holiday','winter','seasonal','decor','home','gift','present','pattern','craft','textile','fabric','ornament','plush'];
    for (const c of contextual) {
      if (uniq.length >= 49) break;
      if (!seen.has(c)) { seen.add(c); uniq.push(c); }
    }
    // As an absolute last resort, generate unique placeholders (rare)
    while (uniq.length < 49) {
      const filler = `keyword${uniq.length}`;
      if (!seen.has(filler)) { seen.add(filler); uniq.push(filler); }
    }
  }

  // final hard limits - allow flexible limit for sentence completion
  if (title.length > 200) {
    // Use truncateByChars if available, otherwise fallback to simple truncation
    // Note: microstock.ts doesn't import truncateByChars, so we'll use a simple approach
    // that respects the 200 hard limit
    title = title.slice(0, 199).trimEnd() + '…';
  }
  return { title, keywords: uniq.slice(0, 49) };
}

// --- public function ---------------------------------------------------------

export async function generateAdobe({
  provider,
  filename,
  assetType = 'photo',
  extension = '',
  negativeTitle = [],
  negativeKeywords = [],
  apiKey, // optional bearer override from client modal
  imageData // optional base64-encoded image data
}: {
  provider: Provider;
  filename: string;
  assetType?: 'photo'|'illustration'|'vector'|'video'|'3d'|'icon';
  extension?: string;
  negativeTitle?: string[];
  negativeKeywords?: string[];
  apiKey?: string;
  imageData?: string;
}): Promise<AdobeOut> {
  const hints = filename
    .replace(/\.[^.]+$/, '')
    .split(/[\s._-]+/g)
    .map(w => w.toLowerCase().trim())
    .filter(w => {
      // Filter out generic terms, numbers, IDs
      if (['generated', 'image', 'photo', 'picture', 'img', 'pic'].includes(w)) return false;
      if (['gemini', 'mistral', 'google', 'openai'].includes(w)) return false;
      if (w.length <= 1 || /^\d+$/.test(w)) return false;
      if (/^[a-z0-9]{6,}$/i.test(w) && !/^[a-z]{3,}$/i.test(w)) return false;
      return true;
    })
    .filter(Boolean);

  const userPrompt = buildUserPrompt({
    assetType, extension, filenameHints: hints,
    negativeTitle, negativeKeywords,
    hasImage: !!imageData
  });

  const raw = provider === 'gemini'
    ? await callGemini(userPrompt, apiKey, imageData)
    : await callMistral(userPrompt, apiKey);

  return sanitize(raw);
}

