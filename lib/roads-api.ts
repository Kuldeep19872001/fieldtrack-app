import type { LocationPoint } from './types';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const SNAP_TO_ROADS_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const MAX_POINTS_PER_REQUEST = 100;

interface SnappedPoint {
  location: {
    latitude: number;
    longitude: number;
  };
  originalIndex?: number;
  placeId?: string;
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

  try {
    const allSnapped: Array<{ latitude: number; longitude: number }> = [];
    const chunks = chunkPoints(points, MAX_POINTS_PER_REQUEST);

    for (const chunk of chunks) {
      const pathStr = chunk
        .map(p => `${p.latitude},${p.longitude}`)
        .join('|');

      const url = `${SNAP_TO_ROADS_URL}?path=${encodeURIComponent(pathStr)}&interpolate=true&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);

      if (!response.ok) {
        const errText = await response.text();
        console.error('Snap to roads API error:', response.status, errText);
        return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
      }

      const data = await response.json();

      if (data.snappedPoints && data.snappedPoints.length > 0) {
        for (const sp of data.snappedPoints) {
          allSnapped.push({
            latitude: sp.location.latitude,
            longitude: sp.location.longitude,
          });
        }
      } else {
        chunk.forEach(p => allSnapped.push({ latitude: p.latitude, longitude: p.longitude }));
      }
    }

    if (allSnapped.length < 2) {
      return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
    }

    return allSnapped;
  } catch (e: any) {
    console.error('Snap to roads failed:', e.message);
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }
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
