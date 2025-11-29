import { NextRequest, NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/firestore';

// Force dynamic rendering to prevent static generation issues and secrets exposure
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const period = searchParams.get('period') as 'weekly' | 'monthly' | null;
    
    if (!period || (period !== 'weekly' && period !== 'monthly')) {
      return NextResponse.json(
        { error: 'Invalid period. Must be "weekly" or "monthly"' },
        { status: 400 }
      );
    }
    
    const leaderboard = await getLeaderboard(period);
    
    return NextResponse.json({
      period,
      entries: leaderboard,
      updatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching leaderboard:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch leaderboard' },
      { status: 500 }
    );
  }
}

