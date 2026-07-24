export type Coordinates = { lat: number; lon: number };

export function approximateMapLocation(location: Coordinates): Coordinates {
  if (
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lon) ||
    location.lat < -90 ||
    location.lat > 90 ||
    location.lon < -180 ||
    location.lon > 180
  ) {
    throw new Error("Coordinates are out of range");
  }
  return {
    lat: Math.round(location.lat * 100) / 100,
    lon: Math.round(location.lon * 100) / 100,
  };
}
