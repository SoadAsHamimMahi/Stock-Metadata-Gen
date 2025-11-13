// Client-side SSE connection for retry events
'use client';

export class RetrySSEClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<(event: any) => void>> = new Map();
  private connected = false;

  connect(): void {
    // Only connect once for all files
    if (this.connected && this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
      return;
    }

    // Close existing connection if any
    this.disconnect();

    // Connect without filename filter to get all events
    const url = `/api/retry-events`;
    this.eventSource = new EventSource(url);
    this.connected = true;

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'retry-event' && data.filename) {
          // Notify listeners for the specific filename
          const filenameListeners = this.listeners.get(data.filename);
          if (filenameListeners) {
            filenameListeners.forEach(listener => {
              try {
                listener(data);
              } catch (error) {
                console.error('Error in retry event listener:', error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error parsing SSE event:', error);
      }
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      this.connected = false;
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (this.eventSource?.readyState === EventSource.CLOSED && this.listeners.size > 0) {
          this.connect();
        }
      }, 3000);
    };

    this.eventSource.onopen = () => {
      this.connected = true;
    };
  }

  subscribe(filename: string, listener: (event: any) => void): () => void {
    if (!this.listeners.has(filename)) {
      this.listeners.set(filename, new Set());
    }
    
    this.listeners.get(filename)!.add(listener);
    
    // Connect if not already connected
    if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
      this.connect();
    }
    
    // Return unsubscribe function
    return () => {
      const filenameListeners = this.listeners.get(filename);
      if (filenameListeners) {
        filenameListeners.delete(listener);
        if (filenameListeners.size === 0) {
          this.listeners.delete(filename);
        }
      }
      
      // Disconnect if no more listeners
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.connected = false;
    }
  }
}

// Singleton instance
export const retrySSEClient = new RetrySSEClient();

