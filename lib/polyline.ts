import { LocationPoint } from './types';

/**
 * Encodes an array of coordinates into a compressed string.
 * Uses the Google Encoded Polyline Algorithm (5 decimal places).
 */
export function encodePolyline(points: Array<{latitude: number, longitude: number}> | LocationPoint[]): string {
  if (!points || points.length === 0) return '';
  
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    // 1e5 = 5 decimal places (standard for Google Maps)
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);

    const dLat = lat - prevLat;
    const dLng = lng - prevLng;

    encoded += encodeValue(dLat);
    encoded += encodeValue(dLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeValue(value: number): string {
  let shifted = value << 1;
  if (value < 0) {
    shifted = ~shifted;
  }

  let encoded = '';
  while (shifted >= 0x20) {
    const chunk = (shifted & 0x1f) | 0x20;
    encoded += String.fromCharCode(chunk + 63);
    shifted >>= 5;
  }
  encoded += String.fromCharCode(shifted + 63);

  return encoded;
}

/**
 * Decodes an encoded string back into an array of coordinates.
 */
export function decodePolyline(encoded: string): Array<{latitude: number, longitude: number}> {
  if (!encoded) return [];
  
  const points: Array<{latitude: number, longitude: number}> = [];
  let lat = 0;
  let lng = 0;
  let i = 0;

  try {
    while (i < encoded.length) {
      const dLat = decodeValue(encoded, i);
      i = dLat.nextIndex;
      lat += dLat.value;

      const dLng = decodeValue(encoded, i);
      i = dLng.nextIndex;
      lng += dLng.value;

      points.push({
        latitude: lat / 1e5,
        longitude: lng / 1e5,
      });
    }
  } catch (e) {
    console.error('Polyline decoding failed:', e);
    return [];
  }

  return points;
}

function decodeValue(encoded: string, startIndex: number): {value: number, nextIndex: number} {
  let value = 0;
  let shift = 0;
  let i = startIndex;
  let chunk = 0;

  do {
    chunk = encoded.charCodeAt(i) - 63;
    value |= (chunk & 0x1f) << shift;
    shift += 5;
    i++;
  } while (chunk >= 0x20);

  if (value & 1) {
    value = ~value;
  }
  value >>= 1;

  return {value, nextIndex: i};
}