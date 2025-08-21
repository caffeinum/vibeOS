import { query, SDKMessage, type Options } from '@anthropic-ai/claude-code';

export interface ClaudeRequest {
  prompt: string;
  context?: unknown;
  sessionId?: string;
  continueSession?: boolean;
  maxTurns?: number;
}

export async function handleClaudeCodeRequest(request: ClaudeRequest) {
  const results: SDKMessage[] = [];
  
  try {
    const options: Options = {
      maxTurns: request.maxTurns || 3,
      customSystemPrompt: 'You are an assistant helping to modify code in a Next.js application. Be concise and focus on code changes.',

      allowedTools: ['file', 'directory', 'git', 'http', 'https'],
    };
    
    // handle session continuation
    if (request.continueSession) {
      options.continue = true;
    } else if (request.sessionId) {
      options.resume = request.sessionId;
    }
    
    for await (const message of query({
      prompt: request.prompt,
      options,
    })) {
      results.push(message);
    }
    
    return {
      success: true,
      results,
      request,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      request,
    };
  }
}