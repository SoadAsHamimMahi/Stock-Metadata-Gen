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

// Helper to get month start date
export function getMonthStart(date: Date = new Date()): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
export async function getLeaderboard(period: 'weekly' | 'monthly'): Promise<LeaderboardEntry[]> {
  try {
    const now = new Date();
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
              };
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

