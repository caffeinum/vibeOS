import type { UIMessage } from "ai";
import { query, type Options } from "@anthropic-ai/claude-code";

export const maxDuration = 60 * 1000;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  
  // Get the last user message
  const lastMessage = messages[messages.length - 1];

  console.log("[chat/route] received message:", lastMessage);

  const prompt = lastMessage.parts.filter(part => part.type === "text").map((part) => part.text).join("\n");
  
  // Track session for conversation continuity
  const sessionId = messages.length > 1 ? "chat-session" : undefined;
  const continueSession = messages.length > 1;

  const options: Options = {
    customSystemPrompt:
      "You are an assistant helping to modify code in a Next.js application. Be concise and focus on code changes.",
  
    permissionMode: "bypassPermissions",
  };
  
  // handle session continuation
  if (continueSession) {
    options.continue = true;
  } else if (sessionId) {
    options.resume = sessionId;
  }

  // Create a readable stream for the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        console.log("[chat/route] starting stream for prompt:", prompt);

        let assistantText = "";

        for await (const message of query({
          prompt,
          options,
        })) {
          console.log("[chat/route] received message:", message.type);

          if (message.type === "assistant" && message.message?.content) {
            for (const part of message.message.content) {
              if (part.type === "text") {
                // Stream each text chunk as it arrives
                assistantText += part.text;
                controller.enqueue(encoder.encode(part.text));
              }
            }
          }
        }
        
        console.log("[chat/route] stream complete, total text:", assistantText.length);
        controller.close();
      } catch (error) {
        console.error("[chat/route] error in stream:", error);
        controller.error(error);
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}