import { io, type Socket } from 'socket.io-client';
import { API_URL, refreshSession } from './api';
import { sessionStore } from './session';

/**
 * Temps réel du centre de notifications (WebSocket de l'API, espace /realtime).
 * Une seule connexion par appareil, partagée par tous les abonnés ; elle suit la
 * session (connexion, déconnexion, jeton rafraîchi).
 */
type Listener = (id: string) => void;

let socket: Socket | null = null;
let token: string | null = null;
const listeners = new Set<Listener>();

async function ensure(): Promise<void> {
  const s = await sessionStore.get();
  if (!s) return disconnect();
  if (socket && token === s.accessToken) return;
  disconnect();
  token = s.accessToken;
  socket = io(`${API_URL}/realtime`, { auth: { token }, transports: ['websocket'], reconnectionDelay: 2000, reconnectionDelayMax: 30_000 });
  socket.on('notification', (msg: { id?: string }) => {
    if (msg?.id) for (const l of listeners) l(msg.id);
  });
  // Jeton expiré : l'API ferme la connexion ; on rafraîchit puis on se reconnecte avec le nouveau.
  socket.on('error', async (err: { code?: string }) => {
    if (err?.code === 'UNAUTHORIZED' && (await refreshSession())) void ensure();
  });
}

function disconnect(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  token = null;
}

sessionStore.onChange(() => {
  if (listeners.size > 0) void ensure();
  else disconnect();
});

export const realtime = {
  /** S'abonne aux nouvelles notifications de la session courante ; renvoie la fonction de désabonnement. */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    void ensure();
    return () => {
      listeners.delete(fn);
      if (listeners.size === 0) disconnect();
    };
  },
};
