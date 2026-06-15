import type { ReactNode } from "react";

type BottomSheetProps = {
  label: string;
  onClose: () => void;
  children: ReactNode;
};

// Нижняя шторка portrait (mobile.css .m-sheet-back/.m-sheet/.m-grab): затемнение
// с закрытием по тапу, выезжающий снизу лист со скруглённым верхом и ручкой.
export function BottomSheet({ label, onClose, children }: BottomSheetProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Закрыть"
        data-testid="sheet-backdrop"
        onClick={onClose}
        className="absolute inset-0 z-40 animate-backin bg-[rgba(10,10,10,0.32)]"
      />
      <div
        role="dialog"
        aria-label={label}
        className="absolute inset-x-0 bottom-0 z-[41] flex max-h-[86%] animate-sheetup flex-col rounded-t-[28px] bg-paper pb-[34px] shadow-[0_-16px_50px_-12px_rgba(0,0,0,0.4)]"
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 mb-1 h-[5px] w-10 shrink-0 rounded-full bg-line-2" />
        <div className="overflow-y-auto [scrollbar-width:none]">{children}</div>
      </div>
    </>
  );
}
