// src/lib/models.ts
import { filenameHints, truncateByChars, dedupe, filterFilenameBasedKeywords } from './util';

import type { GeminiModel, MistralModel, GroqModel } from './types';

export type ModelArgs = {
  platform: 'general' | 'adobe' | 'shutterstock';
  titleLen: number;
  descLen: number;           // usually 150
  keywordMode?: 'auto' | 'fixed';
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
  objectNames?: {
    common_names: string[];
    scientific_names: string[];
    specific_types: string[];
    technical_attributes: string[];
  };
  geminiModel?: GeminiModel;  // Selected Gemini model
  mistralModel?: MistralModel; // Selected Mistral model
  groqModel?: GroqModel; // Selected Groq model
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
  video: 'Video-specific: Describe motion, camera movement, and pacing. Include subject + action/motion + camera work + setting. Use motion verbs (flying, flowing, rotating, panning, tracking). Identify video type (timelapse, slow-motion, drone footage, etc.). Include tech tags ONLY if provided in hints (4K, 60fps, etc.). Structure: [Subject] [action/motion] [camera movement] [setting] [tech tags if provided].'
} as const;

function rules(
  keywordMode: 'auto' | 'fixed' | undefined,
  keywordCount: number,
  titleLen: number,
  hasImage: boolean = false,
  platform?: 'general' | 'adobe' | 'shutterstock',
  isVideo?: boolean
) {
  // Keyword target:
  // - auto: encourage a tight, high-precision set (typically 20–35)
  // - fixed: respect the user-selected count (up to 49)
  const safeKeywordCount =
    keywordMode === 'auto'
      ? Math.max(15, Math.min(keywordCount, 35))
      : Math.max(5, Math.min(keywordCount, 49));
  
  const imageInstructions = hasImage ? `
CRITICAL: An image is provided. You MUST:
1. IDENTIFY SPECIFIC OBJECT NAMES (CRITICAL - DO NOT USE GENERIC TERMS):
   - For PLANTS: Identify SPECIFIC species names (both common AND scientific names if identifiable)
     * Examples: "Prairie dropseed Sporobolus heterolepis", "Karl Foerster Calamagrostis acutiflora", "Red maple Acer rubrum"
     * DO NOT use generic terms like "grass", "plant", "tree" - use SPECIFIC species names
     * If you see multiple types, identify EACH one specifically (e.g., "Prairie dropseed and Calamagrostis acutiflora" not "different grass types")
   - For ANIMALS: Identify SPECIFIC breed or species names
     * Examples: "Jack Russel Terrier", "Golden Retriever", "Persian cat", "Bengal tiger"
     * DO NOT use generic terms like "dog", "cat", "bird" - use SPECIFIC breed/species names
   - For OBJECTS: Identify SPECIFIC types, models, or categories when clearly visible
     * Examples: "iPhone 14", "MacBook Pro", "Nikon D850" (only if clearly visible, don't invent)
   - CRITICAL: If you cannot identify a specific species/breed, still try to be as specific as possible (e.g., "tall ornamental grass" not just "grass")
   - Analyze the image carefully and describe what you actually see with SPECIFIC names
${isVideo ? `2. VIDEO-SPECIFIC ANALYSIS (CRITICAL - Compare frames to detect motion):
   - This image contains frames from the start, middle, and end of a video (combined into a vertical strip)
   - FRAME COMPARISON METHOD: Compare the top frame (start) with middle frame, and middle with bottom frame (end) to detect changes
   - Analyze MOTION by comparing frames:
     * Look for position changes: Has the subject moved between frames? (flying, flowing, rotating, drifting, etc.)
     * Look for scale changes: Is the subject getting closer/farther? (zooming in/out, approaching, receding)
     * Look for blur/motion trails: Fast motion creates blur - use terms like "fast-paced", "dynamic movement"
     * Look for time progression: Dramatic lighting/sky changes suggest timelapse; minimal changes suggest slow-motion or real-time
   - Analyze CAMERA MOVEMENT by comparing frames:
     * Background shift = camera panning/tracking (left-right, up-down movement)
     * Perspective change = camera moving forward/backward (dolly, tracking shot)
     * Angle change = camera tilting/rotating
     * Consistent high-angle view = aerial/drone footage
     * No background change but subject moves = static camera, moving subject
   - Analyze PACING:
     * Large changes between frames = fast-paced or timelapse
     * Small subtle changes = slow-motion or gentle movement
     * No visible changes = static shot (but still describe as "video" with subject description)
   - Identify VIDEO TYPE:
     * Dramatic time/lighting changes = timelapse
     * Slow, smooth motion = slow-motion
     * High aerial view = drone footage
     * Smooth horizontal movement = panning shot
     * Following a subject = tracking shot
   - FALLBACK GUIDANCE: If motion is unclear or subtle:
     * Use descriptive motion terms: "dynamic", "moving", "flowing", "animated"
     * Describe what IS visible: subject, setting, composition
     * Use general video terms: "footage", "video", "clip" (but avoid generic "stock video")
     * Focus on the visual content even if motion is minimal
   - Generate metadata that captures the DYNAMIC nature of video content, not just static frames` : ''}   ${isVideo ? `VIDEO BACKGROUND ANALYSIS:
   - Videos typically have SOLID backgrounds (not transparent) - analyze the actual background color/type
   - If background is DARK/BLACK: describe as "dark background", "black background", or "on dark"
   - If background is WHITE: describe as "white background" or "on white"
   - If background has a COLOR: mention the specific color (e.g., "blue background", "on blue")
   - ONLY use "transparent background" or "isolated" if you can CLEARLY see transparency/alpha channel in the frames
   - DO NOT assume transparency for videos - most videos have solid backgrounds
   ` : ''}

2. Pay special attention to the BACKGROUND: 
   - FIRST: Check if the background has transparency (alpha channel). If transparent, it has NO COLOR - describe as "transparent background" or "isolated" ONLY.
   - If transparent: DO NOT mention ANY background color (not green, not white, not any color) - ONLY say "transparent background" or "isolated"
   - If the background is white, include "white background" or "isolated on white"
   - If the background has a specific color (and is NOT transparent), mention that color
   - CRITICAL: If you see transparent areas, they have NO background color. DO NOT mention "green background", "colored background", or any color for transparent backgrounds.
   - FORBIDDEN: Never mention "green background" unless the background is actually a solid green color (not transparent)
3. Generate title based ONLY on visible content: subjects, objects, colors, textures, setting, AND background (only if visible/colored, not if transparent)${isVideo ? '. For videos, also include motion, camera movement, and video type in the title' : ''}
4. Generate keywords describing ONLY what you observe: subjects, objects, colors, textures, setting, AND background details (transparent/white/colored - be accurate!)${isVideo ? '. For videos, also include motion keywords, camera movement terms, video type, and pacing' : ''}
${isVideo ? '5. VIDEO-SPECIFIC: DO NOT use filename hints - analyze ONLY the video frames you see. Focus on motion, camera work, and dynamic elements visible across the frames' : '5. Use filename hints only as secondary clues if the image is unclear'}
` : '';
  
  const adobeTitleGuidance = platform === 'adobe' ? `
For Adobe Stock: Titles should be COMPLETE and natural. Aim to stay within ${titleLen} characters (max 200).
Write a natural, descriptive title (a short phrase or sentence), not a keyword list.
IMPORTANT: Use no more than 3 commas (",") and at most 1 semicolon (";") in the title.
If you need to list many elements, group them with words like "and", "with", or simplify the phrase into a single descriptive clause.
Include specific details: animal species names, location names (city/state/country), equipment names (ONLY if the equipment is clearly visible and is a main subject, e.g., "drone", "smartphone", "camera lens" - do NOT invent camera models or metadata from EXIF), specific actions.

OBJECT NAME DETECTION (CRITICAL for SEO ranking):
- ALWAYS include scientific names when detected (e.g., "Sporobolus heterolepis", "Calamagrostis acutiflora")
- Include common names alongside scientific names (e.g., "Prairie dropseed Sporobolus heterolepis")
- For animals: include breed names (e.g., "Jack Russel Terrier" not just "dog")
- For plants: include both common and scientific names when identifiable
- Use specific object types instead of generic terms (e.g., "Prairie dropseed" not "grass type")
- If multiple objects: list them specifically (e.g., "Prairie dropseed and Calamagrostis acutiflora" not "different types")

TECHNICAL DESCRIPTORS (include when applicable):
- File format: "PNG", "isolated PNG" (for PNG files with transparency)
- Quality descriptors: "high resolution", "perfectly cutout", "cutout", "isolated"
- Composition: "set of", "collection of", "frontal", "side view", "top view"
- Use natural flow: "isolated PNG on transparent background" or "perfectly cutout high resolution"
- Examples:
  * "Set of frontal Prairie dropseed Sporobolus heterolepis grass isolated PNG"
  * "High resolution perfectly cutout Calamagrostis acutiflora on transparent background"

${isVideo ? `VIDEO-SPECIFIC TITLE GUIDANCE (MANDATORY for videos):
- CRITICAL: Minimum title length is 60 characters. For videos, longer titles (up to ${titleLen} chars) are ACCEPTABLE and ENCOURAGED for better description.
- Structure: [Subject] [specific motion verb] [camera movement] [setting] [tech tags if provided]
- NEVER use generic "moving" - use specific verbs: glowing, rotating, pulsing, flowing, drifting, etc.
- ALWAYS include camera work: "static camera", "panning shot", "tracking shot", etc. (or explicitly state if camera doesn't move)
- Identify video type when clear: timelapse, slow-motion, real-time, animation, etc.
- Include tech tags ONLY if provided in video hints: 4K, 60fps, etc.

NATURAL LANGUAGE FLOW (CRITICAL):
- Write titles as natural, flowing phrases - NOT keyword lists or bullet points
- Use connecting words naturally: "of", "with", "at", "on", "in", "during", "as", "while"
- Examples of GOOD flow:
  * "Aerial drone footage of mountain landscape at sunset with clouds flowing" (uses "of", "at", "with")
  * "Slow-motion panning shot of neon blue hearts pulsing on black background" (uses "of", "on")
  * "Timelapse of city skyline with traffic moving at night" (uses "of", "with", "at")
- Examples of BAD flow (avoid):
  * "Mountain landscape, clouds, sunset, aerial drone" (keyword list, no flow)
  * "Neon hearts moving dark background" (missing connecting words)

SUBJECT DETAIL RULES (include when visible and relevant):
- COLOR: Always include if distinctive (e.g., "neon blue hearts", "red apple", "golden sunset")
- NUMBER: Include when relevant (e.g., "two intertwined hearts", "three people", "multiple clouds")
- SIZE/SCALE: Include when significant (e.g., "large mountain", "tiny droplets", "massive waves")
- MATERIAL/STYLE: Include when distinctive (e.g., "neon", "wooden", "metallic", "glass")
- SPECIFICITY: Use specific names when possible (e.g., "Jack Russel Terrier" not just "dog", "Portland, Oregon" not just "city")

MOTION INTENSITY DESCRIPTORS (use to enhance motion verbs):
- FAST MOTION: "fast-paced", "rapid", "dynamic", "swift", "quick", "speedy"
- SLOW MOTION: "gentle", "smooth", "slow-motion", "leisurely", "gradual", "calm"
- MODERATE: "flowing", "steady", "continuous", "smooth", "rhythmic"
- ERRATIC: "jittery", "unpredictable", "chaotic", "turbulent" (only if actually visible)
- Examples:
  * "Fast-paced timelapse of city traffic at night"
  * "Gentle slow-motion panning shot of ocean waves"
  * "Smooth flowing animation of neon hearts rotating"

PRIORITY ORDER FOR LENGTH CONSTRAINTS:
- ESSENTIAL (always include): Subject + Motion verb + Camera work
- HIGH PRIORITY (include if space allows): Setting/context + Subject details (color, number)
- MEDIUM PRIORITY (include if ample space): Time of day, weather, location specifics
- LOW PRIORITY (include only if very long titles allowed): Composition details, mood descriptors, tech tags
- If approaching character limit, prioritize in this order:
  1. Subject (with color/number if distinctive)
  2. Motion verb (with intensity descriptor if space allows)
  3. Camera work
  4. Setting/context
  5. Time/weather details
  6. Tech tags (only if provided in hints)

SETTING DETAIL GUIDANCE (include when visible and relevant):
- TIME OF DAY: "at sunset", "at sunrise", "at night", "during golden hour", "in morning light", "at dusk", "at dawn"
- WEATHER CONDITIONS: "in rain", "under clear sky", "during storm", "in fog", "with snow", "on sunny day"
- LOCATION SPECIFICS: "on beach", "in forest", "at city intersection", "in urban area", "on mountain peak", "by lake"
- ATMOSPHERE/MOOD: "peaceful", "dramatic", "serene", "energetic", "tranquil" (use sparingly, only if space allows)
- Examples:
  * "Aerial drone footage of mountain landscape at sunset with clouds flowing" (includes time: "at sunset")
  * "Timelapse of city skyline with traffic moving at night" (includes time: "at night")
  * "Slow-motion panning shot of ocean waves on beach during golden hour" (includes location + time)

Examples (showing natural flow and all elements):
  * "Animated neon heart shapes glowing and rotating on dark background" (67 chars - good flow, includes subject details)
  * "Slow-motion panning shot of neon blue hearts pulsing on black background" (68 chars - natural flow, subject color, motion intensity)
  * "Aerial drone footage of mountain landscape at sunset with clouds flowing" (73 chars - natural flow, time detail, motion)
  * "Timelapse of busy city intersection with cars and pedestrians moving at night" (69 chars - location detail, time, natural flow)
- Focus on DYNAMIC elements: motion, movement, camera work, not just static subjects` : ''}
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

4. BUYER-INTENT & USE-CASE KEYWORDS (CRITICAL - DOMINATE positions 2-25):
   - Think about HOW buyers will use this image - what are they searching for?
   - Include USE-CASE keywords: "beach background", "summer background", "travel destination", "vacation concept", "resort decoration", "spa background", "holiday vibe", "nature background", "wallpaper", "desktop background", "print design", "web design", "marketing material", "advertising", "social media", "blog post", "website header", "banner", "poster", "brochure"
   - Include LONG-TAIL KEYWORD PHRASES (high-value search terms): "tropical palm tree silhouette", "beach vacation background", "summer travel concept", "luxury resort decoration", "spa wellness background", "tropical paradise wallpaper", "exotic travel destination", "island vacation concept", "coastal living design", "tropical holiday vibe", "summer beach background", "wellness spa concept", "luxury tropical resort", "exotic island paradise", "tropical nature wallpaper"
   - Include ACTION/VERB keywords (what's happening or conveyed): "relaxing", "escaping", "traveling", "vacationing", "exploring", "discovering", "enjoying", "celebrating", "dreaming", "aspiring", "inspiring", "motivating", "healing", "rejuvenating", "unwinding", "adventuring", "wandering", "soaking", "basking", "embracing"
   - Include STYLE/AESTHETIC keywords: "minimalist", "modern", "contemporary", "boho", "tropical decor", "island style", "coastal chic", "beach house", "resort style", "spa aesthetic", "zen design", "scandinavian", "mid-century", "rustic", "vintage", "art deco", "industrial", "farmhouse", "cottage core", "maximalist", "eclectic", "tropical modern", "island aesthetic"
   - Include EMOTIONAL/ASPIRATIONAL keywords: "dreamy", "inspiring", "aspirational", "serene", "blissful", "peaceful", "tranquil", "calming", "soothing", "uplifting", "energizing", "refreshing", "invigorating", "romantic", "nostalgic", "hopeful", "optimistic", "joyful", "content", "fulfilled", "free", "liberated", "adventurous", "carefree"
   - Include CONTEXTUAL keywords: "tropical paradise", "exotic travel", "beach holiday", "tropical vacation", "sunny summer", "tropical concept", "island life", "coastal living", "ocean view", "seaside", "caribbean", "hawaiian", "bali", "maldives", "santorini", "maui", "barbados", "seychelles", "fiji", "tahiti"
   - Include MOOD/ATMOSPHERE keywords: "relaxation", "wellness", "luxury", "peaceful", "serene", "tranquil", "exotic", "paradise", "calm", "zen", "meditation", "spa day", "retreat", "escape", "bliss", "harmony", "balance", "mindfulness", "tranquility", "serenity", "peace", "stillness"
   - Include SEASONAL keywords when relevant: "summer", "winter", "spring", "autumn", "seasonal", "summer vibes", "summer mood", "summer aesthetic", "summer collection", "summer theme", "winter escape", "spring renewal", "autumn colors"
   - Include LIFESTYLE keywords: "vacation", "holiday", "resort", "spa", "wellness", "luxury", "eco-friendly", "natural design", "minimalist", "modern", "contemporary", "boho", "tropical decor", "island style", "beach lifestyle", "island living", "coastal lifestyle", "resort living", "vacation lifestyle"
   - Include COMMERCIAL USE keywords: "stock photo", "royalty free", "commercial use", "business", "corporate", "branding", "marketing", "advertising", "promotional", "editorial", "print ready", "web ready", "high resolution", "professional"
   - Include INDUSTRY keywords when relevant: "travel industry", "hospitality", "tourism", "real estate", "interior design", "fashion", "beauty", "healthcare", "wellness industry", "spa industry", "resort industry", "hotel industry", "restaurant industry", "retail", "e-commerce"
   - Include TRENDING keywords when relevant: "aesthetic", "vibe", "mood", "core", "aesthetic", "trending", "popular", "viral", "instagram", "pinterest", "tiktok", "social media", "content creation"
   - Examples for palm trees: "beach background", "summer background", "tropical", "vacation", "resort", "spa", "luxury", "relaxation", "wellness", "exotic travel", "tropical paradise", "holiday vibe", "palm tree silhouette", "tropical plants", "palm leaves", "exotic plants", "nature", "tropical foliage", "sunny summer", "tropical concept", "black background", "outdoor nature", "landscape", "travel destination", "vacation concept", "resort decoration", "exotic travel", "palm tree isolated", "nature background", "holiday vibe", "nature photo", "beach holiday", "tropical vacation", "tropical paradise", "palm branches", "sunny day", "relaxation", "wellness", "eco-friendly", "natural design", "isolated palm tree", "tropical nature", "spa background", "luxury", "tropical environment", "summer season"

5. SCIENTIFIC NAMES & TECHNICAL DESCRIPTORS (include when applicable, but MINIMIZE - positions 25-40 only):
   - Include scientific names when detected (e.g., "poaceae", "gramineae", "sporobolus heterolepis", "calamagrostis acutiflora")
   - For plants: include family names (e.g., "poaceae", "gramineae") AND species names when identifiable
   - For animals: include scientific family/genus names when applicable
   - Include technical quality descriptors ONLY if relevant: "high resolution", "perfectly cutout", "isolated png", "cutout", "transparent png", "isolated"
   - Technical terms should NEVER dominate - they are LOW priority compared to buyer-intent keywords

6. For locations: include country with city/state (e.g., "Portland, Oregon, USA" → ["portland", "oregon", "usa"]).

7. Include CONCEPTUAL & MOOD elements: feelings, mood, trends (e.g., "relaxation", "wellness", "luxury", "peaceful", "serene", "tranquil", "exotic", "paradise", "solitude", "childhood", "milestones").

8. Include SETTING & CONTEXT: "indoors", "outdoors", "day", "night", "sunny", "cloudy", "beach", "tropical", "resort", "spa", "vacation", "holiday" (if visible or contextually relevant).

${isVideo ? `9. VIDEO-SPECIFIC KEYWORDS (CRITICAL for video search visibility):
   - Motion keywords: flying, rotating, flowing, moving, drifting, panning, tracking, etc. (describe actual motion seen)
   - Camera movement: aerial, drone, panning, tracking, static, zooming, etc. (describe camera work)
   - Video type: timelapse, slow-motion, real-time, fast-paced, etc. (only if clearly identifiable)
   - Tech keywords: ONLY include if provided in video hints (4k, 60fps, hd, etc.) - NEVER invent tech specs
   - Pacing: fast-paced, slow-motion, smooth, dynamic, etc. (describe video rhythm)
   - These video-specific keywords should appear early in the keyword list (top 15) for better search visibility
10.` : '9.'} CRITICAL: Background keywords - be ACCURATE:
   - If background is TRANSPARENT: use ONLY "transparent background" or "isolated" - DO NOT mention ANY color (not green, not white, not any color)
   - If background is WHITE: use "white background", "isolated on white", or "on white"
   - If background has a specific COLOR (and is not transparent): mention that color (e.g., "blue background", "black background")
   - FORBIDDEN: Never use "green background" unless the background is actually solid green (not transparent)
   - NEVER mention a background color if the background is actually transparent

${isVideo ? '11.' : '10.'} Include viewpoint: "high-angle view", "aerial view", "drone point of view" (if applicable).

${isVideo ? '12.' : '11.'} Include number of people: "one person", "three people", "nobody" (if applicable).

${isVideo ? '13.' : '12.'} Include demographic info only if visible and with model consent: ethnicity, age, gender, etc.

PRIORITY ORDER FOR KEYWORD RANKING (most important first):
1. Title words (top 10)
2. Buyer-intent & use-case keywords (positions 2-25) - DOMINATE with "beach background", "summer background", "travel destination", "vacation concept", "resort", "spa", "luxury", "relaxation", "wellness", "tropical", "exotic", "paradise", "holiday", "vacation", "wellness", "spa background", "nature background", "tropical paradise", "exotic travel", "beach holiday", "tropical vacation", "sunny summer", "tropical concept", etc.
3. Specific subject names (species, breeds, types)
4. Scientific names and technical descriptors (positions 25-40) - MINIMIZE these, buyer-intent keywords are MUCH more important
5. Contextual & mood keywords - "tropical", "exotic", "paradise", "peaceful", "serene", etc.
6. Setting and context - "beach", "tropical", "outdoors", "sunny", etc.
7. General category terms
8. Descriptive attributes (colors, sizes, styles)

🚨 ABSOLUTELY CRITICAL - KEYWORD GENERATION RULES - FOLLOW THESE EXACTLY:

Think like a BUYER searching Adobe Stock - NOT like a cataloger or technical expert. Buyers search for USE-CASES, CONCEPTS, and CONTEXT, not just object names. Buyer-intent keywords MUST DOMINATE positions 2-25 for maximum search visibility and ranking. This is NON-NEGOTIABLE.

⚠️ FORBIDDEN KEYWORD PATTERNS - ABSOLUTELY NEVER GENERATE THESE - THEY ARE WEAK, LOW-RANKING, AND WILL CAUSE POOR SEARCH PERFORMANCE:

❌ STRICTLY FORBIDDEN - Generic single-word object names without context: "tree", "car", "person", "food", "building", "phone", "dog", "flower", "computer", "book", "chair", "cup", "pen", "shirt", "shoe", "bag", "box", "paper", "glass", "table"
❌ STRICTLY FORBIDDEN - Generic single-word descriptors that describe WHAT something is, not HOW it's used: "green", "red", "blue", "white", "black", "large", "small", "big", "tiny", "high", "low", "isolated", "background", "nature", "abstract"
❌ STRICTLY FORBIDDEN - Technical file format terms that buyers never search for: "png", "jpg", "cutout", "transparent", "high resolution", "vector", "illustration", "file", "image", "photo", "graphic"
❌ STRICTLY FORBIDDEN - Scientific/technical terms that only experts use: "botany", "arbor", "flora", "foliage", "ecosystem", "taxonomy", "species", "genus", "anatomy", "physiology", "molecular", "algorithm"
❌ STRICTLY FORBIDDEN - Counting/quantity words that add no search value: "one", "two", "three", "four", "five", "multiple", "several", "set", "group", "collection", "pair"
❌ STRICTLY FORBIDDEN - Generic descriptive adjectives without context: "beautiful", "nice", "good", "perfect", "amazing", "great", "wonderful", "excellent", "fine", "quality"

✅ REQUIRED KEYWORD PATTERNS - YOU MUST GENERATE THESE TYPES - THEY ARE HIGH-RANKING AND BUYER-FOCUSED:

✅ MANDATORY - Use-case keywords that describe HOW buyers will use the image (industry, purpose, application): Examples: "business presentation", "marketing campaign", "website design", "social media post", "advertising banner", "product packaging", "brochure design", "newsletter header", "blog illustration", "app interface", "restaurant menu", "hotel decoration", "spa background", "fitness poster", "medical brochure", "education material", "travel brochure", "real estate listing", "food photography", "lifestyle concept"
✅ MANDATORY - Emotional/aspirational keywords that connect with buyer feelings and goals: Examples: "luxury", "premium", "modern", "elegant", "professional", "friendly", "energetic", "peaceful", "inspiring", "motivational", "success", "achievement", "wellness", "relaxation", "adventure", "freedom", "innovation", "growth", "transformation", "celebration"
✅ MANDATORY - Industry/commercial keywords for business use: Examples: "corporate", "business", "marketing", "advertising", "branding", "retail", "hospitality", "healthcare", "education", "technology", "finance", "real estate", "tourism", "fashion", "food service", "fitness industry", "beauty industry"
✅ MANDATORY - Long-tail phrases (2-4 words) that match specific buyer searches: Combine object + context + use-case. Examples: "modern office workspace", "healthy breakfast bowl", "professional business woman", "luxury hotel lobby", "fresh organic vegetables", "urban city skyline", "tropical beach vacation", "minimalist home interior", "vintage coffee shop", "futuristic technology concept"
✅ MANDATORY - Contextual descriptors that add meaning and specificity: Examples: "outdoor", "indoor", "studio", "natural light", "sunset", "sunrise", "daytime", "nighttime", "urban", "rural", "tropical", "arctic", "desert", "forest", "ocean", "mountain", "modern style", "vintage style", "minimalist", "luxury", "budget-friendly"

KEY PRINCIPLE: Transform generic words into contextual, use-case focused keywords. Instead of "tree" → generate "tropical palm trees", "autumn maple tree", "christmas tree decoration", "bonsai tree art". Instead of "car" → generate "luxury sports car", "electric vehicle concept", "vintage car collection", "car rental service". Instead of "food" → generate "healthy breakfast bowl", "gourmet restaurant dish", "organic farm produce", "fast food packaging".

Order keywords by this importance hierarchy for maximum Adobe Stock search visibility.` : '';
  
  // Title length rules:
  // - HARD max is the user-selected titleLen (capped at 200)
  // - Minimum is at least 60 characters to ensure descriptive, complete titles
  // - Images now get same length treatment as videos (85% of limit) for better SEO
  const titleLengthLimit = Math.min(titleLen, 200);
  const minTitleChars =
    titleLengthLimit <= 80
      ? Math.max(60, Math.floor(titleLengthLimit * 0.6)) // e.g., 70 -> 60 (minimum enforced)
      : Math.max(60, Math.floor(titleLengthLimit * 0.85)); // e.g., 120 -> 102 (allow longer for both images and videos)
  
  const generalTitleGuidance = platform !== 'adobe' ? `
Titles should be concise and natural while still meeting the minimum length.
The title must be complete and not cut off mid-sentence.
` : '';
  
  // Few-shot examples based on platform
  const fewShotExamples = platform === 'adobe' ? `
Examples of GOOD titles (within ${titleLen} chars, complete, specific):
${isVideo ? `VIDEO EXAMPLES:
{"title": "Aerial drone footage of mountain landscape at sunset with clouds flowing", "description": "Stunning aerial video of mountain landscape during sunset with dynamic cloud movement.", "keywords": ["aerial", "drone", "mountain", "landscape", "sunset", "clouds", "flowing", "flying", "panning", "outdoors", "scenic", "nature"]}
{"title": "Timelapse of city skyline with traffic moving at night", "description": "Dynamic timelapse video showing city skyline with moving traffic lights at night.", "keywords": ["timelapse", "city", "skyline", "traffic", "moving", "night", "lights", "urban", "fast-paced", "dynamic", "time-lapse"]}
{"title": "Slow-motion panning shot of ocean waves on beach", "description": "Smooth slow-motion panning video of ocean waves gently rolling onto sandy beach.", "keywords": ["slow-motion", "panning", "ocean", "waves", "beach", "smooth", "gentle", "rolling", "water", "coastal", "relaxing"]}
{"title": "Animated neon heart shapes glowing and rotating on dark background", "description": "Dynamic animated video of two intertwined neon blue heart shapes glowing and rotating against dark background.", "keywords": ["neon", "heart", "shapes", "glowing", "rotating", "animated", "dark", "background", "blue", "light", "motion", "dynamic"]}
` : ''}
PHOTO/IMAGE EXAMPLES:
{"title": "Set of frontal Prairie dropseed Sporobolus heterolepis and Calamagrostis acutiflora Karl Foerster grass isolated png on transparent background perfectly cutout high resolution", "description": "High resolution perfectly cutout set of frontal Prairie dropseed and Karl Foerster grass species isolated on transparent background.", "keywords": ["prairie", "dropseed", "sporobolus", "heterolepis", "calamagrostis", "acutiflora", "karl", "foerster", "grass", "isolated", "png", "transparent", "background", "cutout", "high", "resolution", "frontal", "set", "plants", "botany"]}
{"title": "Red apple Malus domestica isolated on white background high resolution", "description": "Fresh red apple on white background, perfect for food photography and commercial use.", "keywords": ["apple", "malus", "domestica", "red", "fruit", "fresh", "white", "background", "isolated", "food", "healthy", "commercial", "high", "resolution"]}
{"title": "Young woman playing catch with Jack Russel Terrier at beach", "description": "Happy woman playing with her dog on a sunny beach, showing joy and companionship.", "keywords": ["woman", "dog", "jack", "russel", "terrier", "beach", "playing", "catch", "outdoors", "sunny"]}
{"title": "Abstract futuristic microchip circuit board design isolated png perfectly cutout", "description": "Modern technology circuit board pattern with microchips, ideal for tech and innovation themes.", "keywords": ["circuit", "board", "microchip", "technology", "abstract", "futuristic", "design", "isolated", "png", "cutout", "white", "background"]}

Examples of BAD titles (avoid these):
- "Professional high quality stock photo" (too generic, contains banned words)
- "Image of something" (too vague, filename-based)
- "Design element graphic" (too generic, lacks specificity)
${isVideo ? `BAD VIDEO TITLES (avoid these):
- "Neon heart shapes moving in darkness" (too short: 36 chars, needs 60+ chars; generic "moving", missing camera work)
- "Video of mountains" (too vague, missing motion/camera description)
- "Stock video footage" (too generic, contains banned words)
- "4K video" (tech tag without content description)
- "Hearts on dark" (too short, missing motion/camera)
- "Neon hearts moving" (too short, generic motion)` : ''}
` : platform === 'shutterstock' ? `
Examples of GOOD titles:
${isVideo ? `VIDEO EXAMPLES:
{"title": "Aerial drone footage panning over forest canopy in morning light", "description": "Beautiful aerial drone video panning smoothly over lush forest canopy during golden hour.", "keywords": ["aerial", "drone", "forest", "canopy", "panning", "morning", "light", "nature", "flying", "smooth", "outdoors"]}
{"title": "Timelapse of busy city intersection with cars and pedestrians moving", "description": "Dynamic timelapse showing urban intersection with fast-moving traffic and pedestrians.", "keywords": ["timelapse", "city", "intersection", "cars", "pedestrians", "moving", "urban", "fast-paced", "traffic", "time-lapse", "dynamic"]}
` : ''}
PHOTO/IMAGE EXAMPLES:
{"title": "Vibrant sunset over mountain landscape with lake reflection", "description": "Beautiful sunset scene with mountains and lake, perfect for travel and nature themes.", "keywords": ["sunset", "mountain", "landscape", "lake", "reflection", "nature", "scenic", "outdoors", "peaceful", "serene"]}
{"title": "Modern minimalist office workspace with laptop and plants", "description": "Clean contemporary office setup featuring laptop, plants, and natural lighting.", "keywords": ["office", "workspace", "laptop", "plants", "modern", "minimalist", "contemporary", "desk", "work", "indoor"]}
` : `
Examples of GOOD titles:
${isVideo ? `VIDEO EXAMPLES:
{"title": "Aerial tracking shot of river flowing through valley", "description": "Smooth aerial tracking video following river as it flows through scenic valley.", "keywords": ["aerial", "tracking", "river", "flowing", "valley", "smooth", "nature", "water", "scenic", "outdoors"]}
` : ''}
PHOTO/IMAGE EXAMPLES:
{"title": "Hand-drawn floral pattern vector illustration", "description": "Elegant hand-drawn floral design in vector format, suitable for print and digital use.", "keywords": ["floral", "pattern", "vector", "illustration", "hand", "drawn", "design", "decorative", "artistic", "elegant"]}
`;

  return `
Return PURE JSON only: {"title": string, "description": string, "keywords": string[]}.
${imageInstructions}
Title: MUST be COMPLETE and between ${minTitleChars} and ${titleLengthLimit} characters (hard requirement).
HARD LENGTH REQUIREMENTS:
- NEVER exceed ${titleLengthLimit} characters (counting spaces). If your draft is longer, rewrite it shorter BEFORE returning JSON.
- NEVER return a title shorter than ${minTitleChars} characters. If your draft title is shorter, expand it with more specific, concrete detail until it reaches at least ${minTitleChars} characters without adding meaningless filler.
ENDING REQUIREMENTS:
- The title must end cleanly. The last character should be a letter or number (not a comma/colon/dash).
- NEVER end the title with dangling connector words like: by, with, and, or, of, to, for, from, in, on, at, into, as.
Before returning JSON: count title characters; if it violates these rules, fix it and re-check.
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
Keywords:
- NEVER include stopwords as keywords (e.g., "and", "with", "out", "the", "a", "an", "of", "on", "at", "to", "for", "from", "in", "into").
- NEVER add unrelated filler keywords (e.g., seasonal/home/gift words) just to reach a count.
${keywordMode === 'auto'
  ? `- Choose the BEST number of keywords for this asset (typically 20–35). Return a smaller list if that improves precision.`
  : `- Return EXACTLY ${safeKeywordCount} keywords. If you have fewer than ${safeKeywordCount} strong keywords, add more by using: (a) synonyms, (b) higher/lower specificity terms, (c) related concepts that are clearly supported by the image.`}
CRITICAL: NEVER include ANY words, numbers, IDs, hashes, codes, or alphanumeric strings from the filename in keywords. Base keywords ONLY on what is visible in the image or described in the title.
Order keywords by importance (MOST CRITICAL for Adobe Stock search visibility).
${adobeKeywordGuidance}
All keywords: lowercase, unique, no quotes, no duplicates.
CRITICAL DUPLICATE PREVENTION: Before returning JSON, verify all keywords are unique (case-insensitive). If you find duplicates like ["design", "art", "design"], remove duplicates and ensure each keyword appears only once.
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
  
  // Object names detection - pass to prompt if available
  const objectNamesText = a.objectNames && (
    a.objectNames.common_names.length > 0 ||
    a.objectNames.scientific_names.length > 0 ||
    a.objectNames.specific_types.length > 0 ||
    a.objectNames.technical_attributes.length > 0
  ) ? `\n\n🔍 DETECTED OBJECT NAMES (MUST BE INCLUDED IN TITLE):
Common names: ${a.objectNames.common_names.join(', ') || 'none'}
Scientific names: ${a.objectNames.scientific_names.join(', ') || 'none'}
Specific types: ${a.objectNames.specific_types.join(', ') || 'none'}
Technical attributes: ${a.objectNames.technical_attributes.join(', ') || 'none'}

CRITICAL: Incorporate these detected names naturally into the title. Use scientific names when available. Include technical attributes like "high resolution", "perfectly cutout", "isolated PNG" when applicable.
` : '';
  
  // Filename rule - only mention if NO image is provided
  const filenameRule = hasImage
    ? '' // Don't mention filename at all when image is provided
    : 'If no image is provided, you may use the filename as a weak hint but still write a natural, descriptive title. DO NOT include filename words, numbers, IDs, or codes directly in the title or keywords.';
  
  const isVideo = a.assetType === 'video';
  const imageContext = isVideo && hasImage 
    ? 'IMPORTANT: The provided image contains frames extracted from the start, middle, and end of a video, combined into a vertical strip. Analyze all frames carefully as they represent the video content across different moments. Describe what you see:'
    : hasImage 
      ? 'IMPORTANT: Analyze the provided image carefully. Describe what you see:'
      : '';
  
  // If we have an image (photo/vector/video frame), ignore filename hints entirely
  const shouldUseFilenameHints = !hasImage;
  
  return `
${filenameRestriction}${mandatoryOverride}${rules(a.keywordMode, a.keywordCount, a.titleLen, hasImage, a.platform, isVideo)}
Platform: ${a.platform} (${PLATFORM_TIPS[a.platform]}).
Asset: ${a.assetType} (${ASSET_TIPS[a.assetType]}); ext: ${a.extension}.
${filenameRule ? `${filenameRule}\n` : ''}${fileAttributesText}${objectNamesText}${hasImage ? `${imageContext}
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
  ? `CRITICAL VIDEO HINTS - MUST BE INCORPORATED:
${a.videoHints?.style && a.videoHints.style.length > 0
  ? `Style hints: [${a.videoHints.style.join(', ')}] - Incorporate these style descriptors naturally into the title and keywords. Use them to enhance motion/camera descriptions.`
  : ''}
${a.videoHints?.tech && a.videoHints.tech.length > 0
  ? `Tech hints: [${a.videoHints.tech.join(', ')}] - Include these technical specifications in the title (e.g., "4K footage", "60fps video") and as keywords. These are verified technical details provided by the user.`
  : ''}
${(!a.videoHints?.style || a.videoHints.style.length === 0) && (!a.videoHints?.tech || a.videoHints.tech.length === 0)
  ? 'No video hints provided - focus on analyzing motion, camera movement, and video type from the frames.'
  : ''}`
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

  // Respect the selected Mistral model when provided; fall back to small latest.
  const modelName = a.mistralModel || 'mistral-small-latest';

  const body = {
    model: modelName,
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

// Simple cooldown + retry config for Groq
// Track cooldown per API key rather than globally so that
// multiple Groq keys (e.g., from different accounts/orgs)
// can be used in parallel without blocking each other.
const groqLastCallTimes = new Map<string, number>();
// Be conservative with Groq to avoid TPM rate limits for each key, but only
// for the Maverick model. The Scout model is handled via small per-key queues
// on the client side and should NOT be artificially delayed here.
const GROQ_COOLDOWN_MAVERICK_MS = 20000;     // 20 seconds between generations per key (Maverick only)
const GROQ_COOLDOWN_SCOUT_IMAGE_MS = 7000;  // 7 seconds between generations for Scout when processing images (to prevent token limit issues)
const GROQ_MAX_RETRIES = 3;         // 3 additional attempts after the first try
const GROQ_RETRY_DELAY_MAVERICK_MS = 25000;  // 25 seconds between retries for Maverick
const GROQ_RETRY_DELAY_SCOUT_MS = 14000;     // 14 seconds between retries for Scout

export async function generateWithGroq(a: ModelArgs): Promise<ModelOut> {
  // Use bearer token if provided and not empty, otherwise fall back to environment variable
  const key = (a.bearer && a.bearer.trim().length > 0) ? a.bearer.trim() : process.env.GROQ_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error('GROQ_API_KEY missing. Please provide an API key via Authorization header or set GROQ_API_KEY environment variable.');
  }

  const keyId = key.trim();

  // Supported Groq models
  const MAVERICK_MODEL = 'meta-llama/llama-4-maverick-17b-128e-instruct';
  const SCOUT_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

  const requestedGroqModel = a.groqModel;
  const isScoutModel = requestedGroqModel === SCOUT_MODEL;

  const hasImage = !!(a.imageData || a.imageUrl);

  // Respect a per-key cooldown between Groq generations to avoid TPM/token rate limits.
  // Maverick: Always uses cooldown. Scout: Only uses cooldown when processing images (to prevent token limit issues).
  // Scout without images uses client-side queuing and should not be throttled here.
  // Each key has its own separate token limit, so cooldown is tracked per-key.
  if (!isScoutModel) {
    // Maverick model: Always use cooldown
    const lastTime = groqLastCallTimes.get(keyId);
    if (lastTime && lastTime > 0) {
      const elapsed = Date.now() - lastTime;
      if (elapsed < GROQ_COOLDOWN_MAVERICK_MS) {
        const wait = GROQ_COOLDOWN_MAVERICK_MS - elapsed;
        console.log(`⏳ Groq cooldown (Maverick) for key ${keyId.substring(0, 8)}...: waiting ${wait}ms before next generation`);
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  } else if (hasImage) {
    // Scout model: Only use cooldown when processing images (to prevent token limit issues)
    // Each key from different Gmail accounts has its own 300K token limit
    const lastTime = groqLastCallTimes.get(keyId);
    if (lastTime && lastTime > 0) {
      const elapsed = Date.now() - lastTime;
      if (elapsed < GROQ_COOLDOWN_SCOUT_IMAGE_MS) {
        const wait = GROQ_COOLDOWN_SCOUT_IMAGE_MS - elapsed;
        console.log(`⏳ Groq cooldown (Scout with image) for key ${keyId.substring(0, 8)}...: waiting ${wait}ms before next generation to avoid token limits`);
        await new Promise(resolve => setTimeout(resolve, wait));
      }
    }
  }

  // Normalize incoming Groq model to the supported set.
  // Default to Scout; treat Maverick as legacy-only.
  const effectiveModel =
    requestedGroqModel === SCOUT_MODEL || !requestedGroqModel
      ? SCOUT_MODEL
      : requestedGroqModel === MAVERICK_MODEL
      ? MAVERICK_MODEL
      : SCOUT_MODEL;

  // Use the same model for both text-only and vision to keep behavior consistent.
  const modelName = effectiveModel;
  
  const prompt = buildUserPrompt(a);
  
  let messages: any[];

  if (hasImage) {
    // Vision request: send both text prompt and image
    const userContent: any[] = [
      { type: 'text', text: prompt }
    ];

    if (a.imageUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: a.imageUrl }
      });
    } else if (a.imageData) {
      // a.imageData is a data URL (data:image/...;base64,...) - Groq supports image_url with data URLs
      userContent.push({
        type: 'image_url',
        image_url: { url: a.imageData }
      });
    }

    messages = [
      { role: 'system', content: 'Respond with PURE JSON only: {"title": string, "description": string, "keywords": string[]}' },
      { role: 'user', content: userContent }
    ];
  } else {
    // Text-only request (no image)
    messages = [
      { role: 'system', content: 'Respond with PURE JSON only: {"title": string, "description": string, "keywords": string[]}' },
      { role: 'user', content: prompt }
    ];
  }

  const body = {
    model: modelName,
    messages: messages,
    temperature: 0.7,
    response_format: { type: 'json_object' }
  };

  let lastError: any = null;

  // First attempt + up to GROQ_MAX_RETRIES additional attempts
  for (let attempt = 0; attempt <= GROQ_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const retryDelay = isScoutModel ? GROQ_RETRY_DELAY_SCOUT_MS : GROQ_RETRY_DELAY_MAVERICK_MS;
        console.warn(`⚠ Groq retry attempt ${attempt}/${GROQ_MAX_RETRIES} after previous failure. Waiting ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${key}` 
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        const baseMessage = `Groq API error (${res.status}): ${errorText.substring(0, 200)}`;
        console.error(baseMessage);

        const error: any = new Error(baseMessage);
        error.status = res.status;
        error.errorText = errorText; // Store full error text for detection

        // Detect TPD (tokens per day) errors - these are daily quota limits, NOT retryable
        const status = res.status;
        const lowerText = errorText.toLowerCase();
        const isTPDError = status === 429 && (
          lowerText.includes('tokens per day') ||
          lowerText.includes('tpd') ||
          (lowerText.includes('daily') && lowerText.includes('limit'))
        );

        // TPD errors are permanent until daily quota resets - don't retry
        if (isTPDError) {
          error.isTPDError = true;
          error.isQuotaExhausted = true;
          // Don't retry - this key's daily quota is exhausted
          // Update last call time for cooldown tracking (Maverick always, Scout only with images)
          if (!isScoutModel || hasImage) {
            groqLastCallTimes.set(keyId, Date.now());
          }
          const tpdMessage = `Daily token quota exhausted for this API key. The quota resets daily. Please use a different key or wait until the quota resets. Original error: ${baseMessage}`;
          if (a.imageData) {
            return { 
              title: '', 
              description: '', 
              keywords: [], 
              error: tpdMessage
            };
          }
          return { 
            title: '', 
            description: '', 
            keywords: [], 
            error: tpdMessage
          };
        }

        // Decide if this is a retryable error (temporary rate limits, server errors)
        const isRetryable = 
          (status === 429 && !isTPDError) || // Temporary rate limit (not TPD)
          status === 500 ||
          status === 502 ||
          status === 503 ||
          status === 504 ||
          lowerText.includes('temporarily') ||
          lowerText.includes('overloaded') ||
          lowerText.includes('try again');

        if (isRetryable && attempt < GROQ_MAX_RETRIES) {
          lastError = error;
          continue; // go to next retry attempt
        }

        // Non-retryable error or out of retries: return structured error/fallback
        // Update last call time for cooldown tracking (Maverick always, Scout only with images)
        if (!isScoutModel || hasImage) {
          groqLastCallTimes.set(keyId, Date.now());
        }
        if (a.imageData) {
          return { 
            title: '', 
            description: '', 
            keywords: [], 
            error: baseMessage
          };
        }
        return fallback(a);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content ?? '{}';
      
      try {
        const parsed = asModelOut(JSON.parse(text));
        const safeTitle = parsed.title || '';
        if (a.imageData && safeTitle.length < 10) {
          console.warn(`⚠ WARNING: Image was provided but title is very short or empty. Groq may not have analyzed the image.`);
          if (safeTitle.length < 5) {
            // Update last call time for cooldown tracking (Maverick always, Scout only with images)
            if (!isScoutModel || hasImage) {
              groqLastCallTimes.set(keyId, Date.now());
            }
            return { 
              title: '', 
              description: '', 
              keywords: [], 
              error: 'Image analysis failed: Groq returned empty or invalid title despite image being provided.' 
            };
          }
        }
        // Update last call time for cooldown tracking (Maverick always, Scout only with images)
        if (!isScoutModel || hasImage) {
          groqLastCallTimes.set(keyId, Date.now());
        }
        return parsed;
      } catch (parseError: any) {
        console.error('❌ JSON parse error:', parseError?.message);
        // Update last call time for cooldown tracking (Maverick always, Scout only with images)
        if (!isScoutModel || hasImage) {
          groqLastCallTimes.set(keyId, Date.now());
        }
        if (a.imageData) {
          return { 
            title: '', 
            description: '', 
            keywords: [], 
            error: `Failed to parse Groq response: ${parseError?.message}` 
          };
        }
        return fallback(a);
      }
    } catch (error: any) {
      // Network or other unexpected error
      console.error('❌ generateWithGroq error:', error?.message || error);
      lastError = error;

      const status = (error as any)?.status;
      const msg = String(error?.message || '').toLowerCase();
      const isRetryable =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        msg.includes('rate limit') ||
        msg.includes('temporarily') ||
        msg.includes('overloaded') ||
        msg.includes('try again') ||
        msg.includes('timeout');

      if (isRetryable && attempt < GROQ_MAX_RETRIES) {
        continue; // retry after delay at top of loop
      }

      // Non-retryable error or out of retries
      break;
    }
  }

  // If we reach here, all retries have failed
  // Update last call time for cooldown tracking (Maverick always, Scout only with images)
  if (!isScoutModel || hasImage) {
    groqLastCallTimes.set(keyId, Date.now());
  }
  const finalMessage = `Groq API request failed after ${GROQ_MAX_RETRIES + 1} attempt(s): ${lastError?.message || 'Unknown error'}`;
  console.error(finalMessage);

  if (a.imageData) {
    return { 
      title: '', 
      description: '', 
      keywords: [], 
      error: finalMessage
    };
  }
  return fallback(a);
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

// ========== IMAGE-TO-PROMPT FUNCTIONALITY ==========

export type VisionCaptionArgs = {
  imageData?: string;
  imageUrl?: string;
  assetType: 'image' | 'video';
  bearer?: string;
  geminiModel?: GeminiModel;
};

export type VisionCaptionOutput = {
  summary: string;
  subject: string;
  environment: string;
  composition: string;
  camera: string;
  lighting: string;
  colors: string;
  materials_textures: string;
  style: string;
  details: string[];
  object_names?: {
    common_names: string[];      // e.g., ["Prairie dropseed", "Karl Foerster grass"]
    scientific_names: string[];    // e.g., ["Sporobolus heterolepis", "Calamagrostis acutiflora"]
    specific_types: string[];      // e.g., ["Jack Russel Terrier", "Golden Retriever"]
    technical_attributes: string[]; // e.g., ["high resolution", "perfectly cutout", "isolated PNG"]
  };
  for_video_only?: {
    motion: string;
    camera_motion: string;
    pace: string;
  };
  error?: string;
};

export type PromptWriterArgs = {
  caption: VisionCaptionOutput;
  platform: 'general' | 'adobe' | 'shutterstock';
  assetType: 'image' | 'video';
  minWords: number;
  stylePolicy: string;
  negativePolicy: string;
  provider: 'gemini' | 'mistral' | 'groq';
  bearer?: string;
  geminiModel?: GeminiModel;
  mistralModel?: MistralModel;
  groqModel?: GroqModel;
};

export type PromptWriterOutput = {
  prompt: string;
  negative_prompt: string;
  title: string;
  keywords: string[];
  error?: string;
};

export async function generateVisionCaption(args: VisionCaptionArgs): Promise<VisionCaptionOutput> {
  const { imageData, imageUrl, assetType, bearer, geminiModel = 'gemini-2.5-flash' } = args;

  if (!imageData && !imageUrl) {
    return {
      summary: '',
      subject: '',
      environment: '',
      composition: '',
      camera: '',
      lighting: '',
      colors: '',
      materials_textures: '',
      style: '',
      details: [],
      error: 'No image data or URL provided'
    };
  }

  const systemPrompt = `You are an expert visual analyst specializing in detailed image description for AI prompt generation. Your task is to analyze images with maximum precision and fidelity, breaking down every visual element that would be needed to recreate the image accurately.

CRITICAL INSTRUCTIONS:
- Analyze the image systematically: start with the main subject, then environment, composition, technical aspects, and stylistic elements
- Be extremely specific and detailed - vague descriptions lead to poor prompt generation
- Use technical photography and art terminology when appropriate (e.g., "shallow depth of field", "golden hour lighting", "rule of thirds composition")
- Describe colors precisely (e.g., "warm beige" not just "beige", "deep navy blue" not just "blue")
- Note textures, materials, and surface qualities explicitly
- Identify camera angles, focal lengths, and perspective accurately
- Describe lighting conditions in detail: source, direction, quality, color temperature
- For videos: analyze motion, camera movement, and pacing carefully
- NEVER guess brand names, logos, or copyrighted content
- Return ONLY valid JSON - no markdown, no commentary, no explanations`;

  const userPrompt = `Analyze the provided ${assetType} with extreme detail and return a comprehensive structured description.

ANALYSIS GUIDELINES:
1. SUBJECT: Describe the main subject(s) in detail - what they are, their appearance, pose, expression, clothing, accessories, any distinguishing features
2. ENVIRONMENT: Describe the location/background precisely - indoor/outdoor, specific setting, spatial relationships, background elements, depth
3. COMPOSITION: Analyze framing (close-up, medium, wide), camera angle (eye-level, high-angle, low-angle, bird's-eye, worm's-eye), focal point, foreground/midground/background layers, use of rule of thirds or other compositional techniques
4. CAMERA: Estimate lens type (wide-angle 14-35mm, standard 35-85mm, telephoto 85mm+), depth of field (shallow/bokeh, deep/sharp throughout), perspective (normal, distorted, compressed), shot type (extreme close-up, close-up, medium shot, wide shot, establishing shot)
5. LIGHTING: Describe light source (natural sunlight, studio lights, window light, artificial), direction (front, side, back, rim, top, bottom), quality (soft/diffused, hard/direct, mixed), time of day if applicable, color temperature (warm, cool, neutral), shadows and highlights
6. COLORS: Identify dominant color palette, color harmony (monochromatic, complementary, analogous, triadic), saturation levels, color temperature, specific color names
7. MATERIALS_TEXTURES: Describe visible textures (smooth, rough, glossy, matte, metallic, fabric, wood grain, etc.), materials present, surface qualities
8. STYLE: Identify if it's photography, 3D render, illustration, digital art, realism level (hyper-realistic, realistic, stylized, abstract), artistic style if applicable
9. DETAILS: List important small details that contribute to the overall image - reflections, patterns, small objects, environmental details, atmospheric effects
10. OBJECT IDENTIFICATION (CRITICAL for SEO - this directly impacts Adobe Stock ranking):
   - Identify SPECIFIC object names: plant species (common + scientific names), animal breeds, specific product types
   - For plants: ALWAYS detect both common names (e.g., "Prairie dropseed") AND scientific names (e.g., "Sporobolus heterolepis")
   - For grasses specifically: ALWAYS include family names "Poaceae" and "Gramineae" (both are valid scientific names for the grass family)
   - For animals: detect breed names (e.g., "Jack Russel Terrier", "Golden Retriever") AND scientific names when possible
   - For objects: identify specific types, models, or categories when clearly visible
   - Include technical attributes: "high resolution", "perfectly cutout", "isolated PNG", "cutout", "transparent PNG"
   - Be specific: "four types of grass" → identify each type if possible, and include scientific family names
   - CRITICAL: Scientific names (especially family names like "Poaceae", "Gramineae") are ESSENTIAL for SEO ranking - include them in your analysis
${assetType === 'video' ? `11. MOTION: Describe subject movement, speed, direction, type of motion
12. CAMERA_MOTION: Identify camera movement (static, pan, tilt, dolly, tracking, handheld, crane, drone)
13. PACE: Describe pacing (slow/contemplative, medium/normal, fast/dynamic)` : ''}

Return JSON with this exact structure:
{
  "summary": "1-2 comprehensive sentences summarizing the entire scene",
  "subject": "Detailed description of main subject(s) - be specific about appearance, pose, expression, clothing, accessories",
  "environment": "Precise location/background description - indoor/outdoor, specific setting, spatial context, background elements",
  "composition": "Detailed composition analysis - framing, camera angle, focal point, foreground/background layers, compositional techniques",
  "camera": "Technical camera details - estimated lens type and focal length, depth of field, perspective, shot type",
  "lighting": "Comprehensive lighting description - source, direction, quality, color temperature, shadows, highlights, time of day",
  "colors": "Detailed color analysis - dominant palette, color harmony, saturation, specific color names",
  "materials_textures": "Specific textures and materials visible - be precise about surface qualities",
  "style": "Artistic style identification - photo/3d/illustration, realism level, artistic style if applicable",
  "details": ["List of important small details", "that contribute to the image", "be specific and comprehensive"],
  "object_names": {
    "common_names": ["List of common names", "e.g., Prairie dropseed, Karl Foerster grass"],
    "scientific_names": ["List of scientific names", "e.g., Sporobolus heterolepis, Calamagrostis acutiflora"],
    "specific_types": ["List of specific types", "e.g., Jack Russel Terrier, Golden Retriever"],
    "technical_attributes": ["List of technical attributes", "e.g., high resolution, perfectly cutout, isolated PNG"]
  },
  ${assetType === 'video' ? `"for_video_only": {
    "motion": "Detailed description of subject movement - type, speed, direction",
    "camera_motion": "Specific camera movement type - pan/tilt/dolly/tracking/handheld/static/crane/drone",
    "pace": "Pacing description - slow/medium/fast with context"
  }` : ''}
}

Be extremely detailed and specific in every field.`;

  try {
    const key = bearer || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('No Gemini API key available');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;

    const parts: any[] = [{ text: systemPrompt + '\n\n' + userPrompt }];

    if (imageData) {
      const m = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
      if (m) {
        parts.push({
          inline_data: {
            mime_type: `image/${m[1]}`,
            data: m[2]
          }
        });
      }
    } else if (imageUrl) {
      parts.push({ fileData: { fileUri: imageUrl } });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
      })
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Gemini Vision API error (${response.status}): ${t.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let jsonText = String(text).trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) jsonText = jsonMatch[1];

    const parsed = JSON.parse(jsonText);

    return {
      summary: parsed.summary || '',
      subject: parsed.subject || '',
      environment: parsed.environment || '',
      composition: parsed.composition || '',
      camera: parsed.camera || '',
      lighting: parsed.lighting || '',
      colors: parsed.colors || '',
      materials_textures: parsed.materials_textures || '',
      style: parsed.style || '',
      details: Array.isArray(parsed.details) ? parsed.details : [],
      object_names: parsed.object_names ? {
        common_names: Array.isArray(parsed.object_names.common_names) ? parsed.object_names.common_names : [],
        scientific_names: Array.isArray(parsed.object_names.scientific_names) ? parsed.object_names.scientific_names : [],
        specific_types: Array.isArray(parsed.object_names.specific_types) ? parsed.object_names.specific_types : [],
        technical_attributes: Array.isArray(parsed.object_names.technical_attributes) ? parsed.object_names.technical_attributes : []
      } : undefined,
      for_video_only: assetType === 'video' ? parsed.for_video_only : undefined
    };
  } catch (error: any) {
    return {
      summary: '',
      subject: '',
      environment: '',
      composition: '',
      camera: '',
      lighting: '',
      colors: '',
      materials_textures: '',
      style: '',
      details: [],
      object_names: undefined,
      error: error?.message || 'Vision caption generation failed'
    };
  }
}

export async function generateImagePrompt(args: PromptWriterArgs): Promise<PromptWriterOutput> {
  const {
    caption,
    platform,
    assetType,
    minWords,
    stylePolicy,
    negativePolicy,
    provider,
    bearer,
    geminiModel = 'gemini-2.5-flash',
    mistralModel = 'mistral-large-latest',
    groqModel = 'meta-llama/llama-4-scout-17b-16e-instruct'
  } = args;

  if (caption.error) {
    return { prompt: '', negative_prompt: '', title: '', keywords: [], error: `Caption failed: ${caption.error}` };
  }

  const systemPrompt = `You are an expert prompt engineer specializing in reverse-engineering visual content into highly detailed, accurate AI image generation prompts. Your goal is to create prompts that will recreate the exact same scene, composition, lighting, and style as the analyzed image.

CORE PRINCIPLES:
1. ACCURACY FIRST: The prompt must accurately reflect every detail from the visual analysis
2. TECHNICAL PRECISION: Use proper photography, art, and technical terminology
3. STRUCTURED APPROACH: Organize the prompt logically: subject → environment → composition → technical → style
4. SPECIFICITY: Be extremely specific - vague terms produce poor results
5. COMMERCIAL SAFETY: Ensure all content is stock-photo safe (no brands, logos, copyrighted content)

PROMPT STRUCTURE (follow this order):
1. MAIN SUBJECT: Start with the primary subject(s) - be specific about appearance, pose, expression, clothing, accessories
2. ENVIRONMENT & BACKGROUND: Describe the setting, location, background elements, spatial relationships
3. COMPOSITION & FRAMING: Specify camera angle, shot type, framing, focal point, foreground/background relationships
4. TECHNICAL CAMERA DETAILS: Lens type, focal length, depth of field, perspective, aperture if relevant
5. LIGHTING: Comprehensive lighting description - source, direction, quality, color temperature, shadows, highlights
6. COLORS & PALETTE: Dominant colors, color harmony, saturation, specific color names
7. MATERIALS & TEXTURES: Visible textures, materials, surface qualities
8. STYLE & MOOD: Artistic style, realism level, mood, atmosphere, aesthetic qualities
9. DETAILS & REFINEMENTS: Important small details, atmospheric effects, finishing touches
${assetType === 'video' ? `10. MOTION & MOVEMENT: Subject motion, camera movement, pacing` : ''}

PROMPT WRITING BEST PRACTICES:
- Use commas to separate related concepts, periods to separate distinct ideas
- Place the most important elements first (subject, then environment, then technical details)
- Use descriptive adjectives and specific nouns (e.g., "vibrant emerald green" not "green")
- Include technical terms when relevant (e.g., "85mm portrait lens", "f/2.8 aperture", "golden hour")
- Balance detail with readability - aim for natural flow
- Use parentheses for optional clarifications or emphasis
- Avoid redundancy but don't sacrifice important details

EXAMPLE OF EXCELLENT PROMPT STRUCTURE:
"A professional portrait of a young woman with shoulder-length auburn hair, wearing a navy blue blazer, smiling warmly, sitting at a modern glass desk in a bright contemporary office with floor-to-ceiling windows, shot from eye-level at medium distance, using an 85mm portrait lens with shallow depth of field creating soft bokeh background, natural window light from camera-left creating soft directional lighting with gentle shadows, warm color palette dominated by navy blue and cream tones, professional corporate aesthetic, high-quality commercial photography style, sharp focus on subject with background slightly blurred"

HARD RULES:
- Output ONLY valid JSON (no markdown, no commentary, no explanations)
- The "prompt" must be at least ${minWords} words - be comprehensive and detailed
- Do NOT include any brand names, logos, trademarks, artist names, or copyrighted character names
- Do NOT include visible text instructions inside the scene (no "add text", no "logo", no "watermark")
- Do NOT use placeholder text or vague descriptions - be specific and concrete
- The prompt must be a single, flowing text string (not a list or bullet points)
- Also return a "negative_prompt" focused on stock-safety and quality control

NEGATIVE PROMPT GUIDELINES:
The negative prompt should exclude: text, watermark, logo, signature, brand names, artifacts, blur, noise, grain, compression artifacts, extra limbs, deformed anatomy, bad proportions, oversaturation, undersaturation, low quality, jpeg artifacts, pixelation, distortion, chromatic aberration, lens flare (unless present in original), double exposure (unless intentional), and any other quality issues.

JSON SCHEMA:
{
  "prompt": "string (comprehensive, detailed, at least ${minWords} words)",
  "negative_prompt": "string (stock-safety and quality exclusions)",
  "title": "string (SEO-friendly, <= 70 characters)",
  "keywords": ["string", ...] (30-45 single-word keywords, lowercase, no duplicates)
}`;

  const captionJson = JSON.stringify(caption, null, 2);

  const userPrompt = `Generate a highly detailed, accurate recreation prompt based on the visual analysis provided below.

TASK: Transform the structured visual description into a comprehensive, flowing prompt that will recreate the exact same image when used with an AI image generator.

PLATFORM CONTEXT: ${platform}
ASSET TYPE: ${assetType}
MINIMUM WORDS: ${minWords} (be comprehensive - this is a minimum, not a target)
STYLE POLICY: ${stylePolicy}
NEGATIVE POLICY: ${negativePolicy}

VISUAL ANALYSIS DATA:
${captionJson}

INSTRUCTIONS FOR PROMPT GENERATION:

1. SUBJECT TRANSFORMATION:
   - Convert the "subject" field into a detailed, specific description
   - Include all details: appearance, pose, expression, clothing, accessories
   - Be specific about age, gender, ethnicity (if clearly visible), body type, hair, etc.
   - For objects: describe size, shape, material, condition, position

2. ENVIRONMENT INTEGRATION:
   - Transform "environment" into a vivid scene description
   - Include spatial relationships, depth, background elements
   - Specify indoor/outdoor, time of day, weather if relevant
   - Describe the setting with specific details

3. COMPOSITION TRANSLATION:
   - Convert "composition" analysis into camera and framing instructions
   - Specify exact camera angle, shot type, framing
   - Describe how foreground/background elements relate
   - Include compositional techniques if relevant (rule of thirds, leading lines, etc.)

4. TECHNICAL CAMERA DETAILS:
   - Use the "camera" field to specify lens type, focal length, depth of field
   - Include perspective and shot type information
   - Add aperture settings if depth of field is mentioned (e.g., "f/2.8" for shallow DOF)

5. LIGHTING DESCRIPTION:
   - Transform "lighting" analysis into comprehensive lighting description
   - Specify light source, direction, quality, color temperature
   - Include shadow and highlight information
   - Mention time of day if applicable

6. COLOR PALETTE INTEGRATION:
   - Use "colors" field to describe the color scheme
   - Specify dominant colors with precise names
   - Mention color harmony and saturation levels
   - Include color temperature (warm/cool)

7. MATERIALS & TEXTURES:
   - Convert "materials_textures" into specific texture descriptions
   - Use precise terminology (glossy, matte, rough, smooth, etc.)
   - Include material types if identifiable

8. STYLE & MOOD:
   - Transform "style" into artistic style description
   - Specify realism level, photo style, or art style
   - Include mood and atmosphere
   - Add aesthetic qualities

9. DETAILS INTEGRATION:
   - Incorporate all items from "details" array
   - Add any important small elements that enhance accuracy
   - Include atmospheric effects, reflections, patterns

${assetType === 'video' ? `10. MOTION & MOVEMENT:
   - Use "for_video_only" data to describe motion
   - Specify subject movement type, speed, direction
   - Include camera movement details
   - Describe pacing and rhythm` : ''}

PROMPT QUALITY CHECKLIST:
✓ Is the prompt at least ${minWords} words? (be comprehensive)
✓ Does it start with the main subject?
✓ Are all visual elements from the analysis included?
✓ Is technical terminology used correctly?
✓ Are colors described with specific names?
✓ Is lighting comprehensively described?
✓ Are camera/technical details included?
✓ Is the style and mood clearly stated?
✓ Does it flow naturally as a single text string?
✓ Is it free of brand names, logos, copyrighted content?
✓ Is it stock-photo safe?

OUTPUT FORMAT:
Return ONLY a valid JSON object with this structure:
{
  "prompt": "Your comprehensive, detailed prompt here (at least ${minWords} words, flowing text)",
  "negative_prompt": "Stock-safety and quality exclusions based on ${negativePolicy}",
  "title": "SEO-friendly title (<= 70 characters)",
  "keywords": ["keyword1", "keyword2", ...] (30-45 keywords, lowercase, no duplicates)
}

Generate the prompt now, ensuring maximum accuracy and detail.`;

  try {
    let responseText = '';

    if (provider === 'gemini') {
      const key = bearer || process.env.GEMINI_API_KEY;
      if (!key) throw new Error('No Gemini API key available');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      });

      if (!response.ok) {
        const t = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${t.substring(0, 200)}`);
      }

      const data = await response.json();
      responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'groq') {
      const key = bearer || process.env.GROQ_API_KEY;
      if (!key) throw new Error('No Groq API key available');

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 2048,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const t = await response.text();
        throw new Error(`Groq API error (${response.status}): ${t.substring(0, 200)}`);
      }

      const data = await response.json();
      responseText = data?.choices?.[0]?.message?.content || '';
    } else {
      const key = bearer || process.env.MISTRAL_API_KEY;
      if (!key) throw new Error('No Mistral API key available');

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: mistralModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      if (!response.ok) {
        const t = await response.text();
        throw new Error(`Mistral API error (${response.status}): ${t.substring(0, 200)}`);
      }

      const data = await response.json();
      responseText = data?.choices?.[0]?.message?.content || '';
    }

    let jsonText = String(responseText).trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) jsonText = jsonMatch[1];

    const parsed = JSON.parse(jsonText);
    const prompt = String(parsed.prompt || '').trim();
    
    // Count words for validation
    const wordCount = prompt.split(/\s+/).filter(word => word.length > 0).length;

    return {
      prompt,
      negative_prompt: String(parsed.negative_prompt || negativePolicy).trim(),
      title: String(parsed.title || '').trim().slice(0, 70),
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 45) : [],
      error: wordCount < minWords ? `Warning: Prompt is shorter than minimum (${wordCount}/${minWords} words)` : undefined
    };
  } catch (error: any) {
    return {
      prompt: '',
      negative_prompt: '',
      title: '',
      keywords: [],
      error: error?.message || 'Prompt generation failed'
    };
  }
}
