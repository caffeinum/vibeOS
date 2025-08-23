"use client";

import React from "react";
import { cn } from "@/lib/utils";

// Types
interface GlassEffectProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  href?: string;
  target?: string;
}

interface DockIcon {
  icon: React.ReactNode;
  alt: string;
  onClick?: () => void;
}

// Glass Effect Wrapper Component
export const GlassEffect: React.FC<GlassEffectProps> = ({
  children,
  className = "",
  style = {},
  href,
  target = "_blank",
}) => {
  const glassStyle = {
    boxShadow: "0 6px 6px rgba(0, 0, 0, 0.2), 0 0 20px rgba(0, 0, 0, 0.1)",
    transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
    ...style,
  };

  // Check if rounded-none is in the className to override default rounding
  const isRoundedNone = className.includes("rounded-none");
  const roundedClass = isRoundedNone ? "" : "rounded-3xl";

  const content = (
    <div
      className={cn(
        "relative font-semibold overflow-hidden text-black cursor-pointer transition-all duration-700",
        className
      )}
      style={glassStyle}
    >
      {/* Glass Layers */}
      <div
        className={cn("absolute inset-0 z-0 overflow-hidden rounded-inherit", roundedClass)}
        style={{
          backdropFilter: "blur(3px)",
          filter: "url(#glass-distortion)",
          isolation: "isolate",
        }}
      />
      <div
        className="absolute inset-0 z-10 rounded-inherit"
        style={{ background: "rgba(255, 255, 255, 0.25)" }}
      />
      <div
        className={cn("absolute inset-0 z-20 rounded-inherit overflow-hidden", roundedClass)}
        style={{
          boxShadow:
            "inset 2px 2px 1px 0 rgba(255, 255, 255, 0.5), inset -1px -1px 1px 1px rgba(255, 255, 255, 0.5)",
        }}
      />

      {/* Content */}
      <div className="relative z-30 w-full h-full">{children}</div>
    </div>
  );

  return href ? (
    <a href={href} target={target} rel="noopener noreferrer" className="block">
      {content}
    </a>
  ) : (
    content
  );
};

// Dock Component
export const GlassDock: React.FC<{ icons: DockIcon[]; className?: string }> = ({
  icons,
  className
}) => (
  <GlassEffect
    className={cn("rounded-3xl p-3 hover:p-4 hover:rounded-4xl", className)}
  >
    <div className="flex items-center justify-center gap-2 rounded-3xl p-3 py-0 px-0.5 overflow-hidden">
      {icons.map((icon, index) => (
        <div
          key={index}
          className="w-16 h-16 transition-all duration-700 hover:scale-110 cursor-pointer flex items-center justify-center"
          style={{
            transformOrigin: "center center",
            transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
          }}
          onClick={icon.onClick}
        >
          {icon.icon}
        </div>
      ))}
    </div>
  </GlassEffect>
);

// Button Component
export const GlassButton: React.FC<{ 
  children: React.ReactNode; 
  href?: string;
  onClick?: () => void;
  className?: string;
}> = ({
  children,
  href,
  onClick,
  className
}) => (
  <GlassEffect
    href={href}
    className={cn(
      "rounded-3xl px-10 py-6 hover:px-11 hover:py-7 hover:rounded-4xl overflow-hidden",
      className
    )}
  >
    <div
      className="transition-all duration-700 hover:scale-95"
      style={{
        transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 2.2)",
      }}
      onClick={onClick}
    >
      {children}
    </div>
  </GlassEffect>
);

// Window Component
export const GlassWindow: React.FC<{
  children: React.ReactNode;
  title?: string;
  onClose?: () => void;
  className?: string;
}> = ({ children, title, onClose, className }) => (
  <GlassEffect className={cn("rounded-2xl overflow-hidden", className)}>
    {title && (
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/20">
        <div className="flex items-center gap-2">
          <button 
            onClick={onClose} 
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors" 
          />
          <button className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors" />
          <button className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors" />
        </div>
        <span className="text-sm font-medium text-white/90">{title}</span>
        <div className="w-12" />
      </div>
    )}
    <div className="p-4">{children}</div>
  </GlassEffect>
);

// SVG Filter Component
export const GlassFilter: React.FC = () => (
  <svg style={{ display: "none" }}>
    <filter
      id="glass-distortion"
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      filterUnits="objectBoundingBox"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.001 0.005"
        numOctaves="1"
        seed="17"
        result="turbulence"
      />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
        <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
        <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
      </feComponentTransfer>
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feSpecularLighting
        in="softMap"
        surfaceScale="5"
        specularConstant="1"
        specularExponent="100"
        lightingColor="white"
        result="specLight"
      >
        <fePointLight x="-200" y="-200" z="300" />
      </feSpecularLighting>
      <feComposite
        in="specLight"
        operator="arithmetic"
        k1="0"
        k2="1"
        k3="1"
        k4="0"
        result="litImage"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="softMap"
        scale="200"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>
  </svg>
);