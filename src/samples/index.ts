import type { Figure, SavedFigure } from "../lib/types";
import circuit from "./series-circuit.json";

// The plant cell is the figure a teacher adds in the walkthrough, so it is not a sample.
// Figures read by Gemini ahead of time (scripts/make-samples.mjs), so the library works on first open.
export const SAMPLES: SavedFigure[] = [
  { id: "sample-series-circuit", createdAt: 0, sample: true, number: 1, image: "/samples/series-circuit.jpg", imageW: 481, imageH: 301, figure: circuit as unknown as Figure,
    source: "“Basic series circuit” from Wikimedia Commons, CC BY 4.0" },
];
