#!/usr/bin/env python3
"""
browser-use runner with streaming support
spawnable from node.js with streaming support
"""

import asyncio
import json
import os
import sys

# Set UTF-8 encoding for Windows
if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach())

try:
    from browser_use import Agent, BrowserSession
    from browser_use.llm import ChatAnthropic, ChatOpenAI
except ImportError as e:
    print(json.dumps({
        "type": "error",
        "error": f"Missing required dependencies: {e}. Please install browser-use and openai packages."
    }), flush=True)
    sys.exit(1)


async def main():
    """main entry point"""
    
    # parse config from stdin
    config_str = sys.stdin.read()
    config = json.loads(config_str)
    
    try:
        # Connect to Chrome via CDP
        browser_session = BrowserSession(cdp_url=config["cdp_url"])

        # Pick the LLM from the configured model. Previously no llm was passed
        # at all, so browser-use silently fell back to its OpenAI default and
        # the `model` sent by the caller was ignored.
        model = config.get("model") or "claude-sonnet-5"
        if model.startswith("claude"):
            llm = ChatAnthropic(model=model, api_key=os.environ.get("ANTHROPIC_API_KEY"))
        else:
            llm = ChatOpenAI(model=model, api_key=os.environ.get("OPENAI_API_KEY"))

        # Create agent
        agent = Agent(
            task=config["task"],
            browser_session=browser_session,
            llm=llm,
        )
        
        # Run agent
        result = await agent.run()
        
        # Convert result to string if it's not JSON serializable
        if hasattr(result, '__dict__'):
            result_str = str(result)
        else:
            result_str = str(result)
        
        # send completion signal
        print(json.dumps({
            "type": "complete",
            "content": result_str,
            "status": "success"
        }), flush=True)
            
    except Exception as e:
        print(json.dumps({
            "type": "error",
            "error": str(e)
        }), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
