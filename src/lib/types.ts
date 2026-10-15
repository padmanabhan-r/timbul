export type Lang = "en" | "id";

export type Shape = "rect" | "ellipse" | "polygon" | "group" | "battery" | "lamp" | "switch_open" | "switch_closed" | "resistor" | "cell";

export interface Part {
  id: string;
  name_en: string;
  name_id: string;
  label: string;
  kind: "component" | "region" | "object";
  shape: Shape;
  box: [number, number, number, number];
  outline?: [number, number][];
  /** For a group: how many identical items it holds (the nodes of one neural-network layer, say). */
  count?: number;
  detail_en: string;
  detail_id: string;
}

export interface Link {
  from: string;
  to: string;
  kind: "wire" | "arrow" | "line";
  path: [number, number][];
}

/** What Gemini returns for one page: the figure as structured data. All coordinates are 0-1000 over the whole image. */
export interface Figure {
  found: boolean;
  figure_box: [number, number, number, number];
  title_en: string;
  title_id: string;
  subject: string;
  figure_type: string;
  overview_en: string;
  overview_id: string;
  parts: Part[];
  links: Link[];
  left_out: string[];
  model?: string;
}

export interface SavedFigure {
  id: string;
  createdAt: number;
  sample?: boolean;
  /** The sheet number printed in braille, which the student says to open it. */
  number?: number;
  /** The page as uploaded, downscaled, as a data URL or a path. */
  image: string;
  imageW: number;
  imageH: number;
  figure: Figure;
  /** Gemini's check of its own drawing against the page, before the teacher approves it. */
  review?: Review;
  /** The teacher has looked at the sheet beside the original and approved it for printing. */
  approved?: boolean;
  /** Where a sample came from, for attribution. */
  source?: string;
}

export interface Finding {
  kind: "missing_part" | "misplaced" | "wrong_name" | "missing_link" | "wrong_link" | "extra_part";
  part: string;
  note_en: string;
}

export interface Review {
  /** How many times Gemini compared the drawing with the page. */
  rounds: number;
  /** What it found and corrected, across all rounds. */
  findings: Finding[];
  /** Whether the last comparison found nothing left to fix. */
  matches: boolean;
}
