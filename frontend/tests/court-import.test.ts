import { describe, expect, it } from "vitest";
import { parseCourtImport } from "@/lib/court-import";

describe("Yandex Constructor court import", () => {
  it("parses point features from a GeoJSON export", () => {
    const points = parseCourtImport(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            id: 7,
            geometry: { type: "Point", coordinates: [49.2786, 53.5308] },
            properties: {
              iconCaption: "Площадка в парке",
              description: "Два кольца",
              address: "Парк Победы",
            },
          },
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: [
                [49, 53],
                [50, 54],
              ],
            },
          },
        ],
      }),
      "courts.geojson",
    );

    expect(points).toEqual([
      {
        external_id: "7",
        name: "Площадка в парке",
        description: "Два кольца",
        address: "Парк Победы",
        lat: 53.5308,
        lon: 49.2786,
      },
    ]);
  });

  it("parses a Russian semicolon-separated CSV export", () => {
    const points = parseCourtImport(
      [
        "Название;Описание;Адрес;Широта;Долгота",
        "Площадка Олимп;Открытая площадка;Приморский бульвар, 49;53,5188;49,2344",
      ].join("\n"),
      "courts.csv",
    );

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      name: "Площадка Олимп",
      address: "Приморский бульвар, 49",
      lat: 53.5188,
      lon: 49.2344,
    });
  });

  it("rejects files without valid named points", () => {
    expect(() =>
      parseCourtImport(
        "Название;Широта;Долгота\nТочка;не число;49.2",
        "courts.csv",
      ),
    ).toThrow("Не найдено точек");
  });
});
