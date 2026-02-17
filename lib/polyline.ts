export function encodePolyline(points: Array<{latitude: number, longitude: number}>): string {
  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
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

export function decodePolyline(encoded: string): Array<{latitude: number, longitude: number}> {
  const points: Array<{latitude: number, longitude: number}> = [];
  let lat = 0;
  let lng = 0;
  let i = 0;

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
