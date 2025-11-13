import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const TestBody = z.object({
  provider: z.enum(['gemini', 'mistral']),
  apiKey: z.string().min(1)
});

export async function POST(req: NextRequest) {
  try {
    const parsed = TestBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid request. Provider and API key are required.' 
      }, { status: 400 });
    }

    const { provider, apiKey } = parsed.data;

    if (provider === 'gemini') {
      // First, try to list available models to find one that works
      let availableModel: string | null = null;
      let apiVersion = 'v1';
      
      // Try to get available models from v1 API
      try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
        if (listRes.ok) {
          const listData = await listRes.json();
          // Look for models that support generateContent
          const models = listData.models || [];
          const geminiModel = models.find((m: any) => 
            m.name && (
              m.name.includes('gemini-2.5') ||
              m.name.includes('gemini-2.0') ||
              m.name.includes('gemini-1.5') ||
              m.name.includes('gemini-pro')
            ) && m.supportedGenerationMethods?.includes('generateContent')
          );
          if (geminiModel) {
            availableModel = geminiModel.name.replace('models/', '');
          }
        }
      } catch {
        // If listing fails, we'll try direct calls
      }
      
      // If no model found from listing, try v1beta
      if (!availableModel) {
        try {
          const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
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
              availableModel = geminiModel.name.replace('models/', '');
              apiVersion = 'v1beta';
            }
          }
        } catch {
          // Continue with fallback models
        }
      }
      
      // Fallback: try common models in order (using currently available models)
      const fallbackModels = [
        { model: 'gemini-2.5-flash', version: 'v1beta' }, // Current default model
        { model: 'gemini-2.0-flash-exp', version: 'v1beta' },
        { model: 'gemini-1.5-flash-latest', version: 'v1beta' },
        { model: 'gemini-1.5-pro-latest', version: 'v1beta' },
        { model: 'gemini-1.5-flash', version: 'v1beta' },
        { model: 'gemini-1.5-pro', version: 'v1beta' },
        { model: 'gemini-pro', version: 'v1' } // Only try v1 for gemini-pro
      ];
      
      const testBody = {
        contents: [{
          role: 'user',
          parts: [{ text: 'Say "test" if you can read this.' }]
        }]
      };
      
      let res: Response | null = null;
      let lastError: any = null;
      
      // If we found a model from listing, try it first
      if (availableModel) {
        const url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${availableModel}:generateContent`;
        res = await fetch(`${url}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testBody)
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return NextResponse.json({
              success: true,
              message: 'API key is valid and working correctly'
            });
          }
        } else {
          lastError = await res.json().catch(() => ({}));
        }
      }
      
      // Try fallback models
      for (const { model, version } of fallbackModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent`;
          res = await fetch(`${url}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testBody)
          });
          
          if (res.ok) {
            const data = await res.json();
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
              return NextResponse.json({
                success: true,
                message: `API key is valid and working correctly (tested with ${model})`
              });
            }
          } else {
            const errorData = await res.json().catch(() => ({}));
            // Only store error if it's not a "model not found" error (we'll try next model)
            if (!errorData?.error?.message?.includes('not found') && !errorData?.error?.message?.includes('not supported')) {
              lastError = errorData;
            }
            // Continue to next model if this one doesn't exist
            continue;
          }
        } catch (fetchError) {
          // Continue to next model on fetch errors
          continue;
        }
      }
      
      // If all attempts failed
      return NextResponse.json({
        success: false,
        error: lastError?.error?.message || 'No available Gemini models found. Please check your API key and ensure it has access to Gemini models.',
        status: res?.status || 400
      }, { status: 200 });

    } else if (provider === 'mistral') {
      // Test Mistral API with a minimal request
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [
            { role: 'user', content: 'Say "test" if you can read this.' }
          ],
          max_tokens: 10
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: errorData.error?.message || `API request failed with status ${res.status}`,
          status: res.status
        }, { status: 200 }); // Return 200 but with success: false
      }

      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        return NextResponse.json({
          success: true,
          message: 'API key is valid and working correctly'
        });
      }

      return NextResponse.json({
        success: false,
        error: 'Unexpected response format from API'
      }, { status: 200 });
    }

    return NextResponse.json({
      success: false,
      error: 'Unknown provider'
    }, { status: 400 });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to test API key. Please check your network connection.'
    }, { status: 200 });
  }
}

