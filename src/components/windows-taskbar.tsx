"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Search, Wifi, Battery, Volume2, Windows } from "lucide-react";

interface TaskbarItem {
  id: string;
  name: string;
  icon: React.ReactNode;
  color?: string;
}

interface WindowsTaskbarProps {
  items: TaskbarItem[];
  activeItem?: string | null;
  onItemClick: (item: TaskbarItem) => void;
  currentTime: Date;
}

export function WindowsTaskbar({ items, activeItem, onItemClick, currentTime }: WindowsTaskbarProps) {
  const [showStartMenu, setShowStartMenu] = useState(false);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <>
      {/* Start Menu */}
      {showStartMenu && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-12 left-0 z-50 w-80 h-96 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-t-lg shadow-2xl"
        >
          <div className="p-4 h-full flex flex-col">
            {/* User Section */}
            <div className="flex items-center gap-3 pb-3 border-b border-gray-700">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-bold">U</span>
              </div>
              <span className="text-white font-medium">User</span>
            </div>
            
            {/* Apps Grid */}
            <div className="flex-1 py-4">
              <div className="grid grid-cols-3 gap-3">
                {items.slice(0, 9).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onItemClick(item);
                      setShowStartMenu(false);
                    }}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    <div className="w-8 h-8">
                      {item.icon}
                    </div>
                    <span className="text-white text-xs text-center">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Power Options */}
            <div className="flex justify-end pt-3 border-t border-gray-700">
              <button className="p-2 hover:bg-gray-800 rounded">
                <span className="text-white text-sm">⏻</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Taskbar */}
      <div className="fixed bottom-0 left-0 right-0 h-12 bg-gray-900/95 backdrop-blur-md border-t border-gray-700 z-40">
        <div className="h-full flex items-center justify-between px-2">
          {/* Start Button */}
          <button
            onClick={() => setShowStartMenu(!showStartMenu)}
            className={`flex items-center justify-center w-12 h-8 rounded transition-colors ${
              showStartMenu ? 'bg-gray-700' : 'hover:bg-gray-800'
            }`}
          >
            <Windows className="w-5 h-5 text-blue-400" />
          </button>
          
          {/* Search Bar */}
          <div className="flex items-center bg-gray-800 rounded-full px-3 py-1 ml-2 flex-1 max-w-xs">
            <Search className="w-4 h-4 text-gray-400 mr-2" />
            <input
              type="text"
              placeholder="Type here to search"
              className="bg-transparent text-white text-sm outline-none flex-1"
            />
          </div>
          
          {/* App Icons */}
          <div className="flex items-center gap-1 mx-4">
            {items.slice(0, 8).map((item) => (
              <button
                key={item.id}
                onClick={() => onItemClick(item)}
                className={`flex items-center justify-center w-10 h-8 rounded transition-colors ${
                  activeItem === item.id ? 'bg-gray-700 border-b-2 border-blue-400' : 'hover:bg-gray-800'
                }`}
                title={item.name}
              >
                <div className="w-5 h-5">
                  {item.icon}
                </div>
              </button>
            ))}
          </div>
          
          {/* System Tray */}
          <div className="flex items-center gap-2">
            <button className="p-1 hover:bg-gray-800 rounded">
              <Volume2 className="w-4 h-4 text-gray-300" />
            </button>
            <button className="p-1 hover:bg-gray-800 rounded">
              <Wifi className="w-4 h-4 text-gray-300" />
            </button>
            <button className="p-1 hover:bg-gray-800 rounded">
              <Battery className="w-4 h-4 text-gray-300" />
            </button>
            
            {/* Clock */}
            <div className="text-right text-white text-xs px-2">
              <div>{formatTime(currentTime)}</div>
              <div className="text-gray-400">{formatDate(currentTime)}</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Click outside to close start menu */}
      {showStartMenu && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setShowStartMenu(false)}
        />
      )}
    </>
  );
}