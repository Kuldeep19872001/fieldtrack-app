import type { LocationPoint } from './types';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const SNAP_TO_ROADS_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const MAX_POINTS_PER_REQUEST = 100;
const MAX_GAP_KM = 0.5;
const MAX_POINTS_FOR_API = 500;
const TOTAL_SNAP_TIMEOUT = 30000;

interface SnappedPoint {
  location: {
    latitude: number;
    longitude: number;
  };
  originalIndex?: number;
  placeId?: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function downsamplePoints(points: LocationPoint[], maxPoints: number): LocationPoint[] {
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

function splitAtGaps(points: LocationPoint[]): LocationPoint[][] {
  if (points.length < 2) return [points];
  const segments: LocationPoint[][] = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const dist = haversineKm(prev.latitude, prev.longitude, points[i].latitude, points[i].longitude);
    if (dist > MAX_GAP_KM) {
      if (current.length >= 2) segments.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }
  if (current.length >= 1) segments.push(current);
  return segments;
}

export async function snapToRoads(
  points: LocationPoint[]
): Promise<Array<{ latitude: number; longitude: number }>> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('Google Maps API key not set, skipping snap-to-roads');
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }

  if (points.length < 2) {
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }

  const startTime = Date.now();

  try {
    const sampled = downsamplePoints(points, MAX_POINTS_FOR_API);
    const gapSegments = splitAtGaps(sampled);
    const allSnapped: Array<{ latitude: number; longitude: number }> = [];

    for (const segment of gapSegments) {
      if (Date.now() - startTime > TOTAL_SNAP_TIMEOUT) {
        console.warn('Snap-to-roads total timeout reached, using raw GPS for remaining segments');
        for (const p of segment) {
          allSnapped.push({ latitude: p.latitude, longitude: p.longitude });
        }
        continue;
      }

      if (segment.length < 2) {
        allSnapped.push({ latitude: segment[0].latitude, longitude: segment[0].longitude });
        continue;
      }

      const segmentSnapped = await snapSegment(segment, startTime);
      allSnapped.push(...segmentSnapped);
    }

    if (allSnapped.length < 2) {
      return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
    }

    return removeDuplicateConsecutive(allSnapped);
  } catch (e: any) {
    console.error('Snap to roads failed:', e.message);
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }
}

async function snapSegment(
  points: LocationPoint[],
  globalStartTime: number
): Promise<Array<{ latitude: number; longitude: number }>> {
  const result: Array<{ latitude: number; longitude: number }> = [];
  const chunks = chunkPoints(points, MAX_POINTS_PER_REQUEST);

  for (const chunk of chunks) {
    if (Date.now() - globalStartTime > TOTAL_SNAP_TIMEOUT) {
      console.warn('Snap-to-roads timeout in segment, falling back to raw for remaining chunks');
      chunk.forEach(p => result.push({ latitude: p.latitude, longitude: p.longitude }));
      continue;
    }

    const pathStr = chunk
      .map(p => `${p.latitude},${p.longitude}`)
      .join('|');

    const url = `${SNAP_TO_ROADS_URL}?path=${encodeURIComponent(pathStr)}&interpolate=true&key=${GOOGLE_MAPS_API_KEY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      console.warn('Snap-to-roads fetch failed for chunk, using raw:', fetchErr.message);
      chunk.forEach(p => result.push({ latitude: p.latitude, longitude: p.longitude }));
      continue;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('Snap to roads API error:', response.status, errText);
      chunk.forEach(p => result.push({ latitude: p.latitude, longitude: p.longitude }));
      continue;
    }

    const data = await response.json();

    if (data.snappedPoints && data.snappedPoints.length > 0) {
      const chunkSnapped = data.snappedPoints.map((sp: SnappedPoint) => ({
        latitude: sp.location.latitude,
        longitude: sp.location.longitude,
      }));

      if (result.length > 0 && chunkSnapped.length > 0) {
        const last = result[result.length - 1];
        const first = chunkSnapped[0];
        const dist = haversineKm(last.latitude, last.longitude, first.latitude, first.longitude);
        if (dist < 0.01) {
          chunkSnapped.shift();
        }
      }
      result.push(...chunkSnapped);
    } else {
      chunk.forEach(p => result.push({ latitude: p.latitude, longitude: p.longitude }));
    }
  }

  return result;
}

function chunkPoints(points: LocationPoint[], maxSize: number): LocationPoint[][] {
  if (points.length <= maxSize) return [points];

  const chunks: LocationPoint[][] = [];
  const overlap = 3;

  for (let i = 0; i < points.length; i += maxSize - overlap) {
    const end = Math.min(i + maxSize, points.length);
    chunks.push(points.slice(i, end));
    if (end === points.length) break;
  }

  return chunks;
}

function removeDuplicateConsecutive(
  coords: Array<{ latitude: number; longitude: number }>
): Array<{ latitude: number; longitude: number }> {
  if (coords.length <= 1) return coords;
  const result = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const prev = result[result.length - 1];
    if (prev.latitude !== coords[i].latitude || prev.longitude !== coords[i].longitude) {
      result.push(coords[i]);
    }
  }
  return result;
}
