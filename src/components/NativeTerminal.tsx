'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/utils/api';

interface NativeTerminalProps {
  onClose?: () => void;
  isActive?: boolean;
  isMinimized?: boolean;
}

export const NativeTerminal: React.FC<NativeTerminalProps> = ({ 
  onClose, 
  isActive = false,
  isMinimized = false 
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentInput, setCurrentInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentDirectory, setCurrentDirectory] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<Array<{type: 'command' | 'output' | 'error', text: string}>>([
    { type: 'output', text: 'claudeos terminal v1.0.0' },
    { type: 'output', text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    { type: 'output', text: 'connected to real shell - be careful!' },
    { type: 'output', text: '' }
  ]);
  
  // trpc mutations and queries
  const executeMutation = api.terminal.execute.useMutation();
  const pwdQuery = api.terminal.pwd.useQuery();
  
  // initialize current directory
  useEffect(() => {
    if (pwdQuery.data) {
      setCurrentDirectory(pwdQuery.data.cwd);
    }
  }, [pwdQuery.data]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  useEffect(() => {
    if (!isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMinimized]);

  const executeCommand = useCallback(async (command: string) => {
    const trimmedCommand = command.trim();
    
    // display command in terminal
    const displayPath = currentDirectory.replace(pwdQuery.data?.home || '', '~');
    setTerminalOutput(prev => [...prev, { type: 'command', text: `${displayPath} $ ${command}` }]);
    
    // add to history and clear input BEFORE executing
    if (trimmedCommand) {
      setCommandHistory(prev => [...prev, command]);
    }
    setHistoryIndex(-1);
    setCurrentInput('');
    
    if (!trimmedCommand) {
      // refocus input after state updates
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    
    // handle special commands locally
    if (trimmedCommand === 'clear') {
      setTerminalOutput([]);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }
    
    // execute command on backend
    setIsExecuting(true);
    try {
      const result = await executeMutation.mutateAsync({
        command: trimmedCommand,
        cwd: currentDirectory
      });
      
      // handle cd command - update current directory
      if (trimmedCommand.startsWith('cd ')) {
        // after cd, get new pwd
        const pwdResult = await executeMutation.mutateAsync({
          command: 'pwd',
          cwd: undefined // let backend determine new cwd after cd
        });
        
        if (pwdResult.stdout) {
          const newDir = pwdResult.stdout.trim();
          setCurrentDirectory(newDir);
        }
      }
      
      // display stdout
      if (result.stdout) {
        const lines = result.stdout.split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            setTerminalOutput(prev => [...prev, { type: 'output', text: line }]);
          }
        });
      }
      
      // display stderr
      if (result.stderr) {
        const lines = result.stderr.split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            setTerminalOutput(prev => [...prev, { type: 'error', text: line }]);
          }
        });
      }
      
      // if no output at all
      if (!result.stdout && !result.stderr) {
        // some commands complete silently
        if (trimmedCommand !== 'cd' && !trimmedCommand.startsWith('cd ')) {
          setTerminalOutput(prev => [...prev, { type: 'output', text: '' }]);
        }
      }
    } catch (error: any) {
      setTerminalOutput(prev => [...prev, { type: 'error', text: error.message || 'command execution failed' }]);
    } finally {
      setIsExecuting(false);
      // refocus input after command completes
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [currentDirectory, executeMutation, pwdQuery.data]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isExecuting) {
      executeCommand(currentInput);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setCurrentInput(commandHistory[newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = Math.min(commandHistory.length - 1, historyIndex + 1);
        setHistoryIndex(newIndex);
        if (newIndex === commandHistory.length - 1) {
          setHistoryIndex(-1);
          setCurrentInput('');
        } else {
          setCurrentInput(commandHistory[newIndex] || '');
        }
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setTerminalOutput([]);
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      if (isExecuting) {
        // todo: implement command cancellation
        setIsExecuting(false);
      } else {
        setCurrentInput('');
      }
    }
  };

  const handleMaximize = () => {
    setIsMaximized(!isMaximized);
  };
  
  const getDisplayPath = () => {
    if (!currentDirectory) return '~';
    return currentDirectory.replace(pwdQuery.data?.home || '', '~');
  };

  return (
    <AnimatePresence>
      {!isMinimized && (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 20 }}
          className={`
            fixed bg-black/95 backdrop-blur-2xl rounded-xl shadow-2xl
            transition-all duration-300 ease-out border border-gray-800/50
            ${isMaximized ? 'inset-4' : 'w-[740px] h-[480px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}
            ${isActive ? 'z-50 ring-2 ring-blue-500/30' : 'z-40'}
          `}
          style={{
            boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.03)'
          }}
        >
          {/* title bar */}
          <div className="h-11 bg-gradient-to-b from-gray-800/80 to-gray-900/80 rounded-t-xl flex items-center px-4 border-b border-gray-700/30">
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 transition-all hover:shadow-lg hover:shadow-red-500/50"
                aria-label="close"
              />
              <button
                className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 transition-all hover:shadow-lg hover:shadow-yellow-500/50"
                aria-label="minimize"
              />
              <button
                onClick={handleMaximize}
                className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 active:bg-green-700 transition-all hover:shadow-lg hover:shadow-green-500/50"
                aria-label="maximize"
              />
            </div>
            <div className="flex-1 text-center">
              <span className="text-sm text-gray-300 font-medium tracking-wide">
                terminal — {getDisplayPath()}
              </span>
            </div>
            <div className="w-16" />
          </div>
          
          {/* terminal content */}
          <div className="h-[calc(100%-2.75rem)] bg-gray-950/95 rounded-b-xl overflow-hidden">
            <div 
              ref={terminalRef}
              className="h-full overflow-y-auto p-4 font-mono text-sm custom-scrollbar"
            >
              {terminalOutput.map((line, index) => (
                <div 
                  key={index} 
                  className={`
                    leading-relaxed whitespace-pre-wrap break-all
                    ${line.type === 'command' ? 'text-green-400 font-semibold' : ''}
                    ${line.type === 'output' ? 'text-gray-300' : ''}
                    ${line.type === 'error' ? 'text-red-400' : ''}
                  `}
                >
                  {line.text}
                </div>
              ))}
              
              {/* current input line - only show when not executing */}
              {!isExecuting && (
                <div className="flex items-baseline text-green-400">
                  <span className="flex-shrink-0">{getDisplayPath()} $ </span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent outline-none text-gray-300 ml-1"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <span className="animate-pulse ml-1">▊</span>
                </div>
              )}
              
              {/* show executing indicator on its own line */}
              {isExecuting && (
                <div className="flex items-center text-yellow-400">
                  <span className="mr-2">executing...</span>
                  <span className="animate-spin">⏳</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NativeTerminal;