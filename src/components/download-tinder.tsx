"use client";

import { useState } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { api } from "@/utils/api";
import { 
  Trash2, 
  FolderOpen, 
  Download, 
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Code,
  File,
  Undo2,
  X,
  Check
} from "lucide-react";

interface DownloadFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  created: string;
  extension: string;
  isImage: boolean;
}

interface SwipeAction {
  file: DownloadFile;
  action: 'trash' | 'keep';
  timestamp: number;
}

const getFileIcon = (extension: string, size: number = 24) => {
  const iconProps = { size };
  
  const iconMap: Record<string, JSX.Element> = {
    '.jpg': <ImageIcon {...iconProps} className="text-green-500" />,
    '.jpeg': <ImageIcon {...iconProps} className="text-green-500" />,
    '.png': <ImageIcon {...iconProps} className="text-green-500" />,
    '.gif': <ImageIcon {...iconProps} className="text-green-500" />,
    '.webp': <ImageIcon {...iconProps} className="text-green-500" />,
    '.svg': <ImageIcon {...iconProps} className="text-green-500" />,
    '.mp4': <Film {...iconProps} className="text-purple-500" />,
    '.mov': <Film {...iconProps} className="text-purple-500" />,
    '.avi': <Film {...iconProps} className="text-purple-500" />,
    '.mp3': <Music {...iconProps} className="text-pink-500" />,
    '.wav': <Music {...iconProps} className="text-pink-500" />,
    '.txt': <FileText {...iconProps} className="text-gray-500" />,
    '.md': <FileText {...iconProps} className="text-gray-500" />,
    '.pdf': <FileText {...iconProps} className="text-red-500" />,
    '.zip': <Archive {...iconProps} className="text-amber-500" />,
    '.tar': <Archive {...iconProps} className="text-amber-500" />,
    '.gz': <Archive {...iconProps} className="text-amber-500" />,
    '.js': <Code {...iconProps} className="text-yellow-500" />,
    '.ts': <Code {...iconProps} className="text-blue-500" />,
    '.py': <Code {...iconProps} className="text-blue-400" />,
  };
  
  return iconMap[extension] || <File {...iconProps} className="text-gray-400" />;
};

const formatSize = (bytes: number) => {
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
};

function FileCard({ 
  file, 
  onSwipe,
  isTop 
}: { 
  file: DownloadFile; 
  onSwipe: (direction: 'left' | 'right') => void;
  isTop: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-30, 0, 30]);
  const opacity = useTransform(x, [-200, -100, 0, 100, 200], [0.5, 1, 1, 1, 0.5]);
  
  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    const threshold = 100;
    if (Math.abs(info.offset.x) > threshold) {
      const direction = info.offset.x > 0 ? 'right' : 'left';
      onSwipe(direction);
    }
  };

  return (
    <motion.div
      className="absolute w-full h-full cursor-grab active:cursor-grabbing"
      style={{ x, rotate, opacity }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      animate={isTop ? {} : { scale: 0.95 }}
      whileHover={isTop ? { scale: 1.02 } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="relative h-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
        {/* overlay indicators */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-green-500 to-green-400 opacity-0 z-10 flex items-center justify-center"
          style={{ opacity: useTransform(x, [0, 100], [0, 0.8]) }}
        >
          <div className="text-white text-6xl font-bold rotate-12 border-4 border-white rounded-xl px-8 py-4">
            KEEP
          </div>
        </motion.div>
        
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-400 opacity-0 z-10 flex items-center justify-center"
          style={{ opacity: useTransform(x, [-100, 0], [0.8, 0]) }}
        >
          <div className="text-white text-6xl font-bold -rotate-12 border-4 border-white rounded-xl px-8 py-4">
            TRASH
          </div>
        </motion.div>

        {/* card content */}
        <div className="p-8 h-full flex flex-col">
          {/* file icon */}
          <div className="flex justify-center mb-6">
            <div className="w-32 h-32 bg-gray-50 rounded-2xl flex items-center justify-center">
              {file.isImage ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <ImageIcon size={64} className="text-gray-300" />
                  <span className="absolute bottom-2 right-2 text-xs bg-gray-800 text-white px-2 py-1 rounded">
                    {file.extension}
                  </span>
                </div>
              ) : (
                getFileIcon(file.extension, 64)
              )}
            </div>
          </div>

          {/* file name */}
          <h3 className="text-xl font-semibold text-gray-800 text-center mb-2 line-clamp-2">
            {file.name}
          </h3>

          {/* file details */}
          <div className="flex-1 flex flex-col justify-center space-y-3">
            <div className="flex justify-between items-center px-4 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-500">size</span>
              <span className="text-sm font-medium text-gray-700">{formatSize(file.size)}</span>
            </div>
            
            <div className="flex justify-between items-center px-4 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-500">downloaded</span>
              <span className="text-sm font-medium text-gray-700">{formatDate(file.created)}</span>
            </div>
            
            <div className="flex justify-between items-center px-4 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-500">type</span>
              <span className="text-sm font-medium text-gray-700">{file.extension.slice(1).toUpperCase()}</span>
            </div>
          </div>

          {/* action hints */}
          <div className="flex justify-between items-center mt-6 px-4">
            <div className="flex items-center gap-2 text-red-500">
              <Trash2 size={20} />
              <span className="text-sm font-medium">trash</span>
            </div>
            <div className="flex items-center gap-2 text-green-500">
              <span className="text-sm font-medium">keep</span>
              <FolderOpen size={20} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function DownloadTinder() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<SwipeAction[]>([]);
  const [stats, setStats] = useState({ kept: 0, trashed: 0 });

  const { data, isLoading, error } = api.files.getDownloads.useQuery();
  
  const files = data?.files || [];

  const moveToTrashMutation = api.files.moveToTrash.useMutation();
  const moveFileMutation = api.files.moveFile.useMutation();

  const handleSwipe = async (direction: 'left' | 'right') => {
    const currentFile = files[currentIndex];
    if (!currentFile) return;

    const action: SwipeAction = {
      file: currentFile,
      action: direction === 'left' ? 'trash' : 'keep',
      timestamp: Date.now()
    };

    setHistory([...history, action]);

    if (direction === 'left') {
      // move to trash
      setStats(prev => ({ ...prev, trashed: prev.trashed + 1 }));
      await moveToTrashMutation.mutateAsync({ path: currentFile.path });
    } else {
      // move to documents
      setStats(prev => ({ ...prev, kept: prev.kept + 1 }));
      const homePath = '/Users/aleks'; // client-side doesn't have access to process.env.HOME
      const documentsPath = `${homePath}/Documents`;
      await moveFileMutation.mutateAsync({ 
        sourcePath: currentFile.path,
        destinationDir: documentsPath 
      });
    }

    setCurrentIndex(prev => prev + 1);
  };

  const handleUndo = async () => {
    if (history.length === 0) return;

    const lastAction = history[history.length - 1];
    
    // note: undo is complex - would need to restore from trash or move back from documents
    // for now, just remove from history
    setHistory(history.slice(0, -1));
    
    if (lastAction.action === 'trash') {
      setStats(prev => ({ ...prev, trashed: Math.max(0, prev.trashed - 1) }));
    } else {
      setStats(prev => ({ ...prev, kept: Math.max(0, prev.kept - 1) }));
    }
    
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const remainingFiles = files.length - currentIndex;
  const progress = files.length > 0 ? (currentIndex / files.length) * 100 : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="text-center">
          <Download className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-bounce" />
          <p className="text-gray-500">loading downloads...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="text-center">
          <X className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-500">{error.message || "failed to load downloads"}</p>
        </div>
      </div>
    );
  }

  if (files.length === 0 || currentIndex >= files.length) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="text-center">
          <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-2xl font-semibold text-gray-800 mb-2">all done!</h3>
          <p className="text-gray-500 mb-6">your downloads folder is clean</p>
          <div className="flex gap-8 justify-center">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-500">{stats.kept}</p>
              <p className="text-sm text-gray-500">kept</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-500">{stats.trashed}</p>
              <p className="text-sm text-gray-500">trashed</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      {/* header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-800">download cleaner</h2>
          <div className="flex items-center gap-4">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Undo2 size={20} />
            </button>
            <span className="text-sm text-gray-500">
              {remainingFiles} left
            </span>
          </div>
        </div>
        
        {/* progress bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-blue-500 to-purple-600"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>

        {/* stats */}
        <div className="flex justify-center gap-8 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600">kept: {stats.kept}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-sm text-gray-600">trashed: {stats.trashed}</span>
          </div>
        </div>
      </div>

      {/* card stack */}
      <div className="relative h-[500px]">
        <AnimatePresence>
          {files.slice(currentIndex, currentIndex + 3).reverse().map((file, index) => (
            <FileCard
              key={file.path}
              file={file}
              onSwipe={handleSwipe}
              isTop={index === files.slice(currentIndex, currentIndex + 3).length - 1}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* action buttons */}
      <div className="flex justify-center gap-8 mt-8">
        <button
          onClick={() => handleSwipe('left')}
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all transform hover:scale-110"
        >
          <X size={28} />
        </button>
        <button
          onClick={() => handleSwipe('right')}
          className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all transform hover:scale-110"
        >
          <Check size={28} />
        </button>
      </div>
    </div>
  );
}