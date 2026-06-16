import type { ReactNode } from "react";

type SidePanelProps = {
  label: string;
  onClose: () => void;
  children: ReactNode;
};

// Боковая панель landscape (landscape.css .pl-back/.pl-panel): выезжает справа,
// со скруглённым левым краем; затемнение закрывает по тапу. Внутренности — те же
// sheet-bodies, что и в portrait. В landscape шторки снизу закрыли бы видео.
export function SidePanel({ label, onClose, children }: SidePanelProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Закрыть"
        data-testid="panel-backdrop"
        onClick={onClose}
        className="absolute inset-0 z-40 animate-backin bg-[rgba(10,10,10,0.32)]"
      />
      <div
        role="dialog"
        aria-label={label}
        className="absolute inset-y-0 right-0 z-[41] flex w-[350px] max-w-[88%] animate-panelin flex-col rounded-l-[28px] bg-paper py-2.5 shadow-[-16px_0_50px_-12px_rgba(0,0,0,0.4)]"
      >
        <div className="overflow-y-auto [scrollbar-width:none]">{children}</div>
      </div>
    </>
  );
}
