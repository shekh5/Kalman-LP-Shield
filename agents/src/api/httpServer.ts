import http from 'http';
import { URL } from 'url';
import WebSocket, { WebSocketServer } from 'ws';
import { StateStore } from './stateStore';

export interface ServerConfig {
  port: number;
  host: string;
}

export interface StartedServer {
  server: http.Server;
  wss: WebSocketServer;
  broadcast: (msg: unknown) => void;
  close: () => Promise<void>;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(payload);
}

function text(res: http.ServerResponse, status: number, body: string) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(body);
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  return JSON.parse(raw);
}

export function startHttpServer(store: StateStore, config: ServerConfig): StartedServer {
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) return json(res, 400, { error: 'missing url' });

      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        });
        return res.end();
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;

      if (req.method === 'GET' && path === '/health') {
        return json(res, 200, {
          status: 'ok',
          timestamp: Date.now(),
          demoMode: store.getPublicState().demoMode,
          uptimeSec: process.uptime(),
        });
      }

      if (req.method === 'GET' && path === '/metrics') {
        // Lightweight metrics (Prometheus-ish)
        const state = store.getPublicState();
        const lines: string[] = [];
        lines.push(`# HELP kalmanguard_pools Number of pools`);
        lines.push(`# TYPE kalmanguard_pools gauge`);
        lines.push(`kalmanguard_pools ${state.pools.length}`);
        lines.push(`# HELP kalmanguard_alerts Number of alerts`);
        lines.push(`# TYPE kalmanguard_alerts gauge`);
        lines.push(`kalmanguard_alerts ${state.alerts.length}`);
        for (const p of state.pools) {
          lines.push(`kalmanguard_pool_risk_score{pool="${p.id}"} ${p.riskScore}`);
          lines.push(`kalmanguard_pool_fee_bps{pool="${p.id}"} ${p.currentFeeBps}`);
        }
        return text(res, 200, lines.join('\n'));
      }

      if (req.method === 'GET' && path === '/api/state') {
        return json(res, 200, store.getPublicState());
      }

      if (req.method === 'GET' && path === '/api/pools') {
        return json(res, 200, { pools: store.getPools() });
      }

      if (req.method === 'GET' && path === '/api/agents') {
        return json(res, 200, { agents: store.getAgents() });
      }

      if (req.method === 'GET' && path === '/api/alerts') {
        return json(res, 200, { alerts: store.getAlerts() });
      }

      if (req.method === 'GET' && path === '/api/analytics') {
        return json(res, 200, store.getAnalytics());
      }

      if (req.method === 'POST' && path === '/api/demo/reset') {
        store.reset();
        return json(res, 200, { ok: true });
      }

      if (req.method === 'POST' && path.startsWith('/api/alerts/') && path.endsWith('/dismiss')) {
        // No-op for now; frontend keeps local dismissal.
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { error: 'not_found', path });
    } catch (err: any) {
      return json(res, 500, { error: 'internal_error', message: err?.message || String(err) });
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.send(JSON.stringify({ type: 'snapshot', data: store.getPublicState() }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: Date.now() }));
      } catch {
        // ignore
      }
    });
  });

  const broadcast = (msg: unknown) => {
    const payload = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  };

  server.listen(config.port, config.host);

  const close = async () => {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  };

  return { server, wss, broadcast, close };
}
