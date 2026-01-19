# Image-to-Prompt Prompt Improvements

This document contains the improved prompts for better accuracy in image-to-prompt generation.

## 1. Vision Caption Prompt (src/lib/models.ts, lines ~1155-1157)

### Current System Prompt:
```typescript
const systemPrompt = `You are a visual analyst. Describe the image with maximum fidelity for prompt recreation.\nReturn ONLY JSON. Do not guess brand names or identities.`;
```

### Improved System Prompt:
```typescript
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
```

### Current User Prompt:
```typescript
const userPrompt = `Analyze the provided asset and return a structured description for recreation.\n\nReturn JSON:\n{\n  \"summary\": \"1-2 sentences\",\n  \"subject\": \"main subject(s)\",\n  \"environment\": \"location/background\",\n  \"composition\": \"framing, angle, focal point, foreground/background\",\n  \"camera\": \"lens guess (wide/standard/tele), depth of field, perspective\",\n  \"lighting\": \"type, direction, softness, time of day\",\n  \"colors\": \"dominant palette\",\n  \"materials_textures\": \"key textures/materials\",\n  \"style\": \"photo/3d/illustration, realism level\",\n  \"details\": [\"important small details\"],\n  \"for_video_only\": {\n    \"motion\": \"subject motion\",\n    \"camera_motion\": \"pan/tilt/dolly/handheld/static\",\n    \"pace\": \"slow/medium/fast\"\n  }\n}`;
```

### Improved User Prompt:
```typescript
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
${assetType === 'video' ? `10. MOTION: Describe subject movement, speed, direction, type of motion
11. CAMERA_MOTION: Identify camera movement (static, pan, tilt, dolly, tracking, handheld, crane, drone)
12. PACE: Describe pacing (slow/contemplative, medium/normal, fast/dynamic)` : ''}

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
  ${assetType === 'video' ? `"for_video_only": {
    "motion": "Detailed description of subject movement - type, speed, direction",
    "camera_motion": "Specific camera movement type - pan/tilt/dolly/tracking/handheld/static/crane/drone",
    "pace": "Pacing description - slow/medium/fast with context"
  }` : ''}
}

Be extremely detailed and specific in every field.`;
```

## 2. Prompt Generation System Prompt (src/lib/models.ts, line ~1253)

### Current System Prompt:
```typescript
const systemPrompt = `You are a prompt reverse-engineering assistant for stock images and videos.\nYour job: given a structured visual description, produce ONE highly detailed generation prompt that recreates the same scene as closely as possible.\n\nHard rules:\n- Output ONLY valid JSON (no markdown, no commentary).\n- The \"prompt\" must be at least ${minWords} words.\n- Do NOT include any brand names, logos, trademarks, artist names, or copyrighted character names.\n- Do NOT include visible text instructions inside the scene (no \"add text\", no \"logo\").\n- The prompt must be specific: subject, environment, composition, camera/lens, lighting, colors, mood, materials, depth of field, and render/photo style.\n- Also return a \"negative_prompt\" focused on stock-safety: no text, watermark, logo, artifacts, blur, noise, extra limbs, deformed anatomy, oversaturation, compression.\n- If input is video, include motion, camera movement, pacing, and duration cues in the prompt.\n\nJSON schema:\n{\n  \"prompt\": \"string\",\n  \"negative_prompt\": \"string\",\n  \"title\": \"string\",\n  \"keywords\": [\"string\", ...]\n}\nKeywords: 30 to 45 single-word keywords, lowercase, no duplicates.\nTitle: SEO-friendly, <= 70 characters.`;
```

### Improved System Prompt:
```typescript
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
```

## 3. Prompt Generation User Prompt (src/lib/models.ts, line ~1257)

### Current User Prompt:
```typescript
const userPrompt = `Generate a recreation prompt.\n\nPLATFORM: ${platform}\nASSET_TYPE: ${assetType}\nMIN_WORDS: ${minWords}\n\nVISUAL_DESCRIPTION (from vision/caption step):\n${captionJson}\n\nADDITIONAL_CONSTRAINTS:\n- Stock/microstock safe\n- No logos, no trademarks, no watermark, no visible text\n- Prefer commercially useful, realistic, high-detail output\n- If isolated object: clean background and sharp edges\n- If lifestyle scene: natural proportions, realistic skin textures, believable lighting\n- Style policy: ${stylePolicy}\n- Negative policy: ${negativePolicy}\n\nReturn ONLY the JSON object.`;
```

### Improved User Prompt:
```typescript
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
```

## 4. Groq One-Step Prompt (src/app/api/prompt/image-to-prompt/route.ts, lines ~53-82)

### Current System Prompt:
```typescript
const systemPrompt = `You are a prompt reverse-engineering assistant for stock images and videos.
Your job: analyze the provided image/video and produce ONE highly detailed generation prompt that recreates the same scene.

Hard rules:
- Output ONLY valid JSON (no markdown, no commentary).
- The "prompt" must be at least ${minWords} words.
- Do NOT include any brand names, logos, trademarks, artist names, or copyrighted character names.
- Do NOT include visible text instructions inside the scene.
- The prompt must be specific: subject, environment, composition, camera/lens, lighting, colors, mood, materials, depth of field, and render/photo style.
- Also return a "negative_prompt" focused on stock-safety: no text, watermark, logo, artifacts, blur, noise, extra limbs, deformed anatomy, oversaturation, compression.
- If input is video, include motion, camera movement, pacing, and duration cues in the prompt.

JSON schema:
{
  "prompt": "string",
  "negative_prompt": "string",
  "title": "string",
  "keywords": ["string", ...]
}
Keywords: 30 to 45 single-word keywords, lowercase, no duplicates.
Title: SEO-friendly, <= 70 characters.`;
```

### Improved System Prompt:
```typescript
const systemPrompt = `You are an expert prompt engineer specializing in reverse-engineering visual content into highly detailed, accurate AI image generation prompts. Your goal is to analyze the provided image/video and create a prompt that will recreate the exact same scene, composition, lighting, and style.

CORE PRINCIPLES:
1. ACCURACY FIRST: Analyze every detail in the image and reflect it accurately in the prompt
2. TECHNICAL PRECISION: Use proper photography, art, and technical terminology
3. STRUCTURED APPROACH: Organize logically: subject → environment → composition → technical → style
4. SPECIFICITY: Be extremely specific - vague terms produce poor results
5. COMMERCIAL SAFETY: Ensure all content is stock-photo safe

PROMPT STRUCTURE (follow this order):
1. MAIN SUBJECT: Primary subject(s) with detailed appearance, pose, expression, clothing, accessories
2. ENVIRONMENT & BACKGROUND: Setting, location, background elements, spatial relationships
3. COMPOSITION & FRAMING: Camera angle, shot type, framing, focal point, foreground/background
4. TECHNICAL CAMERA: Lens type, focal length, depth of field, perspective, aperture
5. LIGHTING: Source, direction, quality, color temperature, shadows, highlights
6. COLORS & PALETTE: Dominant colors, harmony, saturation, specific color names
7. MATERIALS & TEXTURES: Visible textures, materials, surface qualities
8. STYLE & MOOD: Artistic style, realism level, mood, atmosphere
9. DETAILS: Important small details, atmospheric effects
${assetType === 'video' ? `10. MOTION: Subject motion, camera movement, pacing` : ''}

HARD RULES:
- Output ONLY valid JSON (no markdown, no commentary)
- The "prompt" must be at least ${minWords} words - be comprehensive
- Do NOT include brand names, logos, trademarks, artist names, or copyrighted content
- Do NOT include visible text instructions (no "add text", no "logo")
- The prompt must be a single, flowing text string
- Use commas to separate concepts, periods for distinct ideas
- Place most important elements first

NEGATIVE PROMPT: Exclude text, watermark, logo, artifacts, blur, noise, extra limbs, deformed anatomy, oversaturation, compression, low quality, jpeg artifacts, pixelation.

JSON SCHEMA:
{
  "prompt": "string (comprehensive, detailed, at least ${minWords} words)",
  "negative_prompt": "string (stock-safety and quality exclusions)",
  "title": "string (SEO-friendly, <= 70 characters)",
  "keywords": ["string", ...] (30-45 keywords, lowercase, no duplicates)
}`;
```

### Current User Prompt:
```typescript
const userPrompt = `Analyze this ${assetType} and generate a detailed recreation prompt.

PLATFORM: ${platform}
MIN_WORDS: ${minWords}
STYLE_POLICY: ${stylePolicy}
NEGATIVE_POLICY: ${negativePolicy}

Return ONLY the JSON object.`;
```

### Improved User Prompt:
```typescript
const userPrompt = `Analyze this ${assetType} systematically and generate a highly detailed recreation prompt.

ANALYSIS APPROACH:
1. Examine the main subject(s) - appearance, pose, expression, clothing, accessories
2. Analyze the environment - location, background, spatial relationships
3. Study composition - camera angle, framing, focal point, foreground/background
4. Identify technical details - lens type, depth of field, perspective, shot type
5. Analyze lighting - source, direction, quality, color temperature, shadows
6. Identify colors - dominant palette, harmony, saturation, specific names
7. Note materials/textures - visible textures, materials, surface qualities
8. Determine style - photo/3d/illustration, realism level, artistic style
9. List important details - small elements, atmospheric effects
${assetType === 'video' ? `10. Analyze motion - subject movement, camera movement, pacing` : ''}

REQUIREMENTS:
- PLATFORM: ${platform}
- MIN_WORDS: ${minWords} (comprehensive detail required)
- STYLE_POLICY: ${stylePolicy}
- NEGATIVE_POLICY: ${negativePolicy}
- Output must be stock-photo safe (no brands, logos, copyrighted content)
- Prompt must be a single, flowing text string (not a list)

Generate a prompt that accurately recreates this ${assetType} with maximum detail and precision.

Return ONLY the JSON object.`;
```

## Implementation Notes

1. All prompts use template literals with actual newlines (not \n escape sequences in the improved versions for readability)
2. The `${assetType}` variable is used conditionally for video-specific instructions
3. All prompts maintain the same JSON output structure
4. The improvements focus on:
   - More detailed instructions
   - Better structure and organization
   - Technical terminology guidance
   - Specific examples
   - Quality checklists
   - Better utilization of vision caption data

## Files to Update

1. `src/lib/models.ts` - Lines ~1155-1157 (vision caption prompts)
2. `src/lib/models.ts` - Lines ~1253-1257 (prompt generation prompts)
3. `src/app/api/prompt/image-to-prompt/route.ts` - Lines ~53-82 (Groq one-step prompts)
