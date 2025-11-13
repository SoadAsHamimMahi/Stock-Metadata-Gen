import { NextRequest } from 'next/server';
import { retryTracker } from '@/lib/retry-tracker';

// Server-Sent Events endpoint for real-time retry updates
export async function GET(req: NextRequest) {
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch (error) {
          // Connection closed
          console.error('Error sending SSE data:', error);
        }
      };

      send(JSON.stringify({ type: 'connected' }));

      // Subscribe to retry events - send all events (client will filter by filename)
      const unsubscribe = retryTracker.subscribe((event) => {
        send(JSON.stringify({
          type: 'retry-event',
          ...event
        }));
      });

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          send(JSON.stringify({ type: 'heartbeat' }));
        } catch {
          // Connection closed
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

