import { query, type Options } from "@anthropic-ai/claude-code";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";

export const maxDuration = 60000; // 60 seconds

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Get the last user message
  const lastMessage = messages[messages.length - 1];

  console.log("[chat/route] received message:", lastMessage);

  const prompt = lastMessage.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");

  // Track session for conversation continuity
  const sessionId = messages.length > 1 ? "chat-session" : undefined;
  const continueSession = messages.length > 1;

  // Create the stream first
  const stream = createUIMessageStream({
    execute: async (options) => {
      const { writer } = options;

      const claudeOptions: Options = {
        customSystemPrompt:
          "You are an assistant helping to modify code in a Next.js application. Be concise and focus on code changes.",

        permissionMode: "bypassPermissions",
      };

      // handle session continuation
      if (continueSession) {
        claudeOptions.continue = true;
      } else if (sessionId) {
        claudeOptions.resume = sessionId;
      }

      for await (const message of query({
        prompt,
        options: claudeOptions,
      })) {
        console.log("[chat/route] received message:", message.type);

        if (message.type === "assistant" && message.message?.content) {
          writer.write({
            type: "text-start",
            id: "0",
          });

          for (const part of message.message.content) {
            if (part.type === "text") {
              // Stream each text chunk as it arrives
              writer.write({
                type: "text-delta",
                delta: part.text,
                id: "0",
              });
            }
          }

          writer.write({
            type: "text-end",
            id: "0",
          });
        } else {
          // TODO: deal with user and system messages LATER.
          // writer.write({
          //   type: "text-start",
          //   id: "0",
          // });

          // if (message.type === "user") {
          //   writer.write({
          //     type: "text-delta",
          //     delta: message.message?.content?.[0]?.text || "no content",
          //     id: "0",
          //   });
          // }

          // if (message.type === "system") {
          //   writer.write({
          //     type: "text-delta",
          //     delta: message.cwd,
          //     id: "0",
          //   });
          // }

          // writer.write({
          //   type: "text-end",
          //   id: "0",
          // });
        }
      }

      // mock response for testing
      const mockResponse = `i got your message: "${prompt}". the chat is working! meow 🐱`;

      writer.write({
        type: "text-start",
        id: "0",
      });

      writer.write({
        type: "text-delta",
        delta: mockResponse,
        id: "0",
      });

      writer.write({
        type: "text-end",
        id: "0",
      });

      console.log("[chat/route] mock stream complete");
    },
  });

  // Return the response
  return createUIMessageStreamResponse({
    stream: stream,
  });
}
