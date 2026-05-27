import * as React from "react";
import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="alert"
      className={cn("rounded-md border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100", className)}
      {...props}
    />
  );
}
