#!/usr/bin/env python3
"""
Example workflow demonstrating the complete browser-use CDP setup.

This shows the full process:
1. Setup authentication session
2. Use the saved session for automation
3. Handle errors and edge cases

Usage:
    uv run example_workflow.py
"""

import asyncio
import subprocess
import sys
from pathlib import Path

from browser_use.browser import BrowserProfile, BrowserSession


async def example_workflow():
    """Complete example of browser-use CDP workflow."""
    
    print("🚀 Browser Use CDP - Complete Workflow Example")
    print("=" * 55)
    
    sessions_dir = Path(__file__).parent / "sessions"
    storage_state_file = sessions_dir / "auth_state.json"
    
    # Step 1: Check if we have saved authentication
    if not storage_state_file.exists():
        print("📋 Step 1: Setting up authentication session")
        print("-" * 40)
        
        response = input("No saved session found. Would you like to set one up? (y/n): ")
        if response.lower() == 'y':
            print("Opening browser for manual login...")
            try:
                subprocess.run([
                    "uv", "run", "setup_session.py"
                ], check=True)
            except subprocess.CalledProcessError:
                print("❌ Failed to run setup script")
                return
        else:
            print("❌ Cannot proceed without authentication session")
            return
    
    # Step 2: Create browser session with saved authentication
    print("\n📋 Step 2: Creating browser session with saved authentication")
    print("-" * 55)
    
    try:
        profile = BrowserProfile(
            headless=False,
            storage_state=str(storage_state_file),
            keep_alive=True,
            # Stealth options to avoid detection
            channel="chrome",
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-features=VizDisplayCompositor",
            ],
            extra_http_headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
        )
        
        session = BrowserSession(browser_profile=profile)
        await session.start()
        
        print("✅ Browser session created successfully")
        
        # Step 3: Navigate to target site
        print("\n📋 Step 3: Navigating to X.com with authenticated session")
        print("-" * 50)
        
        page = await session.get_page()
        await page.goto("https://x.com", wait_until="load")
        
        print("✅ Navigated to X.com")
        print("🔍 Check the browser - you should be logged in!")
        
        # Step 4: Optional - Check authentication status
        print("\n📋 Step 4: Checking authentication status")
        print("-" * 40)
        
        # Try to find elements that indicate logged-in status
        try:
            # This is X.com specific - looks for compose tweet button
            compose_button = await page.wait_for_selector('[data-testid="SideNav_NewTweet_Button"]', timeout=5000)
            if compose_button:
                print("✅ Successfully authenticated - found compose button")
            else:
                print("⚠️  Compose button not found - may not be logged in")
        except Exception as e:
            print(f"⚠️  Could not verify login status: {e}")
        
        # Step 5: Keep browser open for inspection
        print("\n📋 Step 5: Browser ready for automation")
        print("-" * 35)
        print("🎉 Setup complete! The browser is ready for automation.")
        print("💡 You can now add your LLM configuration and automation tasks to main.py")
        
        input("\nPress Enter to close the browser...")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        
    finally:
        # Clean up
        try:
            await session.close()
            print("🔄 Browser session closed")
        except:
            pass


if __name__ == "__main__":
    asyncio.run(example_workflow())
