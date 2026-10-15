import type { Figure, SavedFigure } from "../lib/types";
import circuit from "./series-circuit.json";

// The plant cell is the figure a teacher adds in the walkthrough, so it is not a sample.
// Figures read by Gemini ahead of time (scripts/make-samples.mjs), so the library works on first open.
export const SAMPLES: SavedFigure[] = [
  { id: "sample-series-circuit", createdAt: 0, sample: true, number: 1, image: "/samples/series-circuit-page.jpg", imageW: 984, imageH: 609, figure: circuit as unknown as Figure,
    source: "Drawn by the Timbul team for this demo" },
];
