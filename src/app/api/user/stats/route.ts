import { NextRequest, NextResponse } from 'next/server';
import { getUserStats } from '@/lib/firestore';

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }
    
    const stats = await getUserStats(userId);
    
    if (!stats) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      totalGenerations: stats.totalGenerations || 0,
      memberSince: stats.memberSince?.toDate?.()?.toISOString() || null,
      lastGenerationDate: stats.lastGenerationDate?.toDate?.()?.toISOString() || null,
      displayName: stats.displayName,
      email: stats.email,
      photoURL: stats.photoURL
    });
  } catch (error: any) {
    console.error('Error fetching user stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user stats' },
      { status: 500 }
    );
  }
}

