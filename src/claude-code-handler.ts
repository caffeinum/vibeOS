import { query } from '@anthropic-ai/claude-code';

interface ClaudeRequest {
  prompt: string;
  context?: unknown;
  sessionId?: string;
  continueSession?: boolean;
  maxTurns?: number;
}

export async function handleClaudeCodeRequest(request: ClaudeRequest) {
  const results: unknown[] = [];
  
  try {
    const options: Record<string, unknown> = {
      maxTurns: request.maxTurns || 3,
      customSystemPrompt: 'You are an assistant helping to modify code in a Next.js application. Be concise and focus on code changes.',
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
      if (message.type === 'result') {
        results.push({
          type: 'result',
          subtype: message.subtype,
          content: 'result' in message ? message.result : undefined,
          is_error: message.is_error,
          num_turns: message.num_turns,
          total_cost_usd: message.total_cost_usd,
          usage: message.usage,
          session_id: message.session_id,
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === 'assistant') {
        results.push({
          type: 'assistant',
          message: message.message,
          session_id: message.session_id,
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === 'user') {
        results.push({
          type: 'user',
          message: message.message,
          session_id: message.session_id,
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === 'system') {
        results.push({
          type: 'system',
          subtype: message.subtype,
          cwd: message.cwd,
          tools: message.tools,
          model: message.model,
          session_id: message.session_id,
          timestamp: new Date().toISOString(),
        });
      }
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