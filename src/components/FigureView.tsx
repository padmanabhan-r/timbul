import { memo } from "react";
import type { Sheet } from "../lib/tactile";
import type { SavedFigure, Lang } from "../lib/types";

interface Props {
  saved: SavedFigure;
  sheet: Sheet;
  focusId?: string | null;
  onPick?: (id: string) => void;
  showOriginal?: boolean;
  /** 0 to 1: how much of the sheet has fed out of the embosser (top to bottom). */
  reveal?: number;
  lang?: Lang;
  ink?: boolean;
  className?: string;
}

/** The tactile sheet drawn on screen exactly as it will print: every line a row of raised dots. */
function FigureViewImpl({ saved, sheet, focusId, onPick, showOriginal, reveal = 1, lang = "en", ink = true, className }: Props) {
  const [bx0, by0, bx1, by1] = saved.figure.figure_box?.length === 4 ? saved.figure.figure_box : [0, 0, 1000, 1000];
  const imgW = (sheet.draw.w * 1000) / Math.max(1, bx1 - bx0);
  const imgH = (sheet.draw.h * 1000) / Math.max(1, by1 - by0);
  const clipH = sheet.h * Math.max(0, Math.min(1, reveal));
  const clipId = `feed-${saved.id}`;
  const focused = sheet.parts.find((p) => p.part.id === focusId);
  const drawArea = sheet.draw.w * sheet.draw.h;

  return (
    <svg className={`figure-svg ${className || ""}`} viewBox={`0 0 ${sheet.w} ${sheet.h}`} role="img" aria-label={lang === "id" ? saved.figure.title_id : saved.figure.title_en}>
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={sheet.w} height={clipH} />
        </clipPath>
      </defs>
      <g clipPath={reveal < 1 ? `url(#${clipId})` : undefined}>
        {showOriginal && (
          <image className="original" href={saved.image} x={sheet.draw.x - (bx0 / 1000) * imgW} y={sheet.draw.y - (by0 / 1000) * imgH} width={imgW} height={imgH} preserveAspectRatio="none" />
        )}

        {/* braille title along the top, as on a real tactile sheet */}
        <g className="braille">{sheet.title.dots.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.72} />)}</g>

        {sheet.links.map((l, i) => (
          <g key={"l" + i}>{l.dots.map((p, j) => <circle key={j} className="dot" cx={p[0]} cy={p[1]} r={sheet.dotR} />)}</g>
        ))}

        {sheet.parts.map((sp) => {
          const isFocus = sp.part.id === focusId;
          const [x0, y0, x1, y1] = sp.box;
          const big = (x1 - x0) * (y1 - y0) > drawArea * 0.12;
          return (
            <g key={sp.part.id} className={`part ${isFocus ? "focused" : ""} ${big ? "big" : ""}`} onClick={onPick ? () => onPick(sp.part.id) : undefined}>
              {isFocus && !big && <ellipse className="focus-plate" cx={(x0 + x1) / 2} cy={(y0 + y1) / 2} rx={(x1 - x0) / 2 + 4.5} ry={(y1 - y0) / 2 + 4.5} />}
              {onPick && <rect className="hit" x={x0 - 2} y={y0 - 2} width={x1 - x0 + 4} height={y1 - y0 + 4} />}
              {sp.fill.map((p, j) => <circle key={"f" + j} className="fill-dot dot" cx={p[0]} cy={p[1]} r={0.5} />)}
              {sp.dots.map((p, j) => <circle key={j} className="dot" cx={p[0]} cy={p[1]} r={isFocus && big ? sheet.dotR * 1.45 : sheet.dotR} />)}
            </g>
          );
        })}

        {sheet.labels.map((l) => {
          const isFocus = l.partId === focusId;
          const part = sheet.parts.find((p) => p.part.id === l.partId)?.part;
          const name = part ? (lang === "id" ? part.name_id : part.name_en).toLowerCase() : l.text;
          return (
            <g key={"b" + l.partId} onClick={onPick ? () => onPick(l.partId) : undefined} className="part">
              <g className="braille">{l.dots.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.72} />)}</g>
              {ink && (
                <text className={`label-ink ${isFocus ? "focused" : ""}`} x={l.x} y={l.y - 2.2}>
                  {l.key ? `${l.key} ${name}` : name}
                </text>
              )}
            </g>
          );
        })}

        {sheet.keyList.map((k) => (
          <g key={"k" + k.key}>
            <g className="braille">{k.dots.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={0.72} />)}</g>
            {ink && <text className="label-ink" x={k.x} y={k.y - 2.2}>{`${k.key}  ${k.text}`}</text>}
          </g>
        ))}
      </g>
      {focused && <title>{lang === "id" ? focused.part.name_id : focused.part.name_en}</title>}
    </svg>
  );
}

export const FigureView = memo(FigureViewImpl);
