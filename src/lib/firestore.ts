import { db } from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment, 
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';

// User document structure
export interface UserDoc {
  totalGenerations: number;
  memberSince: Timestamp;
  lastGenerationDate?: Timestamp;
  displayName: string;
  email: string;
  photoURL?: string;
  showOnLeaderboard?: boolean;
}

// Generation document structure
export interface GenerationDoc {
  userId: string;
  timestamp: Timestamp;
  fileCount: number;
  weekStart: string; // ISO date string (YYYY-MM-DD)
  monthStart: string; // ISO date string (YYYY-MM)
}

// Leaderboard entry structure
export interface LeaderboardEntry {
  userId: string;
  count: number;
  displayName: string;
  photoURL?: string;
}

// Helper to get week start date (Monday)
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0); // Reset time to start of day
  return monday.toISOString().split('T')[0];
}

// Helper to get week end date (Sunday)
export function getWeekEnd(date: Date = new Date()): string {
  const weekStart = new Date(getWeekStart(date));
  const sunday = new Date(weekStart);
  sunday.setDate(weekStart.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday.toISOString().split('T')[0];
}

// Helper to get month start date (returns YYYY-MM format for database, but also has a function that returns full date)
export function getMonthStart(date: Date = new Date()): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to get month start as full date string (YYYY-MM-DD)
export function getMonthStartDate(date: Date = new Date()): string {
  const d = new Date(date);
  const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  firstDay.setHours(0, 0, 0, 0);
  return firstDay.toISOString().split('T')[0];
}

// Helper to get month end date (last day of month)
export function getMonthEnd(date: Date = new Date()): string {
  const d = new Date(date);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  lastDay.setHours(23, 59, 59, 999);
  return lastDay.toISOString().split('T')[0];
}

// Helper to get previous week start
export function getPreviousWeekStart(currentDate: Date = new Date()): string {
  const weekStart = new Date(getWeekStart(currentDate));
  weekStart.setDate(weekStart.getDate() - 7);
  return getWeekStart(weekStart);
}

// Helper to get next week start
export function getNextWeekStart(currentDate: Date = new Date()): string {
  const weekStart = new Date(getWeekStart(currentDate));
  weekStart.setDate(weekStart.getDate() + 7);
  return getWeekStart(weekStart);
}

// Helper to get previous month start
export function getPreviousMonthStart(currentDate: Date = new Date()): string {
  const d = new Date(currentDate);
  d.setMonth(d.getMonth() - 1);
  return getMonthStart(d);
}

// Helper to get next month start
export function getNextMonthStart(currentDate: Date = new Date()): string {
  const d = new Date(currentDate);
  d.setMonth(d.getMonth() + 1);
  return getMonthStart(d);
}

// Helper to format date range for display
export function formatDateRange(startDate: string, endDate: string, period: 'weekly' | 'monthly'): string {
  // Handle month format (YYYY-MM) by converting to full date
  let startStr = startDate;
  if (period === 'monthly' && startDate.length === 7) {
    // If it's in YYYY-MM format, convert to YYYY-MM-01
    startStr = `${startDate}-01`;
  }
  
  // Create dates in local timezone to avoid UTC conversion issues
  const startParts = startStr.split('-');
  const endParts = endDate.split('-');
  
  const start = new Date(
    parseInt(startParts[0]),
    parseInt(startParts[1]) - 1,
    parseInt(startParts[2] || '1')
  );
  
  const end = new Date(
    parseInt(endParts[0]),
    parseInt(endParts[1]) - 1,
    parseInt(endParts[2] || '1')
  );
  
  if (period === 'weekly') {
    // Weekly: "Mon, Nov 25 - Sun, Dec 1, 2025"
    const startFormatted = start.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
    const endFormatted = end.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
    return `${startFormatted} - ${endFormatted}`;
  } else {
    // Monthly: "November 1 - 30, 2025"
    const startFormatted = start.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric' 
    });
    const endFormatted = end.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    // If same month, show: "November 1 - 30, 2025"
    // If different months (shouldn't happen but handle it): "November 30 - December 1, 2025"
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${start.toLocaleDateString('en-US', { month: 'long' })} ${start.getDate()} - ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${startFormatted} - ${endFormatted}`;
  }
}

// Initialize or update user document
export async function initializeUser(userId: string, displayName: string, email: string, photoURL?: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    // Create new user document
    await setDoc(userRef, {
      totalGenerations: 0,
      memberSince: serverTimestamp(),
      displayName,
      email,
      photoURL: photoURL || null,
      showOnLeaderboard: true
    });
  } else {
    // Update existing user document with latest info
    await updateDoc(userRef, {
      displayName,
      email,
      photoURL: photoURL || null
    });
  }
}

// Track a generation event
export async function trackGeneration(userId: string, fileCount: number, displayName: string, email: string, photoURL?: string): Promise<void> {
  try {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const monthStart = getMonthStart(now);
    
    console.log(`📊 Tracking generation: userId=${userId}, fileCount=${fileCount}, weekStart=${weekStart}, monthStart=${monthStart}`);
    
    // Ensure user document exists first
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      // Create user document if it doesn't exist
      console.log(`📝 Creating user document for ${userId}`);
      await initializeUser(userId, displayName, email, photoURL);
    }
    
    // Update user document
    await updateDoc(userRef, {
      totalGenerations: increment(fileCount),
      lastGenerationDate: serverTimestamp(),
      displayName,
      email,
      photoURL: photoURL || null
    });
    
    // Create generation record
    const generationRef = doc(collection(db, 'generations'));
    await setDoc(generationRef, {
      userId,
      timestamp: serverTimestamp(),
      fileCount,
      weekStart,
      monthStart
    });
    
    console.log(`✅ Generation tracked successfully`);
  } catch (error: any) {
    console.error('❌ Error in trackGeneration:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error; // Re-throw so caller can handle it
  }
}

// Get user stats
export async function getUserStats(userId: string): Promise<UserDoc | null> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    return null;
  }
  
  return userSnap.data() as UserDoc;
}

// Get leaderboard data for a specific period
export async function getLeaderboard(
  period: 'weekly' | 'monthly',
  targetDate?: Date
): Promise<LeaderboardEntry[]> {
  try {
    const now = targetDate || new Date();
    const periodStart = period === 'weekly' ? getWeekStart(now) : getMonthStart(now);
    const field = period === 'weekly' ? 'weekStart' : 'monthStart';
    
    console.log(`🔍 Querying leaderboard: period=${period}, field=${field}, periodStart=${periodStart}`);
    
    // Query generations for this period
    // Note: We filter by period and then sort in memory to avoid index requirements
    const generationsQuery = query(
      collection(db, 'generations'),
      where(field, '==', periodStart)
    );
    
    const snapshot = await getDocs(generationsQuery);
    console.log(`📊 Found ${snapshot.size} generation records for ${period} period`);
    
    // Aggregate by user
    const userCounts = new Map<string, { count: number; userId: string }>();
    
    snapshot.forEach((doc) => {
      const data = doc.data() as GenerationDoc;
      const current = userCounts.get(data.userId) || { count: 0, userId: data.userId };
      userCounts.set(data.userId, {
        count: current.count + data.fileCount,
        userId: data.userId
      });
    });
    
    console.log(`📊 Aggregated ${userCounts.size} unique users`);
    
    // Get user details - BATCH the lookups instead of sequential for better performance
    const entries: LeaderboardEntry[] = [];
    const userIds = Array.from(userCounts.keys());
    
    // Batch user lookups (10 at a time) to improve performance
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const userPromises = batch.map(async (userId) => {
        try {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            const userData = userSnap.data() as UserDoc;
            const count = userCounts.get(userId)?.count || 0;
            
            // Only include users who opted in to leaderboard
            if (userData.showOnLeaderboard !== false) {
              return {
                userId,
                count,
                displayName: userData.displayName,
                photoURL: userData.photoURL
              } as LeaderboardEntry;
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch user ${userId}:`, error);
        }
        return null;
      });
      
      const batchResults = await Promise.all(userPromises);
      const validEntries = batchResults.filter((e) => e !== null) as LeaderboardEntry[];
      entries.push(...validEntries);
    }
    
    // Sort by count descending and return top 20
    const sorted = entries
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    
    console.log(`✅ Leaderboard query complete: ${sorted.length} entries`);
    return sorted;
  } catch (error: any) {
    console.error('❌ Error in getLeaderboard:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw error; // Re-throw so caller can handle it
  }
}

