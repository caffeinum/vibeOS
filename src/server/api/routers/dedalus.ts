import Dedalus from "dedalus-labs";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

// dedalus labs ai integration
const DEDALUS_API_KEY = process.env.DEDALUS_API_KEY || "";

// initialize dedalus client
const dedalusClient = DEDALUS_API_KEY
  ? new Dedalus({
      apiKey: DEDALUS_API_KEY,
    })
  : null;

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

// in-memory chat sessions (in production, use database)
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

  // send message to dedalus ai
  sendMessage: publicProcedure
    .input(
      z.object({
        sessionId: z.string(),
        message: z.string(),
        model: z.string().optional().default("default"),
      })
    )
    .mutation(async ({ input }) => {
      const session = chatSessions.get(input.sessionId);

      if (!session) {
        throw new Error("session not found");
      }

      // add user message
      const userMessage: ChatMessage = {
        role: "user",
        content: input.message,
        timestamp: new Date(),
      };

      session.messages.push(userMessage);
      session.lastActivity = new Date();

      try {
        if (!dedalusClient) {
          throw new Error("dedalus client not initialized - api key required");
        }

        // call dedalus labs api
        const response = await dedalusClient.chat.create({
          input: session.messages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
          model: "openai/gpt-4o-mini",
        });

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content:
            response.choices[0]?.message?.content ||
            "no response from dedalus ai",
          timestamp: new Date(),
        };

        session.messages.push(assistantMessage);

        return {
          message: assistantMessage,
          sessionId: input.sessionId,
        };
      } catch (error) {
        console.error("dedalus api error:", error);
        throw new Error("failed to communicate with dedalus ai");
      }
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
        ? "dedalus ai integration ready"
        : "set DEDALUS_API_KEY environment variable to enable",
    };
  }),
});
