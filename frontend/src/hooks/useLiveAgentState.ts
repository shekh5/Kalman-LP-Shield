import { useEffect, useRef } from 'react';
import { fetchState, resolveWsUrl, AgentApiState } from '../lib/agentApi';
import { useDashboardStore } from '../store/dashboard';

export function useLiveAgentState() {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const abort = new AbortController();

    const setConnected = useDashboardStore.getState().setConnected;
    const setLoading = useDashboardStore.getState().setLoading;
    const setError = useDashboardStore.getState().setError;
    const ingestSnapshot = useDashboardStore.getState().ingestSnapshot;

    async function init() {
      try {
        setLoading(true);
        const state = await fetchState(abort.signal);
        ingestSnapshot(state);
        setConnected(true);
        setError(null);
      } catch (err: any) {
        if (abort.signal.aborted) return;
        setConnected(false);
        setError(err?.message || 'Failed to load state');
      } finally {
        setLoading(false);
      }
    }

    init();

    // WebSocket stream
    const wsUrl = resolveWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg?.type === 'snapshot' && msg.data) {
          ingestSnapshot(msg.data as AgentApiState);
        }
      } catch {
        // ignore
      }
    };

    const ping = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 15000);

    return () => {
      window.clearInterval(ping);
      abort.abort();
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
  }, []);
}
