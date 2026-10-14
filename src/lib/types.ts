export type Lang = "en" | "id";

export type Shape = "rect" | "ellipse" | "polygon" | "battery" | "lamp" | "switch_open" | "switch_closed" | "resistor" | "cell";

export interface Part {
  id: string;
  name_en: string;
  name_id: string;
  label: string;
  kind: "component" | "region" | "object";
  shape: Shape;
  box: [number, number, number, number];
  outline?: [number, number][];
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
  /** Where a sample came from, for attribution. */
  source?: string;
}
