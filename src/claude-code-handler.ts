import { query } from '@anthropic-ai/claude-code';

interface ClaudeRequest {
  prompt: string;
  context?: any;
}

export async function handleClaudeCodeRequest(request: ClaudeRequest) {
  const results: any[] = [];
  
  try {
    for await (const message of query({
      prompt: request.prompt,
      options: {
        maxTurns: 3,
        systemPrompt: 'You are an assistant helping to modify code in a Next.js application. Be concise and focus on code changes.',
      }
    })) {
      if (message.type === 'result') {
        results.push({
          type: 'result',
          content: message.result,
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === 'text') {
        results.push({
          type: 'text',
          content: message.text,
          timestamp: new Date().toISOString(),
        });
      } else if (message.type === 'tool_use') {
        results.push({
          type: 'tool_use',
          tool: message.tool,
          input: message.input,
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