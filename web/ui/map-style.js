// Estilo do mapa nas cores das telas de referência: fundo creme, água azul viva, parques verdes e ruas brancas.
// Os dados vêm do OpenFreeMap (mapas vetoriais do OpenStreetMap, gratuitos e sem chave).

const COLORS = {
  land: "#f8f3ea",
  residential: "#f4eee2",
  green: "#cdeab2",
  greenDeep: "#b6df98",
  water: "#7fc8f2",
  waterLabel: "#2f78c4",
  road: "#ffffff",
  roadMajor: "#fff8e6",
  casing: "#e8dfcf",
  building: "#ece4d5",
  label: "#4a4f6e",
  place: "#0d1236",
};

const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> ' +
  'Dados do <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

const MAJOR = ["motorway", "trunk", "primary", "secondary"];
const MINOR = ["tertiary", "minor", "service"];
// Largura por zoom (cresce de forma exponencial, como a escala do mapa). O zoom tem de ficar na expressão de fora.
const width = (stops) => ["interpolate", ["exponential", 1.6], ["zoom"], ...stops.flat()];
// [zoom, largura das avenidas, largura das ruas]
const roadWidth = (stops) =>
  width(stops.map(([zoom, major, minor]) => [zoom, ["match", ["get", "class"], MAJOR, major, minor]]));

/** Estilo do mapa. Os nomes em "hide" (marcos que o app desenha por cima) não são repetidos pelo mapa. */
export function mapStyle({ hide = [] } = {}) {
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: ATTRIBUTION },
    },
    layers: [
      { id: "fundo", type: "background", paint: { "background-color": COLORS.land } },
      {
        id: "bairros",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood"]]],
        paint: { "fill-color": COLORS.residential },
      },
      {
        id: "verde",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["grass", "wood", "farmland", "wetland"]]],
        paint: { "fill-color": ["match", ["get", "class"], "wood", COLORS.greenDeep, COLORS.green] },
      },
      {
        id: "areas-verdes",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        filter: ["in", ["get", "class"], ["literal", ["pitch", "stadium", "cemetery", "playground", "garden"]]],
        paint: { "fill-color": COLORS.green, "fill-opacity": 0.8 },
      },
      {
        id: "parques",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "fill-color": COLORS.green },
      },
      {
        id: "agua",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": COLORS.water },
      },
      {
        id: "rios",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        paint: {
          "line-color": COLORS.water,
          "line-width": width([
            [10, 1],
            [16, 4],
          ]),
        },
      },
      {
        id: "predios",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": COLORS.building, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.7] },
      },
      {
        id: "ruas-borda",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", [...MAJOR, ...MINOR]]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": COLORS.casing,
          "line-width": roadWidth([
            [10, 1.5, 0],
            [12, 3, 0.8],
            [18, 30, 18],
          ]),
        },
      },
      {
        id: "ruas",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", [...MAJOR, ...MINOR]]],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": ["match", ["get", "class"], MAJOR, COLORS.roadMajor, COLORS.road],
          "line-width": roadWidth([
            [10, 1, 0],
            [12, 2.2, 0.5],
            [18, 26, 15],
          ]),
        },
      },
      {
        id: "nome-agua",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "water_name",
        layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 13, "text-letter-spacing": 0.1 },
        paint: { "text-color": COLORS.waterLabel, "text-halo-color": "rgba(255,255,255,0.6)", "text-halo-width": 1 },
      },
      {
        id: "nome-ruas",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": FONT,
          "text-size": 11,
        },
        paint: { "text-color": COLORS.label, "text-halo-color": "#fff", "text-halo-width": 1.5 },
      },
      {
        id: "nome-bairros",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 12,
        filter: [
          "all",
          ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter"]]],
          ["!", ["in", ["get", "name"], ["literal", hide]]],
        ],
        layout: {
          "text-field": ["get", "name"],
          "text-font": FONT_BOLD,
          "text-size": 12,
          "text-max-width": 7,
          "text-padding": 12,
        },
        paint: { "text-color": COLORS.place, "text-opacity": 0.55, "text-halo-color": "#fff", "text-halo-width": 1.5 },
      },
    ],
  };
}
