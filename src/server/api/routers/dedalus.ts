import { observable } from "@trpc/server/observable";
import { spawn } from "child_process";
import path from "path";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

// dedalus labs ai integration with streaming
const DEDALUS_API_KEY = process.env.DEDALUS_API_KEY || "";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: Date;
  lastActivity: Date;
}

// in-memory chat sessions
const chatSessions = new Map<string, ChatSession>();

export const dedalusRouter = router({
  // create new chat session
  createSession: publicProcedure.mutation(async () => {
    const sessionId = crypto.randomUUID();
    const session: ChatSession = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    chatSessions.set(sessionId, session);

    return {
      sessionId,
      createdAt: session.createdAt,
    };
  }),

  // send message with streaming response (using mutation with SSE)
  sendMessageStream: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string(),
        model: z.string().optional().default("openai/gpt-4o-mini"),
        mcpServers: z.array(z.string()).optional().default([]),
        useLocalTools: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ input }) => {
      return observable<{ type: string; content?: string; error?: string }>(
        (emit) => {
          const session = chatSessions.get(input.sessionId);

          if (!session) {
            emit.error(new Error("session not found"));
            return;
          }

          if (!DEDALUS_API_KEY) {
            emit.error(new Error("dedalus api key not configured"));
            return;
          }

          // add user message
          const userMessage: ChatMessage = {
            role: "user",
            content: input.message,
            timestamp: new Date(),
          };

          session.messages.push(userMessage);
          session.lastActivity = new Date();

          // prepare config for python runner
          const config = {
            input: input.message,
            model: input.model,
            stream: true,
            mcp_servers: input.mcpServers,
            use_local_tools: input.useLocalTools,
            api_key: DEDALUS_API_KEY,
          };

          // path to python runner
          const runnerPath = path.join(
            process.cwd(),
            "src/server/dedalus-runner.py"
          );

          // spawn python process with uvx
          const pythonProcess = spawn(
            "uvx",
            ["--from", "dedalus-labs", "python", runnerPath],
            {
              env: {
                ...process.env,
                DEDALUS_API_KEY: DEDALUS_API_KEY,
              },
            }
          );

          // send config via stdin
          pythonProcess.stdin.write(JSON.stringify(config));
          pythonProcess.stdin.end();

          let assistantContent = "";

          // handle stdout (streaming chunks)
          pythonProcess.stdout.on("data", (data) => {
            const lines = data
              .toString()
              .split("\n")
              .filter((line: string) => line.trim());

            for (const line of lines) {
              try {
                const output = JSON.parse(line);

                if (output.type === "chunk") {
                  assistantContent += output.content;
                  emit.next({
                    type: "chunk",
                    content: output.content,
                  });
                } else if (output.type === "complete") {
                  // save assistant message
                  const assistantMessage: ChatMessage = {
                    role: "assistant",
                    content: assistantContent || output.content || "",
                    timestamp: new Date(),
                  };
                  session.messages.push(assistantMessage);

                  emit.next({
                    type: "complete",
                    content: assistantContent || output.content,
                  });
                  emit.complete();
                } else if (output.type === "error") {
                  emit.error(new Error(output.error));
                }
              } catch (e) {
                // ignore non-json lines
                console.log("non-json output:", line);
              }
            }
          });

          // handle stderr
          pythonProcess.stderr.on("data", (data) => {
            console.error("python runner error:", data.toString());
          });

          // handle process exit
          pythonProcess.on("exit", (code) => {
            if (code !== 0) {
              emit.error(new Error(`python runner exited with code ${code}`));
            }
          });

          // cleanup on unsubscribe
          return () => {
            pythonProcess.kill();
          };
        }
      );
    }),

  // send message without streaming (sync)
  sendMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string(),
        model: z.string().optional().default("openai/gpt-4o-mini"),
        mcpServers: z.array(z.string()).optional().default([]),
        useLocalTools: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const session = chatSessions.get(input.sessionId);

      if (!session) {
        throw new Error("session not found");
      }

      if (!DEDALUS_API_KEY) {
        throw new Error("dedalus api key not configured");
      }

      // add user message
      const userMessage: ChatMessage = {
        role: "user",
        content: input.message,
        timestamp: new Date(),
      };

      session.messages.push(userMessage);
      session.lastActivity = new Date();

      return new Promise<{ message: ChatMessage; sessionId: string }>((resolve, reject) => {
        // prepare config
        const config = {
          input: input.message,
          model: input.model,
          stream: false,
          mcp_servers: input.mcpServers,
          use_local_tools: input.useLocalTools,
          api_key: DEDALUS_API_KEY,
        };
        
        console.log('Dedalus request:', {
          message: input.message,
          model: input.model,
          mcpServers: input.mcpServers,
          useLocalTools: input.useLocalTools,
        });

        const runnerPath = path.join(
          process.cwd(),
          "src/server/dedalus-runner.py"
        );

        const pythonProcess = spawn(
          "uvx",
          ["--from", "dedalus-labs", "python", runnerPath],
          {
            env: {
              ...process.env,
              DEDALUS_API_KEY: DEDALUS_API_KEY,
            },
          }
        );

        pythonProcess.stdin.write(JSON.stringify(config));
        pythonProcess.stdin.end();

        let output = "";

        pythonProcess.stdout.on("data", (data) => {
          output += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
          console.error("python runner error:", data.toString());
        });

        pythonProcess.on("exit", (code) => {
          if (code === 0) {
            try {
              const lines = output.split("\n").filter((line) => line.trim());
              const lastLine = lines[lines.length - 1];
              const result = JSON.parse(lastLine);

              if (result.type === "complete") {
                const assistantMessage: ChatMessage = {
                  role: "assistant",
                  content: result.content,
                  timestamp: new Date(),
                };
                session.messages.push(assistantMessage);

                resolve({
                  message: assistantMessage,
                  sessionId: input.sessionId,
                });
              } else if (result.type === "error") {
                reject(new Error(result.error));
              }
            } catch (e) {
              reject(new Error("failed to parse python runner output"));
            }
          } else {
            reject(new Error(`python runner exited with code ${code}`));
          }
        });
      });
    }),

  // get chat history
  getSession: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const session = chatSessions.get(input.sessionId);

      if (!session) {
        throw new Error("session not found");
      }

      return session;
    }),

  // list all sessions
  listSessions: publicProcedure.query(async () => {
    const sessions = Array.from(chatSessions.values()).map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      messageCount: session.messages.length,
    }));

    return sessions.sort(
      (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
    );
  }),

  // check api status
  checkStatus: publicProcedure.query(async () => {
    return {
      connected: !!DEDALUS_API_KEY,
      status: DEDALUS_API_KEY ? "ready" : "api key required",
      message: DEDALUS_API_KEY
        ? "dedalus ai streaming integration ready"
        : "set DEDALUS_API_KEY environment variable to enable",
    };
  }),
});
