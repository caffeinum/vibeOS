import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import path from 'path';

// browser-use integration with streaming
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export const browserUseRouter = router({
  runAgent: publicProcedure
    .input(z.object({
      task: z.string(),
      cdpUrl: z.string(),
      model: z.string().optional().default("openai/gpt-4o-mini"),
      apiKey: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log('[browser-use/runAgent] Starting browser-use agent...');
      
      if (!OPENAI_API_KEY) {
        throw new Error("OpenAI API key not configured");
      }
      
      return new Promise((resolve, reject) => {
        // prepare config for python runner
        const config = {
          task: input.task,
          cdp_url: input.cdpUrl,
          model: input.model,
          stream: false,
        };

        // path to python runner
        const runnerPath = path.join(
          process.cwd(),
          "src/server/browser-use-runner.py"
        );

        // spawn python process with uvx
        const pythonProcess = spawn(
          "uvx",
          ["--from", "browser-use", "python", runnerPath],
          {
            env: {
              ...process.env,
              OPENAI_API_KEY: OPENAI_API_KEY,
            },
          }
        );

        // send config via stdin
        pythonProcess.stdin.write(JSON.stringify(config));
        pythonProcess.stdin.end();

        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout?.on('data', (data) => {
          const chunk = data.toString();
          stdoutData += chunk;
          
          // Try to parse JSON lines
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                console.log('[browser-use]', parsed);
              } catch {
                // Not JSON, ignore
              }
            }
          }
        });

        pythonProcess.stderr?.on('data', (data) => {
          stderrData += data.toString();
          console.error('[browser-use/stderr]', data.toString());
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ 
              success: true, 
              output: stdoutData,
              stderr: stderrData 
            });
          } else {
            reject(new Error(`Process exited with code ${code}: ${stderrData}`));
          }
        });

        pythonProcess.on('error', (error) => {
          reject(new Error(`Failed to start browser-use process: ${error.message}`));
        });
      });
    }),

  runAgentStream: publicProcedure
    .input(z.object({
      task: z.string(),
      cdpUrl: z.string(),
      model: z.string().optional().default("openai/gpt-4o-mini"),
      apiKey: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log('[browser-use/runAgentStream] Starting streaming browser-use agent...');
      
      if (!OPENAI_API_KEY) {
        throw new Error("OpenAI API key not configured");
      }
      
      return new Promise((resolve, reject) => {
        // prepare config for python runner
        const config = {
          task: input.task,
          cdp_url: input.cdpUrl,
          model: input.model,
          stream: true,
        };

        // path to python runner
        const runnerPath = path.join(
          process.cwd(),
          "src/server/browser-use-runner.py"
        );

        // spawn python process with uvx
        const pythonProcess = spawn(
          "uvx",
          ["--from", "browser-use", "python", runnerPath],
          {
            env: {
              ...process.env,
              OPENAI_API_KEY: OPENAI_API_KEY,
            },
          }
        );

        // send config via stdin
        pythonProcess.stdin.write(JSON.stringify(config));
        pythonProcess.stdin.end();

        // Create a readable stream for the response
        const stream = new Readable({
          read() {}
        });

        pythonProcess.stdout?.on('data', (data) => {
          const chunk = data.toString();
          
          // Try to parse JSON lines and emit them
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                stream.push(JSON.stringify(parsed) + '\n');
              } catch {
                // Not JSON, ignore
              }
            }
          }
        });

        pythonProcess.stderr?.on('data', (data) => {
          console.error('[browser-use/stderr]', data.toString());
        });

        pythonProcess.on('close', (code) => {
          if (code === 0) {
            stream.push(null); // End the stream
            resolve({ success: true });
          } else {
            stream.destroy(new Error(`Process exited with code ${code}`));
            reject(new Error(`Process exited with code ${code}`));
          }
        });

        pythonProcess.on('error', (error) => {
          stream.destroy(error);
          reject(new Error(`Failed to start browser-use process: ${error.message}`));
        });

        // Return the stream
        resolve({ 
          success: true, 
          stream: stream 
        });
      });
    }),
});
