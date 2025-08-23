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
  Terminal,
  Search,
  X,
  Eye,
  Info,
  FolderOpen,
  ChevronLeft,
  Grid,
  List
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
}

const getFileIcon = (name: string, isDirectory: boolean) => {
  if (isDirectory) {
    return <FolderOpen className="h-5 w-5 text-blue-500" />;
  }
  
  const ext = name.split('.').pop()?.toLowerCase();
  
  if (!ext) return <File className="h-5 w-5" />;
  
  const iconMap: Record<string, React.ReactElement> = {
    // images
    jpg: <Image className="h-5 w-5 text-green-500" />,
    jpeg: <Image className="h-5 w-5 text-green-500" />,
    png: <Image className="h-5 w-5 text-green-500" />,
    gif: <Image className="h-5 w-5 text-green-500" />,
    svg: <Image className="h-5 w-5 text-green-500" />,
    webp: <Image className="h-5 w-5 text-green-500" />,
    
    // videos
    mp4: <Film className="h-5 w-5 text-purple-500" />,
    mov: <Film className="h-5 w-5 text-purple-500" />,
    avi: <Film className="h-5 w-5 text-purple-500" />,
    mkv: <Film className="h-5 w-5 text-purple-500" />,
    
    // audio
    mp3: <Music className="h-5 w-5 text-pink-500" />,
    wav: <Music className="h-5 w-5 text-pink-500" />,
    flac: <Music className="h-5 w-5 text-pink-500" />,
    m4a: <Music className="h-5 w-5 text-pink-500" />,
    
    // code
    js: <Code className="h-5 w-5 text-yellow-500" />,
    jsx: <Code className="h-5 w-5 text-yellow-500" />,
    ts: <Code className="h-5 w-5 text-blue-500" />,
    tsx: <Code className="h-5 w-5 text-blue-500" />,
    py: <Code className="h-5 w-5 text-blue-400" />,
    sh: <Terminal className="h-5 w-5 text-gray-500" />,
    bash: <Terminal className="h-5 w-5 text-gray-500" />,
    
    // documents
    txt: <FileText className="h-5 w-5 text-gray-500" />,
    md: <FileText className="h-5 w-5 text-gray-500" />,
    pdf: <FileText className="h-5 w-5 text-red-500" />,
    doc: <FileText className="h-5 w-5 text-blue-600" />,
    docx: <FileText className="h-5 w-5 text-blue-600" />,
    
    // archives
    zip: <Archive className="h-5 w-5 text-amber-500" />,
    tar: <Archive className="h-5 w-5 text-amber-500" />,
    gz: <Archive className="h-5 w-5 text-amber-500" />,
    rar: <Archive className="h-5 w-5 text-amber-500" />,
  };
  
  return iconMap[ext] || <File className="h-5 w-5 text-gray-400" />;
};

const formatSize = (bytes?: number) => {
  if (!bytes) return '-';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  
  return date.toLocaleDateString();
};

export function FileBrowserEnhanced() {
  const [currentPath, setCurrentPath] = useState("/Users/aleks");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [history, setHistory] = useState<string[]>(["/Users/aleks"]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const listFilesMutation = api.files.listDirectory.useMutation({
    onSuccess: (data) => {
      if (data.success && data.files) {
        setFiles(data.files);
        setError("");
      } else if (data.error) {
        setError(data.error);
      }
      setIsLoading(false);
    },
    onError: (error) => {
      setError(error.message);
      setIsLoading(false);
    }
  });

  const searchFilesMutation = api.files.searchFiles.useMutation({
    onSuccess: (data) => {
      if (data.success && data.files) {
        setFiles(data.files);
        setError("");
      }
      setIsSearching(false);
    },
    onError: (error) => {
      setError(error.message);
      setIsSearching(false);
    }
  });

  const { data: filePreview } = api.files.readFile.useQuery(
    { path: selectedFile?.path || "", limit: 50 },
    { 
      enabled: !!selectedFile && !selectedFile.isDirectory && showPreview,
    }
  );

  useEffect(() => {
    if (filePreview?.success && filePreview?.content) {
      setPreviewContent(filePreview.content);
    }
  }, [filePreview]);

  const { data: fileInfo } = api.files.getFileInfo.useQuery(
    { path: selectedFile?.path || "" },
    { enabled: !!selectedFile }
  );

  useEffect(() => {
    loadDirectory(currentPath);
  }, []);

  const loadDirectory = useCallback((path: string) => {
    setIsLoading(true);
    setSelectedFile(null);
    setShowPreview(false);
    listFilesMutation.mutate({ path });
  }, []);

  const handleNavigate = (item: FileItem) => {
    if (item.isDirectory) {
      const newPath = item.path;
      setCurrentPath(newPath);
      loadDirectory(newPath);
      
      // update history
      const newHistory = [...history.slice(0, historyIndex + 1), newPath];
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    } else {
      setSelectedFile(item);
    }
  };

  const handleGoBack = () => {
    if (historyIndex > 0) {
      const prevPath = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(prevPath);
      loadDirectory(prevPath);
    }
  };

  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const nextPath = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(nextPath);
      loadDirectory(nextPath);
    }
  };

  const handleGoHome = () => {
    const homePath = "/Users/aleks";
    setCurrentPath(homePath);
    loadDirectory(homePath);
    
    const newHistory = [...history.slice(0, historyIndex + 1), homePath];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleGoUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
    loadDirectory(parentPath);
    
    const newHistory = [...history.slice(0, historyIndex + 1), parentPath];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setIsSearching(true);
      searchFilesMutation.mutate({
        path: currentPath,
        query: searchQuery,
      });
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    loadDirectory(currentPath);
  };

  const pathSegments = currentPath.split('/').filter(Boolean);

  return (
    <div className="w-full h-[600px] bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
      {/* header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleGoBack}
              disabled={historyIndex === 0}
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleGoForward}
              disabled={historyIndex === history.length - 1}
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleGoHome}
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
            >
              <Home className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/20"
            >
              {viewMode === 'list' ? <Grid className="h-4 w-4" /> : <List className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        
        {/* breadcrumb */}
        <div className="flex items-center gap-1 text-white/90 text-sm mb-3">
          <span className="hover:text-white cursor-pointer" onClick={handleGoHome}>~</span>
          {pathSegments.slice(2).map((segment, index) => (
            <div key={index} className="flex items-center gap-1">
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
            </div>
          ))}
        </div>
        
        {/* search bar */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="search files..."
              className="w-full pl-10 pr-10 py-2 rounded-lg bg-white/90 text-gray-800 placeholder-gray-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
          <Button
            onClick={handleSearch}
            disabled={!searchQuery.trim() || isSearching}
            className="bg-white/20 hover:bg-white/30 text-white"
          >
            {isSearching ? 'searching...' : 'search'}
          </Button>
        </div>
      </div>

      {/* main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* file list */}
        <div className={`${selectedFile ? 'w-2/3' : 'w-full'} border-r border-gray-200 dark:border-gray-700 overflow-y-auto`}>
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {isLoading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 text-gray-500">
                <div className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
                loading...
              </div>
            </div>
          ) : viewMode === 'list' ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {/* parent directory */}
              {currentPath !== "/" && currentPath !== "/Users/aleks" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={handleGoUp}
                  className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center gap-3 transition-colors"
                >
                  <Folder className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-500">..</span>
                </motion.div>
              )}

              {/* files */}
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
                      className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer flex items-center justify-between transition-colors ${
                        selectedFile?.path === item.path ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {getFileIcon(item.name, item.isDirectory)}
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item.name}</span>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {!item.isDirectory && (
                          <span className="text-xs text-gray-400">
                            {formatSize(item.size)}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
                          {formatDate(item.modified)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
          ) : (
            // grid view
            <div className="p-4 grid grid-cols-4 gap-4">
              {files
                .sort((a, b) => {
                  if (a.isDirectory && !b.isDirectory) return -1;
                  if (!a.isDirectory && b.isDirectory) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((item, index) => (
                  <motion.div
                    key={item.path}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.01 }}
                    onClick={() => handleNavigate(item)}
                    className={`p-4 rounded-lg border cursor-pointer hover:shadow-lg transition-all ${
                      selectedFile?.path === item.path 
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      {getFileIcon(item.name, item.isDirectory)}
                      <span className="text-xs text-gray-700 dark:text-gray-300 text-center truncate w-full">
                        {item.name}
                      </span>
                      {!item.isDirectory && (
                        <span className="text-xs text-gray-400">
                          {formatSize(item.size)}
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
            </div>
          )}

          {files.length === 0 && !isLoading && (
            <div className="p-8 text-center text-gray-400 text-sm">
              {searchQuery ? 'no files found' : 'empty directory'}
            </div>
          )}
        </div>

        {/* file preview panel */}
        {selectedFile && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-1/3 flex flex-col bg-gray-50 dark:bg-gray-800"
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-gray-800 dark:text-gray-200 truncate">
                  {selectedFile.name}
                </h3>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              
              <div className="flex gap-2">
                {!selectedFile.isDirectory && (
                  <Button
                    onClick={() => setShowPreview(!showPreview)}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    {showPreview ? 'hide' : 'preview'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                >
                  <Info className="h-3 w-3 mr-1" />
                  info
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {fileInfo?.success && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">type:</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {selectedFile?.isDirectory ? 'folder' : 'file'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">size:</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatSize(fileInfo.size || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">modified:</span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {formatDate(fileInfo.modified || '')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">permissions:</span>
                    <span className="text-gray-700 dark:text-gray-300 font-mono">
                      -rw-r--r--
                    </span>
                  </div>
                </div>
              )}

              {showPreview && filePreview?.success && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">preview</h4>
                  <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                    <code>{filePreview.content}</code>
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-2 bg-gray-50 dark:bg-gray-800">
        <p className="text-xs text-gray-500">
          {files.length} items • {files.filter(f => f.isDirectory).length} folders • {files.filter(f => !f.isDirectory).length} files
        </p>
      </div>
    </div>
  );
}