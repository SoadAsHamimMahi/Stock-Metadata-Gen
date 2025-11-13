import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: This API route is no longer used.
 * Files are now stored client-side in the browser.
 * This route is kept for backward compatibility but returns a deprecation warning.
 */
export const runtime = 'nodejs';
export const maxDuration = 10; // Vercel limit: 10s (free) / 60s (pro)

export async function POST(req: NextRequest) {
  // Return deprecation message
  return NextResponse.json({ 
    message: 'This API route is deprecated. Files are now stored client-side in the browser.',
    error: 'DEPRECATED',
    files: []
  }, { status: 410 }); // 410 Gone
}

export async function GET() {
  // Return deprecation message
  return NextResponse.json({ 
    message: 'This API route is deprecated. Files are now stored client-side in the browser.',
    error: 'DEPRECATED',
    files: []
  }, { status: 410 }); // 410 Gone
}

export async function DELETE(req: NextRequest) {
  // Return deprecation message
  return NextResponse.json({ 
    message: 'This API route is deprecated. Files are now stored client-side in the browser.',
    error: 'DEPRECATED'
  }, { status: 410 }); // 410 Gone
}
