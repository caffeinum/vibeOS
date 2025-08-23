import { handleClaudeCodeRequest } from "@/claude-code-handler";
import type { SDKMessage } from "@anthropic-ai/claude-code";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";

// store for streaming messages
const messageStreams = new Map<string, SDKMessage[]>();

export const clickRouter = router({
  sendToClaudeCode: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        context: z.any().optional(),
        sessionId: z.string().optional(),
        continueSession: z.boolean().optional(),
        streamId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // if streaming, start async collection
      if (input.streamId) {
        // Add user message to display immediately
        const userMessage: SDKMessage = {
          type: "user" as const,
          message: {
            role: "user",
            content: [{ type: "text", text: input.prompt }],
          },
          session_id: input.sessionId || "temp",
          parent_tool_use_id: null,
        } as SDKMessage;

        messageStreams.set(input.streamId, [userMessage]);

        // start async collection
        const messages = await handleClaudeCodeRequest(input);

        for await (const message of messages) {
          const stream = messageStreams.get(input.streamId!);
          if (stream) {
            console.log("[click] adding message to stream:", message);
            stream.push(message);
          }
        }

        return { success: true, streamId: input.streamId, streaming: true };
      }
    }),

  getStreamMessages: publicProcedure
    .input(
      z.object({
        streamId: z.string(),
        lastIndex: z.number().default(0),
      })
    )
    .query(({ input }) => {
      const stream = messageStreams.get(input.streamId);
      if (!stream) {
        return { messages: [], complete: false, error: "stream not found" };
      }

      const result = stream.find((m) => m.type === "result");

      return {
        messages: stream,
        complete: !!result,
        error: result?.is_error ? result.permission_denials : undefined,
        nextIndex: stream.length,
      };
    }),
});
