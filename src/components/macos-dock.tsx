"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface DockItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  color?: string;
}

interface MacOSDockProps {
  items: DockItem[];
  activeItem?: string | null;
  onItemClick: (item: DockItem) => void;
}

export function MacOSDock({ items, activeItem, onItemClick }: MacOSDockProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className="fixed bottom-0 left-1/2 -translate-x-1/2 mb-4 z-50"
    >
      <div className="flex items-end gap-2 px-3 py-2 backdrop-blur-3xl bg-gradient-to-b from-white/25 to-white/10 dark:from-black/25 dark:to-black/10 rounded-2xl border border-white/30 dark:border-white/20 shadow-2xl shadow-black/20 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-tr before:from-transparent before:via-white/10 before:to-transparent before:opacity-50">
        {items.map((item, index) => (
          <DockIcon
            key={item.id}
            item={item}
            index={index}
            mouseX={mouseX}
            isActive={activeItem === item.id}
            onHoverStart={() => setHoveredIndex(index)}
            onHoverEnd={() => setHoveredIndex(null)}
            onClick={() => onItemClick(item)}
            isHovered={hoveredIndex === index}
          />
        ))}
      </div>
    </motion.div>
  );
}

interface DockIconProps {
  item: DockItem;
  index: number;
  mouseX: any;
  isActive: boolean;
  isHovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onClick: () => void;
}

function DockIcon({
  item,
  index,
  mouseX,
  isActive,
  isHovered,
  onHoverStart,
  onHoverEnd,
  onClick,
}: DockIconProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthSync = useTransform(distance, [-200, 0, 200], [48, 80, 48]);
  const width = useSpring(widthSync, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const scaleSync = useTransform(distance, [-200, 0, 200], [1, 1.4, 1]);
  const scale = useSpring(scaleSync, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  const ySync = useTransform(distance, [-200, 0, 200], [0, -20, 0]);
  const y = useSpring(ySync, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  });

  return (
    <motion.button
      ref={ref}
      style={{ width, scale, y }}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      onClick={onClick}
      className="relative flex items-center justify-center aspect-square"
    >
      {/* Icon Container */}
      <motion.div
        className="w-full h-full flex items-center justify-center relative"
        whileTap={{ scale: 0.95 }}
      >
        {/* Icon */}
        <div className="relative w-full h-full">
          {item.icon}
        </div>
      </motion.div>

      {/* Tooltip */}
      <motion.div
        initial={{ opacity: 0, y: 0 }}
        animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? -8 : 0 }}
        transition={{ duration: 0.2 }}
        className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900/90 text-white text-xs rounded-md whitespace-nowrap pointer-events-none"
      >
        {item.name}
      </motion.div>

      {/* Active indicator */}
      {isActive && (
        <motion.div
          layoutId="activeIndicator"
          className="absolute -bottom-1 w-1 h-1 bg-white rounded-full"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
        />
      )}
    </motion.button>
  );
}