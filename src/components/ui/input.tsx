import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30",
        className,
      )}
      {...props}
    />
  );
}
