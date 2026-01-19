// src/app/api/prompt/image-to-prompt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateVisionCaption, generateImagePrompt } from '@/lib/models';
import type { VisionCaptionArgs, PromptWriterArgs } from '@/lib/models';
import type { GeminiModel, MistralModel, GroqModel } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/prompt/image-to-prompt
 *
 * Generates an image/video recreation prompt (min chars enforced).
 * 
 * For Groq: Uses Groq directly (one-step: vision + prompt generation)
 * For Gemini/Mistral: Uses 2-step pipeline (Gemini Vision captioning + selected LLM prompt writer)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageData,
      imageUrl,
      visionBearer, // Separate Gemini key for vision captioning (only needed for Gemini/Mistral)
      platform = 'general',
      assetType = 'image',
      minWords = 160,
      stylePolicy = 'microstock-safe',
      negativePolicy = 'no text, no logo, no watermark',
      provider = 'gemini',
      geminiModel = 'gemini-2.5-flash',
      mistralModel = 'mistral-large-latest',
      groqModel = 'meta-llama/llama-4-scout-17b-16e-instruct'
    } = body;

    if (!imageData && !imageUrl) {
      return NextResponse.json({ error: 'No image data or URL provided' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    // If Groq is selected, use Groq directly (one-step: vision + prompt generation)
    if (provider === 'groq') {
      const key = bearer || process.env.GROQ_API_KEY;
      if (!key) {
        return NextResponse.json(
          { prompt: '', negative_prompt: '', error: 'No Groq API key available' },
          { status: 400 }
        );
      }

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

      const userContent: any[] = [{ type: 'text', text: userPrompt }];
      
      if (imageUrl) {
        userContent.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        });
      } else if (imageData) {
        userContent.push({
          type: 'image_url',
          image_url: { url: imageData }
        });
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature: 0.7,
          max_tokens: 2048,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        const t = await response.text();
        return NextResponse.json(
          { prompt: '', negative_prompt: '', error: `Groq API error (${response.status}): ${t.substring(0, 200)}` },
          { status: 500 }
        );
      }

      const data = await response.json();
      const responseText = data?.choices?.[0]?.message?.content || '';
      
      let jsonText = String(responseText).trim();
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) jsonText = jsonMatch[1];

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError: any) {
        // Try more aggressive JSON extraction (extract between first { and last })
        const jsonStart = jsonText.indexOf('{');
        const jsonEnd = jsonText.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          try {
            parsed = JSON.parse(jsonText.substring(jsonStart, jsonEnd + 1));
          } catch (retryError: any) {
            return NextResponse.json(
              { 
                prompt: '', 
                negative_prompt: '', 
                error: `Failed to parse Groq JSON response: ${parseError?.message || 'Invalid JSON'}. Raw response preview: ${responseText.substring(0, 200)}` 
              },
              { status: 500 }
            );
          }
        } else {
          return NextResponse.json(
            { 
              prompt: '', 
              negative_prompt: '', 
              error: `Failed to parse Groq JSON response: ${parseError?.message || 'Invalid JSON'}. Raw response preview: ${responseText.substring(0, 200)}` 
            },
            { status: 500 }
          );
        }
      }

      const prompt = String(parsed.prompt || '').trim();
      
      // Validate word count (same as two-step pipeline)
      const wordCount = prompt.split(/\s+/).filter(word => word.length > 0).length;
      const wordCountWarning = wordCount < minWords 
        ? `Warning: Prompt is shorter than minimum (${wordCount}/${minWords} words)` 
        : undefined;

      return NextResponse.json({
        prompt,
        negative_prompt: String(parsed.negative_prompt || negativePolicy).trim(),
        title: String(parsed.title || '').trim().slice(0, 70),
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 45) : [],
        error: wordCountWarning
      });
    }

    // For Gemini/Mistral: Use 2-step pipeline (vision captioning + prompt writing)
    // Step 1: Vision captioning (Gemini Vision)
    const visionArgs: VisionCaptionArgs = {
      imageData,
      imageUrl,
      assetType,
      bearer: visionBearer || bearer, // Use visionBearer if provided, otherwise bearer (should be Gemini key)
      geminiModel
    };

    const caption = await generateVisionCaption(visionArgs);
    if (caption.error) {
      return NextResponse.json(
        { prompt: '', negative_prompt: '', error: `Vision analysis failed: ${caption.error}` },
        { status: 500 }
      );
    }

    // Step 2: Prompt writer (selected provider)
    const promptArgs: PromptWriterArgs = {
      caption,
      platform,
      assetType,
      minWords,
      stylePolicy,
      negativePolicy,
      provider,
      bearer,
      geminiModel,
      mistralModel,
      groqModel
    };

    const result = await generateImagePrompt(promptArgs);

    if (result.error && !result.prompt) {
      return NextResponse.json(
        { prompt: '', negative_prompt: '', error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      prompt: result.prompt,
      negative_prompt: result.negative_prompt,
      title: result.title,
      keywords: result.keywords,
      error: result.error
    });
  } catch (error: any) {
    return NextResponse.json(
      { prompt: '', negative_prompt: '', error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

