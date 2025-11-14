import { createFileRoute } from '@tanstack/react-router'
import { Bus } from '../../lib/bus'
import type { UIMessageChunk } from 'ai'

const ChatEvent = Bus.event('chat.message', {
  sessionId: '',
  requestId: '',
  chunk: {} as UIMessageChunk,
})

// Track active connections per sessionId
type ConnectionInfo = {
  controller: ReadableStreamDefaultController<Uint8Array>
  unsubscribe: () => void
  requestId: string
  createdAt: number
}

const activeConnections = new Map<string, ConnectionInfo[]>()

// Cleanup stale connections (older than 5 minutes) periodically
// Note: This runs in server context, so setInterval is available
const staleCleanupInterval = setInterval(() => {
  const now = Date.now()
  const staleThreshold = 5 * 60 * 1000 // 5 minutes

  for (const [sessionId, connections] of activeConnections.entries()) {
    const active = connections.filter((conn) => now - conn.createdAt < staleThreshold)
    for (const stale of connections.filter((conn) => now - conn.createdAt >= staleThreshold)) {
      stale.unsubscribe()
      try {
        stale.controller.close()
      } catch {
        // Already closed
      }
    }
    if (active.length === 0) {
      activeConnections.delete(sessionId)
    } else {
      activeConnections.set(sessionId, active)
    }
  }
}, 60000) // Run every minute

// Cleanup on process exit (if available)
if (typeof process !== 'undefined' && process.on) {
  process.on('SIGTERM', () => clearInterval(staleCleanupInterval))
  process.on('SIGINT', () => clearInterval(staleCleanupInterval))
}

// biome-ignore lint/suspicious/noExplicitAny: Route path will be registered when route tree regenerates
export const Route = createFileRoute('/api/events' as any)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionId = url.searchParams.get('sessionId')
        const requestId = url.searchParams.get('requestId')

        if (!sessionId) {
          return new Response('Missing sessionId parameter', { status: 400 })
        }

        if (!requestId) {
          return new Response('Missing requestId parameter', { status: 400 })
        }

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder()

            const sendChunk = (chunk: UIMessageChunk) => {
              try {
                const data = `data: ${JSON.stringify(chunk)}\n\n`
                controller.enqueue(encoder.encode(data))
              } catch (error) {
                console.error('Error sending chunk:', error)
                controller.error(error)
              }
            }

            const unsubscribe = Bus.subscribe(ChatEvent, async (event) => {
              const props = event.properties as {
                sessionId: string
                requestId: string
                chunk: UIMessageChunk
              }
              // Only send events for this specific request
              if (props.sessionId === sessionId && props.requestId === requestId) {
                sendChunk(props.chunk)
              }
            })

            // Register this connection
            const connectionInfo: ConnectionInfo = {
              controller,
              unsubscribe,
              requestId,
              createdAt: Date.now(),
            }
            const connections = activeConnections.get(sessionId) || []
            connections.push(connectionInfo)
            activeConnections.set(sessionId, connections)

            const cleanup = () => {
              unsubscribe()
              const connections = activeConnections.get(sessionId)
              if (connections) {
                const index = connections.findIndex((conn) => conn.requestId === requestId)
                if (index !== -1) {
                  connections.splice(index, 1)
                  if (connections.length === 0) {
                    activeConnections.delete(sessionId)
                  }
                }
              }
              try {
                controller.close()
              } catch {
                // Stream may already be closed
              }
            }

            request.signal.addEventListener('abort', cleanup)

            // Keep the stream alive - it will be closed when the client disconnects
          },
          cancel() {
            // Handle stream cancellation
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})

