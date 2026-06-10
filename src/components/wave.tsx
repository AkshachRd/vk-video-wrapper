import { cn } from "@/lib/utils";

// Декоративный волнистый разделитель «Змейки 2»: две встречные синусоиды
// (mono.css .wave). Чисто декоративный — скрыт от скринридеров.
export function Wave({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative h-4 w-full animate-wave-a bg-(image:--wave-a) bg-position-[0px_50%] bg-size-[60px_16px] bg-repeat-x motion-reduce:animate-none",
        "after:absolute after:inset-0 after:animate-wave-b after:bg-(image:--wave-b) after:bg-position-[0px_50%] after:bg-size-[84px_16px] after:bg-repeat-x after:opacity-70 after:content-[''] motion-reduce:after:animate-none",
        className,
      )}
    />
  );
}
