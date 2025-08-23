import { query, type Options } from "@anthropic-ai/claude-code";

export interface ClaudeRequest {
  prompt: string;
  context?: unknown;
  sessionId?: string;
  continueSession?: boolean;
}

export async function handleClaudeCodeRequest(request: ClaudeRequest) {
  const options: Options = {
    customSystemPrompt:
      "You are an assistant helping to modify code in a Next.js application. Be concise and focus on code changes.",

    permissionMode: "bypassPermissions",
  };

  // handle session continuation
  if (request.continueSession) {
    options.continue = true;
  } else if (request.sessionId) {
    options.resume = request.sessionId;
  }

  return query({
    prompt: request.prompt,
    options,
  });
}
