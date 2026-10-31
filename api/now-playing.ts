import type { IncomingMessage, ServerResponse } from 'http';

interface VercelRequest extends IncomingMessage {
  query?: {
    stationIds?: string | string[];
  };
}

interface VercelResponse extends ServerResponse {
  status?: (code: number) => VercelResponse;
  json?: (body: unknown) => void;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=10');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  let stationIds = '';
  if (req.query && req.query.stationIds) {
    stationIds = Array.isArray(req.query.stationIds)
      ? req.query.stationIds.join(',')
      : String(req.query.stationIds);
  } else if (req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      stationIds = parsedUrl.searchParams.get('stationIds') || '';
    } catch {
      stationIds = '';
    }
  }

  stationIds = stationIds.trim();
  if (!stationIds) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Parametro stationIds mancante' }));
    return;
  }

  try {
    const upstreamUrl = `https://api.radio.de/stations/now-playing?stationIds=${encodeURIComponent(
      stationIds
    )}`;
    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; RadioWeb/1.0)',
      },
    });

    if (!upstreamRes.ok) {
      res.statusCode = upstreamRes.status;
      res.end(JSON.stringify([]));
      return;
    }

    const data = await upstreamRes.json();
    res.statusCode = 200;
    res.end(JSON.stringify(Array.isArray(data) ? data : []));
  } catch {
    res.statusCode = 200;
    res.end(JSON.stringify([]));
  }
}
