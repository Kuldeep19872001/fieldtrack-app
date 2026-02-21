import type { LocationPoint } from './types';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const SNAP_TO_ROADS_URL = 'https://roads.googleapis.com/v1/snapToRoads';
const MAX_POINTS_PER_REQUEST = 100;

export async function snapToRoads(
  points: LocationPoint[]
): Promise<Array<{ latitude: number; longitude: number }>> {
  // 1. Basic Validation
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn('Google Maps API key not set, using raw GPS points.');
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }

  if (points.length < 2) {
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }

  try {
    const allSnapped: Array<{ latitude: number; longitude: number }> = [];
    const chunks = chunkPoints(points, MAX_POINTS_PER_REQUEST);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const pathStr = chunk
        .map(p => `${p.latitude},${p.longitude}`)
        .join('|');

      const url = `${SNAP_TO_ROADS_URL}?path=${encodeURIComponent(pathStr)}&interpolate=true&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);

      if (!response.ok) {
        console.error('Snap to roads API error:', response.status);
        // If one chunk fails, return raw points to ensure the line doesn't break
        return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
      }

      const data = await response.json();

      if (data.snappedPoints && data.snappedPoints.length > 0) {
        data.snappedPoints.forEach((sp: any) => {
          const newPoint = {
            latitude: Number(sp.location.latitude),
            longitude: Number(sp.location.longitude),
          };

          // DEDUPLICATION LOGIC:
          // Skip if the point is identical to the last one (common at chunk overlaps)
          const lastPoint = allSnapped[allSnapped.length - 1];
          if (lastPoint) {
            const isDuplicate = 
              lastPoint.latitude === newPoint.latitude && 
              lastPoint.longitude === newPoint.longitude;
            
            if (!isDuplicate) {
              allSnapped.push(newPoint);
            }
          } else {
            allSnapped.push(newPoint);
          }
        });
      } else {
        // Fallback for this specific chunk if no roads found nearby
        chunk.forEach(p => allSnapped.push({ latitude: p.latitude, longitude: p.longitude }));
      }
    }

    // Final check: If snapping produced fewer than 2 points, fallback to raw
    if (allSnapped.length < 2) {
      return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
    }

    return allSnapped;
  } catch (e: any) {
    console.error('Snap to roads failed:', e.message);
    return points.map(p => ({ latitude: p.latitude, longitude: p.longitude }));
  }
}

/**
 * Splits points into manageable chunks for Google API.
 * Uses an overlap to maintain road continuity between chunks.
 */
function chunkPoints(points: LocationPoint[], maxSize: number): LocationPoint[][] {
  if (points.length <= maxSize) return [points];

  const chunks: LocationPoint[][] = [];
  const overlap = 5; // Increased overlap for better continuity

  let start = 0;
  while (start < points.length) {
    let end = start + maxSize;
    chunks.push(points.slice(start, end));
    
    if (end >= points.length) break;
    // Move start back by overlap for the next chunk
    start = end - overlap; 
  }

  return chunks;
}