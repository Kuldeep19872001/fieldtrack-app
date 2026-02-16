import type { LocationPoint } from './types';

const OSRM_BASE = 'https://router.project-osrm.org';
const MAX_COORDS_PER_REQUEST = 100;
const MATCH_RADIUS = 100;

let routeCache: { key: string; coords: { latitude: number; longitude: number }[] } | null = null;

function buildCoordString(points: { latitude: number; longitude: number }[]): string {
  return points.map(p => `${p.longitude},${p.latitude}`).join(';');
}

function getCacheKey(points: LocationPoint[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${points.length}_${first.latitude.toFixed(5)}_${first.longitude.toFixed(5)}_${last.latitude.toFixed(5)}_${last.longitude.toFixed(5)}`;
}

function samplePoints(points: LocationPoint[], maxPoints: number): LocationPoint[] {
  if (points.length <= maxPoints) return points;
  const result: LocationPoint[] = [points[0]];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    const idx = Math.round(i * step);
    result.push(points[idx]);
  }
  result.push(points[points.length - 1]);
  return result;
}

function deduplicatePoints(points: LocationPoint[]): LocationPoint[] {
  if (points.length < 2) return points;
  const result: LocationPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const latDiff = Math.abs(curr.latitude - prev.latitude);
    const lonDiff = Math.abs(curr.longitude - prev.longitude);
    if (latDiff > 0.00005 || lonDiff > 0.00005) {
      result.push(curr);
    }
  }
  return result;
}

async function tryMatchRoute(points: LocationPoint[]): Promise<{ latitude: number; longitude: number }[] | null> {
  try {
    const sampled = samplePoints(points, MAX_COORDS_PER_REQUEST);
    const deduped = deduplicatePoints(sampled);
    if (deduped.length < 2) return null;

    const coordStr = buildCoordString(deduped);
    const radiuses = deduped.map(() => MATCH_RADIUS.toString()).join(';');
    const timestamps = deduped.map((p, i) => Math.floor((p.timestamp || Date.now()) / 1000) + i).join(';');
    const url = `${OSRM_BASE}/match/v1/driving/${coordStr}?overview=full&geometries=geojson&radiuses=${radiuses}&timestamps=${timestamps}&gaps=ignore`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.code !== 'Ok' || !data.matchings || data.matchings.length === 0) return null;

    let allCoords: { latitude: number; longitude: number }[] = [];
    for (const matching of data.matchings) {
      if (matching.geometry?.coordinates) {
        const matchCoords = matching.geometry.coordinates.map((c: number[]) => ({
          latitude: c[1],
          longitude: c[0],
        }));
        allCoords = allCoords.concat(matchCoords);
      }
    }

    return allCoords.length >= 2 ? allCoords : null;
  } catch (e) {
    console.warn('OSRM match failed:', e);
    return null;
  }
}

async function tryRouteWaypoints(points: LocationPoint[]): Promise<{ latitude: number; longitude: number }[] | null> {
  try {
    const sampled = samplePoints(points, 25);
    const deduped = deduplicatePoints(sampled);
    if (deduped.length < 2) return null;

    const chunks: LocationPoint[][] = [];
    for (let i = 0; i < deduped.length - 1; i += 24) {
      const end = Math.min(i + 25, deduped.length);
      chunks.push(deduped.slice(i, end));
    }

    let allCoords: { latitude: number; longitude: number }[] = [];

    for (const chunk of chunks) {
      if (chunk.length < 2) continue;
      const coordStr = buildCoordString(chunk);
      const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) continue;

      const route = data.routes[0];
      if (route.geometry?.coordinates) {
        const routeCoords = route.geometry.coordinates.map((c: number[]) => ({
          latitude: c[1],
          longitude: c[0],
        }));

        if (allCoords.length > 0 && routeCoords.length > 0) {
          routeCoords.shift();
        }
        allCoords = allCoords.concat(routeCoords);
      }
    }

    return allCoords.length >= 2 ? allCoords : null;
  } catch (e) {
    console.warn('OSRM route failed:', e);
    return null;
  }
}

export async function snapToRoads(points: LocationPoint[]): Promise<{ latitude: number; longitude: number }[]> {
  if (points.length < 2) {
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }

  const cacheKey = getCacheKey(points);
  if (routeCache && routeCache.key === cacheKey) {
    return routeCache.coords;
  }

  const matchResult = await tryMatchRoute(points);
  if (matchResult) {
    routeCache = { key: cacheKey, coords: matchResult };
    return matchResult;
  }

  const routeResult = await tryRouteWaypoints(points);
  if (routeResult) {
    routeCache = { key: cacheKey, coords: routeResult };
    return routeResult;
  }

  const fallback = points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  return fallback;
}

export function clearRouteCache() {
  routeCache = null;
}
