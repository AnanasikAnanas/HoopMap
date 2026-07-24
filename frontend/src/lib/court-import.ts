export type ImportedCourtPoint = {
  external_id?: string;
  name: string;
  description: string;
  address: string;
  lat: number;
  lon: number;
};

const HEADER_ALIASES = {
  name: ["name", "title", "название", "имя", "подпись", "iconcaption"],
  description: ["description", "desc", "описание", "комментарий"],
  address: ["address", "адрес"],
  lat: ["lat", "latitude", "широта"],
  lon: ["lon", "lng", "longitude", "долгота"],
  coordinates: ["coordinates", "coordinate", "координаты"],
  id: ["id", "external_id", "идентификатор"],
} as const;

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function property(
  record: Record<string, unknown>,
  aliases: readonly string[],
): string {
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const match = entries.find(([key]) => key.trim().toLowerCase() === alias);
    if (match) return text(match[1]);
  }
  return "";
}

function coordinate(value: string): number {
  return Number(value.trim().replace(",", "."));
}

function validPoint(point: ImportedCourtPoint): boolean {
  return (
    point.name.length >= 3 &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lon >= -180 &&
    point.lon <= 180
  );
}

function parseGeoJson(source: string): ImportedCourtPoint[] {
  const parsed = JSON.parse(source) as {
    type?: string;
    features?: Array<{
      id?: string | number;
      geometry?: { type?: string; coordinates?: unknown };
      properties?: Record<string, unknown>;
    }>;
  };
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Ожидается GeoJSON FeatureCollection");
  }
  return parsed.features
    .filter(
      (feature) =>
        feature.geometry?.type === "Point" &&
        Array.isArray(feature.geometry.coordinates),
    )
    .map((feature) => {
      const coordinates = feature.geometry!.coordinates as unknown[];
      const properties = feature.properties ?? {};
      const name =
        property(properties, HEADER_ALIASES.name) ||
        property(properties, ["ballooncontentheader", "hintcontent"]);
      const description =
        property(properties, HEADER_ALIASES.description) ||
        property(properties, ["ballooncontentbody"]);
      return {
        external_id: text(feature.id) || undefined,
        name,
        description,
        address: property(properties, HEADER_ALIASES.address),
        lon: Number(coordinates[0]),
        lat: Number(coordinates[1]),
      };
    })
    .filter(validPoint);
}

function detectSeparator(firstLine: string): string {
  const counts = [";", "\t", ","].map((separator) => ({
    separator,
    count: firstLine.split(separator).length,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 1 ? counts[0].separator : ",";
}

function parseCsvRows(source: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseCsv(source: string): ImportedCourtPoint[] {
  const clean = source.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const rows = parseCsvRows(clean, detectSeparator(firstLine));
  if (rows.length < 2) throw new Error("CSV-файл пуст или не содержит данных");
  const headers = rows[0].map((value) => value.trim());
  return rows
    .slice(1)
    .map((values) => {
      const record = Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""]),
      );
      let lat = coordinate(property(record, HEADER_ALIASES.lat));
      let lon = coordinate(property(record, HEADER_ALIASES.lon));
      const combined = property(record, HEADER_ALIASES.coordinates);
      if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && combined) {
        const pair = combined
          .split(/[\s,;]+/)
          .map(coordinate)
          .filter(Number.isFinite);
        if (pair.length >= 2) {
          [lat, lon] = pair;
        }
      }
      return {
        external_id: property(record, HEADER_ALIASES.id) || undefined,
        name: property(record, HEADER_ALIASES.name),
        description: property(record, HEADER_ALIASES.description),
        address: property(record, HEADER_ALIASES.address),
        lat,
        lon,
      };
    })
    .filter(validPoint);
}

export function parseCourtImport(
  source: string,
  filename: string,
): ImportedCourtPoint[] {
  const extension = filename.toLowerCase().split(".").pop();
  const result =
    extension === "json" || extension === "geojson"
      ? parseGeoJson(source)
      : parseCsv(source);
  if (!result.length) {
    throw new Error(
      "Не найдено точек с названием и координатами. Проверьте формат экспорта.",
    );
  }
  return result;
}
