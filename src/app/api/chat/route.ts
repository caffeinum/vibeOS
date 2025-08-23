import { query, type Options } from "@anthropic-ai/claude-code";
import type { ContentBlockParam, ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages/messages";
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

  // Build prompt with support for images and text
  const contentBlocks: ContentBlockParam[] = [];
  
  for (const part of lastMessage.parts) {
    console.log("[chat/route] processing part:", part.type);
    
    if (part.type === "text") {
      const textBlock: TextBlockParam = {
        type: "text",
        text: part.text
      };
      contentBlocks.push(textBlock);
    } else if (part.type === "image") {
      const imageBlock: ImageBlockParam = {
        type: "image",
        source: {
          type: "base64",
          media_type: part.mimeType || "image/jpeg",
          data: part.image,
        },
      };
      contentBlocks.push(imageBlock);
    }
  }

  console.log("[chat/route] content blocks to send:", JSON.stringify(contentBlocks).slice(0, 200));

  // For backward compatibility, if only text parts exist, use a simple string
  const prompt = contentBlocks.length === 1 && contentBlocks[0].type === "text" 
    ? contentBlocks[0].text
    : contentBlocks;

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

      console.log("[chat/route] stream complete");
    },
  });

  // Return the response
  return createUIMessageStreamResponse({
    stream: stream,
  });
}
