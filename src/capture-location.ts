import type { LocationSample } from '../shared/capture';

// A single fresh reading, never a background location watch.
export function readCaptureLocation(enabled: boolean): Promise<LocationSample> {
  if (!enabled) return Promise.resolve({ status: 'not_requested' });
  if (!navigator.geolocation) return Promise.resolve({ status: 'unavailable' });
  return new Promise((resolve) => {
    let settled = false;
    const done = (sample: LocationSample) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(sample);
    };
    const timeout = setTimeout(() => done({ status: 'unavailable' }), 10000);
    try {
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => {
          if (
            !Number.isFinite(timestamp) ||
            Math.abs(Date.now() - timestamp) > 30000 ||
            !Number.isFinite(coords.latitude) ||
            !Number.isFinite(coords.longitude) ||
            !Number.isFinite(coords.accuracy) ||
            coords.accuracy < 0
          ) {
            done({ status: 'unavailable' });
            return;
          }
          done({
            status: 'recorded',
            source: 'browser_geolocation',
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            measuredAt: new Date(timestamp).toISOString(),
          });
        },
        (error) => done({ status: error.code === 1 ? 'denied' : 'unavailable' }),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 },
      );
    } catch {
      done({ status: 'unavailable' });
    }
  });
}
