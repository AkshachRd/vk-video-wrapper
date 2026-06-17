import { Minus, Plus, RotateCcw } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { cn } from "@/lib/utils";

type GraphCanvasProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  noResultQuery: string | null;
  isTouch: boolean;
  card?: ReactNode;
  className?: string;
};

export function GraphCanvas({
  canvasRef,
  containerRef,
  onZoomIn,
  onZoomOut,
  onReset,
  noResultQuery,
  isTouch,
  card,
  className,
}: GraphCanvasProps) {
  return (
    <div
      ref={containerRef}
      className={cn(
        "relative min-h-[520px] flex-1 overflow-hidden rounded-card border border-line bg-paper",
        className,
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 touch-none [cursor:grab] [&.grabbing]:cursor-grabbing [&.hovering]:cursor-pointer" />

      {/* легенда */}
      <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-3 rounded-full bg-paper/85 px-3 py-1.5 text-[13px] text-ink-2 backdrop-blur">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink" /> тег
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-[11px] w-[11px] rounded-full border-[1.5px] border-ink bg-paper" /> слово
        </span>
      </div>

      {/* подсказка по управлению */}
      <div className="pointer-events-none absolute top-3 right-3 text-right font-mono text-[10px] leading-[1.6] tracking-[0.04em] text-ink-3">
        {isTouch ? (
          <>
            <div>щипок — зум</div>
            <div>тяни — двигать</div>
            <div>тап — открыть</div>
          </>
        ) : (
          <>
            <div>колесо — зум</div>
            <div>тяни узел — двигать</div>
            <div>клик — открыть</div>
          </>
        )}
      </div>

      {/* зум */}
      <div className="absolute bottom-3 left-3 flex flex-col overflow-hidden rounded-[14px] border border-line bg-paper">
        <button type="button" aria-label="Приблизить" onClick={onZoomIn} className="flex h-[38px] w-[38px] items-center justify-center text-ink transition-colors hover:bg-ink hover:text-paper">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Отдалить" onClick={onZoomOut} className="flex h-[38px] w-[38px] items-center justify-center border-t border-line text-ink transition-colors hover:bg-ink hover:text-paper">
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Сбросить" onClick={onReset} className="flex h-[38px] w-[38px] items-center justify-center border-t border-line text-ink transition-colors hover:bg-ink hover:text-paper">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* нет результатов */}
      {noResultQuery ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
          <div className="text-[17px] font-medium text-ink-2">Пусто</div>
          <div className="text-[13px] text-ink-3">по запросу «{noResultQuery}» ничего не найдено</div>
        </div>
      ) : null}

      {/* карточка */}
      {card ? <div className="absolute right-3 bottom-3">{card}</div> : null}
    </div>
  );
}
