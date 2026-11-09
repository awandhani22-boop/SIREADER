import type { Server } from 'node:http';

/**
 * Stop accepting new requests, then close every active HTTP connection.
 *
 * SSE responses intentionally remain open, so server.close() alone is not
 * sufficient for process shutdown. Closing active sockets triggers the BFF
 * response-close handlers, which abort and release their upstream SSE streams.
 */
export function shutdownHttpServer(server: Server, onClosed: () => void): void {
  if (!server.listening) {
    onClosed();
    return;
  }

  // Call close first so the server stops accepting new connections.
  server.close(onClosed);

  // Node 18.2+ (also required by this app's built-in fetch baseline).
  // This must follow server.close() to avoid a new-connection race.
  server.closeAllConnections();
}
