import { NextRequest, NextResponse } from 'next/server';
import { generateAdobe } from '@/lib/microstock';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    provider = 'gemini',
    filename = '',
    assetType = 'photo',
    extension = '',
    negativeTitle = [],
    negativeKeywords = []
  } = body || {};

  if (!filename) {
    return NextResponse.json({ message: 'filename is required' }, { status: 400 });
  }

  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  
  try {
    const out = await generateAdobe({
      provider: provider as 'gemini' | 'mistral',
      filename,
      assetType: assetType as 'photo'|'illustration'|'vector'|'video'|'3d'|'icon',
      extension,
      negativeTitle: Array.isArray(negativeTitle) ? negativeTitle : [],
      negativeKeywords: Array.isArray(negativeKeywords) ? negativeKeywords : [],
      apiKey: bearer // optional key from client modal
    });

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ 
      message: e?.message ?? 'error',
      error: e?.message 
    }, { status: 400 });
  }
}

