/**
 * Cloudflare Pages Function: GET /api/qld-fires
 *
 * Production counterpart of server/providers/qld-fires.js (vite dev
 * middleware). The Queensland Fire Department S3 origin sends no CORS
 * headers, so the browser fetches this same-origin path instead.
 * Cloudflare's edge caches the response for 10 minutes; the upstream feed
 * itself regenerates every 30 minutes.
 */
export async function onRequest() {
  const UPSTREAM_URL =
    'https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json';
  const upstream = await fetch(UPSTREAM_URL, {
    headers: { Accept: 'application/json' },
    cf: { cacheTtl: 600, cacheEverything: true },
  });
  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `qld fires upstream HTTP ${upstream.status}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const body = await upstream.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(
      JSON.stringify({ error: 'qld fires upstream returned invalid JSON' }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
    return new Response(
      JSON.stringify({
        error: 'qld fires upstream is not a FeatureCollection',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
