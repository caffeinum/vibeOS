import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";

export const filesRouter = createTRPCRouter({
  listDirectory: publicProcedure
    .input(
      z.object({
        path: z.string(),
        showHidden: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const dirPath = input.path;
        
        // read directory contents
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        
        // filter hidden files if not requested
        const filteredItems = input.showHidden 
          ? items 
          : items.filter(item => !item.name.startsWith('.'));
        
        // get file details
        const files = await Promise.all(
          filteredItems.map(async (item) => {
            const fullPath = path.join(dirPath, item.name);
            let stats = null;
            
            try {
              stats = await fs.stat(fullPath);
            } catch {
              // ignore files we can't access
              return null;
            }
            
            return {
              name: item.name,
              path: fullPath,
              isDirectory: item.isDirectory(),
              size: stats?.size,
              modified: stats?.mtime.toISOString(),
            };
          })
        );
        
        // filter out null values (inaccessible files)
        const accessibleFiles = files.filter(f => f !== null);
        
        return {
          success: true,
          files: accessibleFiles,
        };
      } catch (error) {
        console.error("error listing directory:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to list directory",
          files: [],
        };
      }
    }),

  moveToTrash: publicProcedure
    .input(
      z.object({
        path: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // use osascript to move to trash (macos native)
        await exec(`osascript -e 'tell application "Finder" to delete POSIX file "${input.path}"'`);
        
        return {
          success: true,
          message: "moved to trash",
        };
      } catch (error) {
        console.error("error moving to trash:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to move to trash",
        };
      }
    }),

  moveFile: publicProcedure
    .input(
      z.object({
        sourcePath: z.string(),
        destinationDir: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const fileName = path.basename(input.sourcePath);
        let destPath = path.join(input.destinationDir, fileName);
        
        // check if destination exists and add number suffix if needed
        let counter = 1;
        while (await fs.access(destPath).then(() => true).catch(() => false)) {
          const ext = path.extname(fileName);
          const nameWithoutExt = path.basename(fileName, ext);
          destPath = path.join(input.destinationDir, `${nameWithoutExt}_${counter}${ext}`);
          counter++;
        }
        
        // move the file
        await fs.rename(input.sourcePath, destPath);
        
        return {
          success: true,
          newPath: destPath,
          message: `moved to ${destPath}`,
        };
      } catch (error) {
        console.error("error moving file:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to move file",
        };
      }
    }),

  getDownloads: publicProcedure
    .query(async () => {
      try {
        const homeDir = os.homedir();
        const platform = os.platform();

        // Determine downloads path based on platform
        let downloadsPath = '';
        switch (platform) {
          case 'win32':
            downloadsPath = path.join(homeDir, 'Downloads');
            break;
          case 'darwin':
            downloadsPath = path.join(homeDir, 'Downloads');
            break;
          case 'linux':
            downloadsPath = path.join(homeDir, 'Downloads');
            break;
          default:
            downloadsPath = path.join(homeDir, 'Downloads');
        }

        // Check if downloads directory exists, fallback to home
        try {
          await fs.access(downloadsPath);
        } catch {
          downloadsPath = homeDir;
        }

        const items = await fs.readdir(downloadsPath, { withFileTypes: true });
        
        // get file details and filter out directories
        const files = await Promise.all(
          items
            .filter(item => !item.isDirectory() && !item.name.startsWith('.'))
            .map(async (item) => {
              const fullPath = path.join(downloadsPath, item.name);
              const stats = await fs.stat(fullPath);
              
              // get preview for images
              const ext = path.extname(item.name).toLowerCase();
              const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
              const isImage = imageExts.includes(ext);
              
              return {
                name: item.name,
                path: fullPath,
                size: stats.size,
                modified: stats.mtime.toISOString(),
                created: stats.birthtime.toISOString(),
                extension: ext,
                isImage,
              };
            })
        );
        
        // sort by creation date (newest first)
        files.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        
        return {
          success: true,
          files,
        };
      } catch (error) {
        console.error("error getting downloads:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to get downloads",
          files: [],
        };
      }
    }),

  getFileInfo: publicProcedure
    .input(
      z.object({
        path: z.string(),
      })
    )
    .query(async ({ input }) => {
      try {
        const filePath = path.join(os.homedir(), input.path);
        const stats = await fs.stat(filePath);
        
        return {
          success: true,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to get file info",
        };
      }
    }),

  readFile: publicProcedure
    .input(
      z.object({
        path: z.string(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const filePath = path.join(os.homedir(), input.path);
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        const preview = lines.slice(0, input.limit || 50).join("\n");
        
        return {
          success: true,
          content: preview,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Read failed",
          content: "",
        };
      }
    }),

  searchFiles: publicProcedure
    .input(
      z.object({
        path: z.string(),
        query: z.string(),
        showHidden: z.boolean().optional().default(false),
      })
    )
    .mutation(async () => {
      try {
        // For now, just return empty results
        // TODO: Implement actual file search
        return {
          success: true,
          files: [],
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Search failed",
        };
      }
    }),

  getSystemInfo: publicProcedure
    .query(async () => {
      try {
        const homeDir = os.homedir();
        const platform = os.platform();

        // Determine downloads path based on platform
        let downloadsPath = '';
        let documentsPath = '';

        switch (platform) {
          case 'win32':
            // Windows: C:\Users\Username\Downloads
            downloadsPath = path.join(homeDir, 'Downloads');
            documentsPath = path.join(homeDir, 'Documents');
            break;
          case 'darwin':
            // macOS: /Users/Username/Downloads
            downloadsPath = path.join(homeDir, 'Downloads');
            documentsPath = path.join(homeDir, 'Documents');
            break;
          case 'linux':
            // Linux: /home/username/Downloads (most common)
            downloadsPath = path.join(homeDir, 'Downloads');
            documentsPath = path.join(homeDir, 'Documents');
            break;
          default:
            // Fallback
            downloadsPath = path.join(homeDir, 'Downloads');
            documentsPath = path.join(homeDir, 'Documents');
        }

        // Check if paths exist, use home directory as fallback
        let downloadsExists = false;
        let documentsExists = false;

        try {
          await fs.access(downloadsPath);
          downloadsExists = true;
        } catch {
          downloadsPath = homeDir; // fallback to home directory
        }

        try {
          await fs.access(documentsPath);
          documentsExists = true;
        } catch {
          documentsPath = homeDir; // fallback to home directory
        }

        return {
          success: true,
          systemInfo: {
            homeDir,
            downloadsPath,
            documentsPath,
            platform,
            downloadsExists,
            documentsExists,
          },
        };
      } catch (error) {
        console.error("error getting system info:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "failed to get system info",
          systemInfo: {
            homeDir: os.homedir(),
            downloadsPath: os.homedir(),
            documentsPath: os.homedir(),
            platform: os.platform(),
            downloadsExists: false,
            documentsExists: false,
          },
        };
      }
    }),
});