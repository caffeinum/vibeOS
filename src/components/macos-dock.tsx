"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { GlassEffect } from "@/components/ui/glass-effect";

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
      className="fixed bottom-0 left-1/2 -translate-x-1/2 mb-4 z-50 overflow-visible"
    >
      <div className="relative">
        {/* Background with proper clipping */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 backdrop-blur-md bg-white/20" />
          <div className="absolute inset-0 bg-white/25" />
          <div className="absolute inset-0 rounded-2xl" style={{
            boxShadow: "inset 2px 2px 1px 0 rgba(255, 255, 255, 0.5), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.5)"
          }} />
        </div>
        
        {/* Content that can overflow */}
        <div className="relative flex items-end gap-2 px-3 py-2 overflow-visible">
          {items.map((item, index) => (
            <DockIcon
              key={item.id}
              item={item}
              mouseX={mouseX}
              isActive={activeItem === item.id}
              onHoverStart={() => setHoveredIndex(index)}
              onHoverEnd={() => setHoveredIndex(null)}
              onClick={() => onItemClick(item)}
              isHovered={hoveredIndex === index}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

interface DockIconProps {
  item: DockItem;
  mouseX: any;
  isActive: boolean;
  isHovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onClick: () => void;
}

function DockIcon({
  item,
  mouseX,
  isActive,
  isHovered,
  onHoverStart,
  onHoverEnd,
  onClick,
}: DockIconProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const distance = useTransform(mouseX, (val: number) => {
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