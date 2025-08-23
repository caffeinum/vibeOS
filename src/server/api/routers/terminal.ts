import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const terminalRouter = createTRPCRouter({
  execute: publicProcedure
    .input(
      z.object({
        command: z.string(),
        cwd: z.string().optional(),
        timeout: z.number().optional().default(30000), // 30 seconds default
      })
    )
    .mutation(async ({ input }) => {
      try {
        const { stdout, stderr } = await execAsync(input.command, {
          cwd: input.cwd || process.cwd(),
          timeout: input.timeout,
          maxBuffer: 1024 * 1024 * 10, // 10MB buffer
          env: {
            ...process.env,
            FORCE_COLOR: "0", // disable color output for cleaner terminal display
          },
        });

        return {
          success: true,
          stdout: stdout || "",
          stderr: stderr || "",
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        // handle command execution errors
        if (error.killed) {
          return {
            success: false,
            error: `command timed out after ${input.timeout}ms`,
            stdout: error.stdout || "",
            stderr: error.stderr || "",
          };
        }

        if (error.code) {
          return {
            success: true, // command ran but returned non-zero exit code
            stdout: error.stdout || "",
            stderr: error.stderr || error.message,
            exitCode: error.code,
          };
        }

        return {
          success: false,
          error: error.message || "unknown error occurred",
          stdout: "",
          stderr: "",
        };
      }
    }),

  // get current working directory
  pwd: publicProcedure.query(async () => {
    return {
      cwd: process.cwd(),
      home: process.env.HOME || process.env.USERPROFILE || "",
      user: process.env.USER || process.env.USERNAME || "unknown",
    };
  }),
});