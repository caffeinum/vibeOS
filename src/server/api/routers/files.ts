import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import * as fs from "fs/promises";
import * as path from "path";

export const filesRouter = createTRPCRouter({
  listDirectory: publicProcedure
    .input(
      z.object({
        path: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const dirPath = input.path;
        
        // read directory contents
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        
        // get file details
        const files = await Promise.all(
          items.map(async (item) => {
            const fullPath = path.join(dirPath, item.name);
            let stats = null;
            
            try {
              stats = await fs.stat(fullPath);
            } catch (err) {
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
});