"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  Folder, 
  File, 
  ChevronRight, 
  Home,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  Code,
  Terminal
} from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "@/utils/api";

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase();
  
  if (!ext) return <File className="h-4 w-4" />;
  
  const iconMap: Record<string, React.ReactElement> = {
    // images
    jpg: <Image className="h-4 w-4 text-green-500" />,
    jpeg: <Image className="h-4 w-4 text-green-500" />,
    png: <Image className="h-4 w-4 text-green-500" />,
    gif: <Image className="h-4 w-4 text-green-500" />,
    svg: <Image className="h-4 w-4 text-green-500" />,
    
    // videos
    mp4: <Film className="h-4 w-4 text-purple-500" />,
    mov: <Film className="h-4 w-4 text-purple-500" />,
    avi: <Film className="h-4 w-4 text-purple-500" />,
    
    // audio
    mp3: <Music className="h-4 w-4 text-pink-500" />,
    wav: <Music className="h-4 w-4 text-pink-500" />,
    flac: <Music className="h-4 w-4 text-pink-500" />,
    
    // code
    js: <Code className="h-4 w-4 text-yellow-500" />,
    jsx: <Code className="h-4 w-4 text-yellow-500" />,
    ts: <Code className="h-4 w-4 text-blue-500" />,
    tsx: <Code className="h-4 w-4 text-blue-500" />,
    py: <Code className="h-4 w-4 text-blue-400" />,
    sh: <Terminal className="h-4 w-4 text-gray-500" />,
    
    // documents
    txt: <FileText className="h-4 w-4 text-gray-500" />,
    md: <FileText className="h-4 w-4 text-gray-500" />,
    pdf: <FileText className="h-4 w-4 text-red-500" />,
    
    // archives
    zip: <Archive className="h-4 w-4 text-amber-500" />,
    tar: <Archive className="h-4 w-4 text-amber-500" />,
    gz: <Archive className="h-4 w-4 text-amber-500" />,
  };
  
  return iconMap[ext] || <File className="h-4 w-4 text-gray-400" />;
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

export function FileBrowser() {
  const [currentPath, setCurrentPath] = useState("/Users/aleks");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string>("");

  const listFilesMutation = api.files.listDirectory.useMutation({
    onSuccess: (data) => {
      if (data.success && data.files) {
        setFiles(data.files);
        setError("");
      }
      setIsLoading(false);
    },
    onError: (error) => {
      setError(error.message);
      setIsLoading(false);
    }
  });

  useEffect(() => {
    loadDirectory(currentPath);
  }, []);

  const loadDirectory = (path: string) => {
    setIsLoading(true);
    listFilesMutation.mutate({ path });
  };

  const handleNavigate = (item: FileItem) => {
    if (item.isDirectory) {
      setCurrentPath(item.path);
      loadDirectory(item.path);
      setSelectedFile("");
    } else {
      setSelectedFile(item.path);
    }
  };

  const handleGoHome = () => {
    const homePath = "/Users/aleks";
    setCurrentPath(homePath);
    loadDirectory(homePath);
    setSelectedFile("");
  };

  const handleGoUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
    loadDirectory(parentPath);
    setSelectedFile("");
  };

  const pathSegments = currentPath.split('/').filter(Boolean);

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden"
      >
        {/* header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white text-lg font-medium">file browser</h2>
            <button
              onClick={handleGoHome}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <Home className="h-4 w-4 text-white" />
            </button>
          </div>
          
          {/* breadcrumb */}
          <div className="flex items-center gap-1 text-white/80 text-sm">
            <span className="hover:text-white cursor-pointer" onClick={handleGoHome}>~</span>
            {pathSegments.slice(2).map((segment, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-1"
              >
                <ChevronRight className="h-3 w-3" />
                <span 
                  className="hover:text-white cursor-pointer"
                  onClick={() => {
                    const path = '/' + pathSegments.slice(0, index + 3).join('/');
                    setCurrentPath(path);
                    loadDirectory(path);
                  }}
                >
                  {segment}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* file list */}
        <div className="max-h-[500px] overflow-y-auto">
          {error && (
            <div className="p-4 bg-red-50 border-b border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-gray-500">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
                loading...
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* parent directory */}
              {currentPath !== "/" && currentPath !== "/Users/aleks" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={handleGoUp}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors"
                >
                  <Folder className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">..</span>
                </motion.div>
              )}

              {/* directories first, then files */}
              <AnimatePresence mode="popLayout">
                {files
                  .sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((item, index) => (
                    <motion.div
                      key={item.path}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.01 }}
                      onClick={() => handleNavigate(item)}
                      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-center justify-between transition-colors ${
                        selectedFile === item.path ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.isDirectory ? (
                          <Folder className="h-4 w-4 text-blue-500" />
                        ) : (
                          getFileIcon(item.name)
                        )}
                        <span className="text-sm text-gray-700">{item.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {!item.isDirectory && item.size && (
                          <span className="text-xs text-gray-400">
                            {formatSize(item.size)}
                          </span>
                        )}
                        {item.modified && (
                          <span className="text-xs text-gray-400">
                            {new Date(item.modified).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
              </AnimatePresence>

              {files.length === 0 && !isLoading && (
                <div className="p-8 text-center text-gray-400 text-sm">
                  empty directory
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-gray-200 px-4 py-2 bg-gray-50">
          <p className="text-xs text-gray-500">
            {files.length} items • {files.filter(f => f.isDirectory).length} folders
          </p>
        </div>
      </motion.div>
    </div>
  );
}