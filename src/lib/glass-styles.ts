import { cn } from "@/lib/utils";

export const glassStyles = {
  // Base glass effect
  base: "backdrop-blur-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-white/10",
  
  // Enhanced glass with shadow
  enhanced: "backdrop-blur-2xl bg-white/15 dark:bg-black/15 border border-white/25 dark:border-white/15 shadow-2xl shadow-black/10",
  
  // Subtle glass
  subtle: "backdrop-blur-md bg-white/5 dark:bg-black/5 border border-white/10 dark:border-white/5",
  
  // Frosted glass
  frosted: "backdrop-blur-3xl bg-white/20 dark:bg-black/20 border border-white/30 dark:border-white/20",
  
  // Liquid glass with distortion-like appearance
  liquid: "backdrop-blur-2xl bg-gradient-to-br from-white/20 via-white/10 to-transparent dark:from-black/20 dark:via-black/10 border border-white/30 dark:border-white/20 shadow-2xl",
  
  // Glass with inner shadow for depth
  depth: "backdrop-blur-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-white/10 shadow-2xl shadow-inner",
};

export const glassEffects = {
  // Hover effect for interactive elements
  hover: "transition-all duration-300 hover:bg-white/20 dark:hover:bg-black/20 hover:backdrop-blur-2xl hover:border-white/30 dark:hover:border-white/20",
  
  // Active/pressed effect
  active: "active:scale-[0.98] active:bg-white/25 dark:active:bg-black/25",
  
  // Glow effect
  glow: "shadow-[0_0_30px_rgba(255,255,255,0.15)] dark:shadow-[0_0_30px_rgba(255,255,255,0.1)]",
  
  // Refraction effect simulation
  refraction: "before:absolute before:inset-0 before:bg-gradient-to-tr before:from-transparent before:via-white/10 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-500",
};

export const glassPanel = cn(
  glassStyles.enhanced,
  "rounded-2xl",
  "relative overflow-hidden",
  "before:absolute before:inset-0",
  "before:bg-gradient-to-br before:from-white/5 before:to-transparent",
  "after:absolute after:inset-0",
  "after:bg-gradient-to-tr after:from-transparent after:via-white/5 after:to-transparent"
);

export const glassButton = cn(
  glassStyles.base,
  glassEffects.hover,
  glassEffects.active,
  "rounded-xl px-4 py-2",
  "relative overflow-hidden"
);

export const glassCard = cn(
  glassStyles.liquid,
  "rounded-2xl p-6",
  "relative",
  "before:absolute before:inset-0 before:rounded-2xl",
  "before:bg-gradient-to-br before:from-white/10 before:to-transparent before:opacity-50"
);

export const glassInput = cn(
  glassStyles.subtle,
  "rounded-lg px-3 py-2",
  "focus:bg-white/15 dark:focus:bg-black/15",
  "focus:backdrop-blur-2xl",
  "focus:border-white/40 dark:focus:border-white/30",
  "transition-all duration-200"
);

// Animated glass shimmer effect
export const glassShimmer = cn(
  "relative overflow-hidden",
  "after:absolute after:inset-0",
  "after:translate-x-[-100%]",
  "after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent",
  "hover:after:animate-[shimmer_1.5s_ease-in-out]"
);

// CSS for shimmer animation (add to global CSS)
export const shimmerKeyframes = `
  @keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;