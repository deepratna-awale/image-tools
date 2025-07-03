"use client";

import { cn } from "@/lib/utils";
import { AnimatedGridPattern } from "@/components/ui/shadcn-io/animated-grid-pattern";

const AnimatedGrid = ({ className = "" }: { className?: string }) => {
  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border bg-background p-20",
        className
      )}
    >
      <AnimatedGridPattern
        numSquares={100}
        maxOpacity={0.1}
        duration={3}
        repeatDelay={1}
        className={cn(
          "[mask-image:radial-gradient(500px_circle_at_center,white,transparent)]",
          "inset-x-0 inset-y-[-30%] h-[200%] skew-y-12"
        )}
      />
    </div>
  );
};

export default AnimatedGrid;
