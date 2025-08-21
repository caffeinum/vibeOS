"use client";

import { useState, useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DarkModeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // check current dark mode status
  const checkDarkMode = async () => {
    try {
      const response = await fetch("/api/system/dark-mode");
      const data = await response.json();
      setIsDark(data.isDark);
    } catch (error) {
      console.error("failed to check dark mode:", error);
    }
  };

  useEffect(() => {
    checkDarkMode();
  }, []);

  const toggleDarkMode = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/system/dark-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable: !isDark }),
      });
      
      if (response.ok) {
        setIsDark(!isDark);
      }
    } catch (error) {
      console.error("failed to toggle dark mode:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isDark === null) return null;

  return (
    <Button
      onClick={toggleDarkMode}
      disabled={isLoading}
      variant="outline"
      size="icon"
      className="relative"
    >
      {isDark ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </Button>
  );
}