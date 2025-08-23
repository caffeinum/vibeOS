"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, MessageCircle, Send, StopCircle, ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ClaudeChatProps {
  position?: "bottom-right" | "bottom-left";
  size?: "sm" | "md" | "lg";
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function ClaudeChat({
  position = "bottom-right",
  size = "md",
  className,
  isOpen: externalIsOpen,
  onClose,
}: ClaudeChatProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const sizeConfig = {
    sm: "w-80 h-96",
    md: "w-96 h-[500px]",
    lg: "w-[420px] h-[600px]",
  };

  const positionConfig = {
    "bottom-right": "bottom-6 right-6",
    "bottom-left": "bottom-6 left-6",
  };

  // Use Vercel AI SDK useChat hook
  const { messages, sendMessage, error, status, stop } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    onError: (error) => {
      console.error("[claude-chat] error:", error);
    },
  });

  const [input, setInput] = useState("");
  const [selectedImages, setSelectedImages] = useState<Array<{ url: string; file: File }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // type ChatStatus = 'submitted' | 'streaming' | 'ready' | 'error';
  const isLoading = status === "streaming";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: Array<{ url: string; file: File }> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        newImages.push({ url, file });
      }
    }
    setSelectedImages([...selectedImages, ...newImages]);
  };

  const removeImage = (index: number) => {
    const newImages = [...selectedImages];
    URL.revokeObjectURL(newImages[index].url);
    newImages.splice(index, 1);
    setSelectedImages(newImages);
  };

  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        resolve(base64.split(",")[1]); // remove data:image/...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  const handleSendMessage = async () => {
    const parts: Array<{ type: string; text?: string; image?: string; mimeType?: string }> = [];
    
    // add images as parts
    for (const img of selectedImages) {
      const base64 = await convertImageToBase64(img.file);
      parts.push({
        type: "image",
        image: base64,
        mimeType: img.file.type,
      });
    }
    
    // add text
    if (input.trim()) {
      parts.push({ type: "text", text: input });
    }

    if (parts.length === 0) return;

    sendMessage({
      role: "user",
      parts,
    });
    
    setInput("");
    setSelectedImages([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  return (
    <div
      className={`fixed z-50 ${positionConfig[position]} ${className || ""}`}
    >
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Gradual blur layers - creates smooth transition */}
            {[0.5, 1, 2, 4, 8].map((blur, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: index * 0.02 }}
                className="absolute pointer-events-none"
                style={{
                  inset: `-${(5 - index) * 20}px`,
                  backdropFilter: `blur(${blur}px)`,
                  WebkitBackdropFilter: `blur(${blur}px)`,
                  maskImage: `radial-gradient(circle at ${
                    position === "bottom-right" ? "bottom right" : "bottom left"
                  }, 
                    transparent ${30 + index * 10}%, 
                    black ${60 + index * 10}%)`,
                  WebkitMaskImage: `radial-gradient(circle at ${
                    position === "bottom-right" ? "bottom right" : "bottom left"
                  }, 
                    transparent ${30 + index * 10}%, 
                    black ${60 + index * 10}%)`,
                }}
              />
            ))}

            <motion.div
              ref={chatRef}
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className={`backdrop-blur-xs rounded-2xl flex flex-col overflow-hidden relative ${sizeConfig[size]}`}
            >
              {/* Close button */}
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={() => {
                    if (onClose) onClose();
                    else setInternalIsOpen(false);
                  }}
                  className="p-1.5 rounded-full bg-black/20 hover:bg-black/30 backdrop-blur-sm transition-colors"
                >
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col-reverse">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200"
                  >
                    <p className="text-xs text-red-600">{error.message}</p>
                  </motion.div>
                )}

                {messages.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Bot className="h-12 w-12 mb-3" />
                    <p className="text-sm">
                      start a conversation with claude code
                    </p>
                  </div>
                )}

                {/* Show loading dots when waiting for first response */}
                {((isLoading && messages.length === 0) ||
                  status === "submitted" ||
                  status === "streaming") && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex justify-start"
                  >
                    <div className="bg-gray-200 rounded-2xl px-4 py-2 rounded-bl-md">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                        <div
                          className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0.1s" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {[...messages].reverse().map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex mb-3 ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      }}
                      className={`max-w-[75%] ${
                        msg.role === "user" ? "ml-12" : "mr-12"
                      }`}
                    >
                      <div
                        className={`px-4 py-2 rounded-2xl ${
                          msg.role === "user"
                            ? "bg-blue-500 text-white rounded-br-md"
                            : "bg-gray-200 text-gray-900 rounded-bl-md"
                        }`}
                      >
                        <div className="text-sm">
                          {msg.parts.map((part: { type: string; text?: string; image?: string; mimeType?: string; toolName?: string; url?: string; filename?: string }, index) => (
                            <div key={part.type + "%%" + index}>
                              {part.type === "text" && (
                                <p className="whitespace-pre-wrap">{part.text}</p>
                              )}
                              {part.type === "image" && (
                                <img
                                  src={`data:${part.mimeType || "image/jpeg"};base64,${part.image}`}
                                  alt="uploaded"
                                  className="mt-2 rounded-lg max-w-full"
                                />
                              )}
                              {part.type === "reasoning" && (
                                <p className="whitespace-pre-wrap">{part.text}</p>
                              )}
                              {part.type === "dynamic-tool" && (
                                <span>{part.toolName}</span>
                              )}
                              {part.type === "source-url" && (
                                <span>{part.url}</span>
                              )}
                              {part.type === "source-document" && (
                                <span>{part.filename || ""}</span>
                              )}
                              {part.type === "file" && (
                                <span>{part.filename || ""}</span>
                              )}
                              {part.type === "step-start" && (
                                <span>start</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                ))}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSubmit}
                className="p-4 border-t border-gray-200 bg-white/50"
              >
                {/* Image preview */}
                {selectedImages.length > 0 && (
                  <div className="flex gap-2 mb-2 overflow-x-auto">
                    {selectedImages.map((img, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={img.url}
                          alt={`preview ${index}`}
                          className="h-16 w-16 object-cover rounded-lg border border-gray-300"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <textarea
                      value={input}
                      onChange={handleInputChange}
                      onKeyPress={handleKeyPress}
                      placeholder="message claude code..."
                      className="w-full px-4 py-2 text-sm bg-gray-50 rounded-full border border-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      disabled={isLoading}
                      rows={1}
                    />
                  </div>
                  
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  
                  {/* Image button */}
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded-full hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-9 w-9"
                    disabled={isLoading}
                  >
                    <ImagePlus className="h-4 w-4" />
                  </motion.button>
                  {isLoading && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={stop}
                      className="px-3 py-2 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-9 w-9"
                    >
                      <StopCircle className="h-4 w-4" />
                    </motion.button>
                  )}
                  {!isLoading && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleSubmit}
                      className="px-3 py-2 bg-blue-500 text-white text-sm rounded-full hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center h-9 w-9"
                    >
                      <Send className="h-4 w-4" />
                    </motion.button>
                  )}
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Button - only show if not controlled externally */}
      {externalIsOpen === undefined && (
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              onClick={() => setInternalIsOpen(true)}
              className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <MessageCircle className="h-6 w-6 text-white" />
            </motion.button>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
