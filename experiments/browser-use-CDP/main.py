#!/usr/bin/env python3
"""
Main script for browser automation using browser-use with CDP and persistent sessions.

This script uses a pre-saved authentication state to access websites like X.com
with an already logged-in session.

Usage:
    uv run main.py [session_name]
    
Examples:
    uv run main.py          # Uses default session
    uv run main.py social   # Uses social session
"""

import asyncio
import os
import sys
from pathlib import Path

from browser_use import Agent
from browser_use.browser import BrowserProfile, BrowserSession


# Configuration
SESSIONS_DIR = Path(__file__).parent / "sessions"
TARGET_URL = "https://x.com"


def get_session_file(session_name: str) -> Path:
    """Get the session file path for a given session name."""
    return SESSIONS_DIR / f"{session_name}.json"


async def create_browser_session(session_name: str = "default"):
    """Create a BrowserSession with persistent authentication state."""
    
    session_file = get_session_file(session_name)
    
    # Check if storage state exists
    if not session_file.exists():
        print(f"❌ Storage state file not found: {session_file}")
        print(f"💡 Run 'uv run setup_session.py {session_name} <url>' first to create session '{session_name}'!")
        return None
    
    print(f"✅ Loading session '{session_name}' from: {session_file}")
    
    # Create browser profile with storage state and stealth options
    profile = BrowserProfile(
        headless=False,  # Set to True for headless mode
        storage_state=str(session_file),  # Load cookies from saved state
        keep_alive=True,  # Don't close browser after agent finishes
        # Stealth options to avoid detection
        channel="chrome",  # Use real Chrome instead of Chromium
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-features=VizDisplayCompositor",
        ],
        extra_http_headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
    )
    
    # Create browser session
    session = BrowserSession(browser_profile=profile)
    await session.start()
    
    return session


async def run_browser_automation(session: BrowserSession):
    """Run browser automation tasks using the authenticated session."""
    
    # You'll need to configure your LLM here
    # For now, we'll use a placeholder - you need to add your actual LLM configuration
    print("⚠️  Note: You need to configure your LLM in the code below!")
    
    # Example with OpenAI (uncomment and configure):
    # from browser_use.llm import ChatOpenAI
    # llm = ChatOpenAI(model="gpt-4o-mini", api_key="your-api-key")
    
    # Example task - you can customize this
    task = f"Go to {TARGET_URL} and check if I'm logged in. If logged in, tell me what's on my timeline."
    
    print(f"🤖 Starting browser automation task: {task}")
    
    # Uncomment below when you have configured your LLM:
    """
    agent = Agent(
        task=task,
        llm=llm,
        browser_session=session,
    )
    
    result = await agent.run()
    print(f"✅ Task completed: {result}")
    """
    
    # For now, just navigate to the URL to demonstrate the session works
    page = await session.get_page()
    await page.goto(TARGET_URL)
    
    print(f"🌐 Navigated to {TARGET_URL}")
    print("🔍 Check the browser window - you should be logged in!")
    
    # Wait a bit so you can see the result
    await asyncio.sleep(5)


async def main():
    """Main function."""
    print("🚀 Browser Use CDP - Main Script")
    print("=" * 40)
    
    # Parse command line arguments
    session_name = sys.argv[1] if len(sys.argv) > 1 else "default"
    print(f"📂 Using session: {session_name}")
    
    # Create browser session with authentication
    session = await create_browser_session(session_name)
    if not session:
        return
    
    try:
        # Run browser automation
        await run_browser_automation(session)
        
    finally:
        # Clean up - close the session
        await session.close()
        print("🔄 Browser session closed")


if __name__ == "__main__":
    asyncio.run(main())
