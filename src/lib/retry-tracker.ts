// Retry event tracker for real-time retry attempt updates
// Uses in-memory storage to track retry attempts per request

interface RetryEvent {
  requestId: string;
  filename: string;
  attempt: number;
  maxAttempts: number;
  errorType: 'overloaded' | 'rate-limit' | 'server-error';
  delay?: number;
  status: 'retrying' | 'success' | 'failed';
}

class RetryTracker {
  private events: Map<string, RetryEvent> = new Map();
  private listeners: Set<(event: RetryEvent) => void> = new Set();

  // Generate unique request ID
  generateRequestId(filename: string): string {
    return `${filename}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Emit retry event
  emit(event: RetryEvent): void {
    this.events.set(event.requestId, event);
    
    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in retry event listener:', error);
      }
    });
  }

  // Subscribe to retry events
  subscribe(listener: (event: RetryEvent) => void): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  // Get current retry state for a request
  getState(requestId: string): RetryEvent | undefined {
    return this.events.get(requestId);
  }

  // Get all active retries for a filename
  getActiveRetries(filename: string): RetryEvent[] {
    return Array.from(this.events.values())
      .filter(e => e.filename === filename && e.status === 'retrying');
  }

  // Clean up old events (older than 5 minutes)
  cleanup(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [requestId, event] of this.events.entries()) {
      // Extract timestamp from requestId (format: filename-timestamp-random)
      const parts = requestId.split('-');
      if (parts.length >= 2) {
        const timestamp = parseInt(parts[parts.length - 2]);
        if (timestamp && timestamp < fiveMinutesAgo) {
          this.events.delete(requestId);
        }
      }
    }
  }

  // Clear all events for a filename
  clearForFilename(filename: string): void {
    for (const [requestId, event] of this.events.entries()) {
      if (event.filename === filename) {
        this.events.delete(requestId);
      }
    }
  }
}

// Singleton instance
export const retryTracker = new RetryTracker();

// Cleanup old events every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    retryTracker.cleanup();
  }, 60 * 1000);
}

