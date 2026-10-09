"use client";

import { cn } from "@/lib/utils";
import { AnimatedGridPattern } from "@/components/ui/shadcn-io/animated-grid-pattern";

/** Soft colour glow and a slowly animated grid behind every page */
const AnimatedGrid = ({ className = "" }: { className?: string }) => {
  return (
    <div className={cn("pointer-events-none overflow-hidden bg-background", className)} aria-hidden>
      <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl dark:bg-primary/25" />
      <div className="absolute top-40 -right-40 h-[400px] w-[500px] rounded-full bg-fuchsia-500/10 blur-3xl dark:bg-fuchsia-500/15" />
      <AnimatedGridPattern
        numSquares={60}
        maxOpacity={0.1}
        duration={3}
        repeatDelay={1}
        className={cn(
          "[mask-image:radial-gradient(900px_circle_at_top,white,transparent)]",
          "inset-x-0 inset-y-[-30%] h-[200%] skew-y-12"
        )}
      />
    </div>
  );
};

export default AnimatedGrid;
