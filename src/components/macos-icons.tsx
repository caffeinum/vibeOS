"use client";

export const FinderIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="finderGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#69CDFF" />
          <stop offset="100%" stopColor="#1B6EC2" />
        </linearGradient>
        <linearGradient id="finderFace" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D1D1D1" />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="80" height="80" rx="18" fill="url(#finderGradient)" />
      {/* Face */}
      <rect x="25" y="25" width="50" height="50" rx="10" fill="url(#finderFace)" />
      {/* Eyes */}
      <circle cx="35" cy="40" r="4" fill="#1B6EC2" />
      <circle cx="65" cy="40" r="4" fill="#1B6EC2" />
      {/* Smile */}
      <path d="M 35 55 Q 50 65 65 55" stroke="#1B6EC2" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  </div>
);

export const SafariIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="safariGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#00D4FF" />
          <stop offset="50%" stopColor="#0099FF" />
          <stop offset="100%" stopColor="#0066FF" />
        </linearGradient>
        <radialGradient id="safariCompass">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0E0E0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="40" fill="url(#safariGradient)" />
      <circle cx="50" cy="50" r="35" fill="url(#safariCompass)" />
      {/* Compass needle */}
      <g transform="translate(50,50)">
        <path d="M 0,-25 L 8,15 L 0,10 L -8,15 Z" fill="#FF3B30" transform="rotate(45)" />
        <path d="M 0,-25 L 8,15 L 0,10 L -8,15 Z" fill="#FFFFFF" transform="rotate(225)" />
        <circle cx="0" cy="0" r="3" fill="#333333" />
      </g>
      {/* Tick marks */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle) => (
        <line
          key={angle}
          x1="50"
          y1="18"
          x2="50"
          y2="22"
          stroke="#666"
          strokeWidth="1"
          transform={`rotate(${angle} 50 50)`}
        />
      ))}
    </svg>
  </div>
);

export const MessagesIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="messagesGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#66D976" />
          <stop offset="100%" stopColor="#35C759" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="45" rx="38" ry="30" fill="url(#messagesGradient)" />
      <path d="M 30 60 Q 35 75 25 85 Q 35 70 40 65" fill="url(#messagesGradient)" />
      {/* Three dots */}
      <circle cx="30" cy="45" r="4" fill="white" opacity="0.9" />
      <circle cx="50" cy="45" r="4" fill="white" opacity="0.9" />
      <circle cx="70" cy="45" r="4" fill="white" opacity="0.9" />
    </svg>
  </div>
);

export const TerminalIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="terminalGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#434343" />
          <stop offset="100%" stopColor="#1C1C1C" />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="80" height="80" rx="15" fill="url(#terminalGradient)" />
      <rect x="15" y="15" width="70" height="70" rx="10" fill="#000000" />
      {/* Terminal text */}
      <text x="20" y="35" fill="#00FF00" fontSize="12" fontFamily="monospace">$&gt;</text>
      <rect x="35" y="28" width="15" height="2" fill="#00FF00" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0;0.8" dur="1s" repeatCount="indefinite" />
      </rect>
      <text x="20" y="50" fill="#00FF00" fontSize="10" fontFamily="monospace" opacity="0.6">~/code</text>
      <text x="20" y="65" fill="#00FF00" fontSize="10" fontFamily="monospace" opacity="0.4">git status</text>
    </svg>
  </div>
);

export const SystemPreferencesIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="prefsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8E8E93" />
          <stop offset="100%" stopColor="#636366" />
        </linearGradient>
        <radialGradient id="gearCenter">
          <stop offset="0%" stopColor="#D1D1D6" />
          <stop offset="100%" stopColor="#8E8E93" />
        </radialGradient>
      </defs>
      <rect x="10" y="10" width="80" height="80" rx="18" fill="url(#prefsGradient)" />
      {/* Gear */}
      <g transform="translate(50,50)">
        <path d="
          M -5,-20 L 5,-20 L 5,-15 
          L 10,-12 L 15,-17 L 20,-12 L 15,-7 L 12,-2
          L 20,-5 L 20,5 L 15,5 L 12,2
          L 15,7 L 20,12 L 15,17 L 10,12 L 5,15
          L 5,20 L -5,20 L -5,15
          L -10,12 L -15,17 L -20,12 L -15,7 L -12,2
          L -20,5 L -20,-5 L -15,-5 L -12,-2
          L -15,-7 L -20,-12 L -15,-17 L -10,-12 L -5,-15
          Z
        " fill="url(#gearCenter)" />
        <circle cx="0" cy="0" r="8" fill="#636366" />
        <circle cx="0" cy="0" r="5" fill="#8E8E93" />
      </g>
    </svg>
  </div>
);

export const DownloadsIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="downloadsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#007AFF" />
          <stop offset="100%" stopColor="#0051D5" />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="80" height="80" rx="18" fill="url(#downloadsGradient)" />
      {/* Download arrow */}
      <g transform="translate(50,50)">
        <rect x="-4" y="-20" width="8" height="25" fill="white" />
        <path d="M -12,5 L 0,17 L 12,5" stroke="white" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  </div>
);

export const CloudIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D1D1D6" />
        </linearGradient>
        <linearGradient id="cloudBg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5AC8FA" />
          <stop offset="100%" stopColor="#007AFF" />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="80" height="80" rx="18" fill="url(#cloudBg)" />
      {/* Cloud shape */}
      <g transform="translate(50,52)">
        <ellipse cx="-10" cy="0" rx="12" ry="10" fill="url(#cloudGradient)" />
        <ellipse cx="10" cy="0" rx="12" ry="10" fill="url(#cloudGradient)" />
        <ellipse cx="0" cy="-5" rx="15" ry="12" fill="url(#cloudGradient)" />
        <rect x="-10" y="-2" width="20" height="10" fill="url(#cloudGradient)" />
      </g>
    </svg>
  </div>
);

export const DedalusIcon = () => (
  <div className="w-full h-full relative">
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <defs>
        <linearGradient id="dedalusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9333EA" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="dedalusShine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="10" y="10" width="80" height="80" rx="18" fill="url(#dedalusGradient)" />
      <rect x="10" y="10" width="80" height="40" rx="18" fill="url(#dedalusShine)" />
      
      {/* sparkles/ai effect */}
      <g transform="translate(50,50)">
        {/* center star */}
        <path d="M 0,-20 L 4,-4 L 20,0 L 4,4 L 0,20 L -4,4 L -20,0 L -4,-4 Z" 
              fill="white" opacity="0.9" />
        {/* smaller stars */}
        <g transform="translate(-15,-10)">
          <path d="M 0,-8 L 2,-2 L 8,0 L 2,2 L 0,8 L -2,2 L -8,0 L -2,-2 Z" 
                fill="white" opacity="0.7" />
        </g>
        <g transform="translate(18,12)">
          <path d="M 0,-6 L 1.5,-1.5 L 6,0 L 1.5,1.5 L 0,6 L -1.5,1.5 L -6,0 L -1.5,-1.5 Z" 
                fill="white" opacity="0.6" />
        </g>
      </g>
    </svg>
  </div>
);