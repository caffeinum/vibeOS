#!/usr/bin/env python3
"""
Stealth setup script using patchright for better detection avoidance.

This version uses patchright (stealth playwright) which is better at avoiding 
detection by websites that block automated browsers.
"""

import asyncio
import os
from pathlib import Path

try:
    from patchright.async_api import async_playwright
    PATCHRIGHT_AVAILABLE = True
except ImportError:
    from playwright.async_api import async_playwright
    PATCHRIGHT_AVAILABLE = False


SESSIONS_DIR = Path(__file__).parent / "sessions"


def get_session_file(session_name: str) -> Path:
    """Get the session file path for a given session name."""
    return SESSIONS_DIR / f"{session_name}.json"


async def open_stealth_browser_for_login(session_name: str, site_url: str):
    """
    Opens a stealth browser for manual login and saves storage state.
    
    Args:
        session_name: Name of the session (used for filename)
        site_url: The website to open for authentication
    """
    session_file = get_session_file(session_name)
    
    print(f"📂 Session: {session_name}")
    print(f"🥷 Opening stealth browser to {site_url} for manual login...")
    if not PATCHRIGHT_AVAILABLE:
        print("⚠️  patchright not available, falling back to regular playwright")
        print("💡 Install patchright for better stealth: uv add patchright")
    
    # Check if session already exists
    if session_file.exists():
        print(f"✅ Found existing session file: {session_file}")
        print("🔄 Will add new login to existing session")
    else:
        print(f"🆕 Creating new session file: {session_file}")
    
    print("Please log in to your accounts in the browser.")
    print("When done, close the browser window to save the session state.")
    
    # Create sessions directory if it doesn't exist
    SESSIONS_DIR.mkdir(exist_ok=True)
    
    async with async_playwright() as playwright:
        # Launch browser with stealth options
        browser = await playwright.chromium.launch(
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-features=VizDisplayCompositor",
                "--disable-features=TranslateUI", 
                "--disable-ipc-flooding-protection",
                "--disable-renderer-backgrounding",
                "--disable-backgrounding-occluded-windows",
                "--disable-client-side-phishing-detection",
                "--disable-default-apps",
                "--disable-hang-monitor",
                "--disable-popup-blocking",
                "--disable-prompt-on-repost",
                "--disable-sync",
                "--metrics-recording-only",
                "--no-first-run",
                "--disable-background-timer-throttling",
                "--disable-background-networking",
                "--disable-device-discovery-notifications",
            ]
        )
        
        # Create context with stealth settings and existing storage if available
        context_options = {
            "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "viewport": {"width": 1920, "height": 1080},
            "locale": "en-US",
            "timezone_id": "America/New_York",
        }
        
        # Load existing storage state if available
        if session_file.exists():
            context_options["storage_state"] = str(session_file)
        
        context = await browser.new_context(**context_options)
        
        # Remove webdriver property
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        """)
        
        page = await context.new_page()
        
        # Navigate to the target site
        await page.goto(site_url)
        
        print("🌐 Browser opened. Please complete your login manually.")
        print("⏳ Waiting for you to close the browser...")
        
        # Wait for user to close the browser
        try:
            await page.wait_for_event("close", timeout=0)  # Wait indefinitely
        except:
            pass  # Browser was closed
        
        # Save storage state before closing
        await context.storage_state(path=str(session_file))
        await browser.close()
        
        print(f"✅ Stealth browser session saved to {session_file}")
        return True


def parse_args():
    """Parse command line arguments."""
    import sys
    if len(sys.argv) == 1:
        # No arguments - interactive mode
        return None, None
    elif len(sys.argv) == 2:
        # One argument - could be session_name or URL
        arg = sys.argv[1]
        if arg.startswith("http"):
            # It's a URL
            return "default", arg
        else:
            # It's a session name
            return arg, "https://x.com"
    elif len(sys.argv) == 3:
        # Two arguments - session_name and URL
        session_name = sys.argv[1]
        url = sys.argv[2]
        # Add https:// if not present
        if not url.startswith("http"):
            url = f"https://{url}"
        return session_name, url
    else:
        print("❌ Too many arguments!")
        print("Usage: uv run setup_session_stealth.py [session_name] [url]")
        sys.exit(1)


async def main():
    """Main setup function."""
    print("🥷 Browser Use CDP - Stealth Session Setup")
    print("=" * 45)
    
    # Parse command line arguments
    session_name, site_url = parse_args()
    
    # Interactive mode if no args provided
    if session_name is None:
        print("\n💡 Interactive Setup Mode")
        session_name = input("Enter session name (default: 'default'): ").strip() or "default"
        site_url = input("Enter URL to authenticate with (default: https://x.com): ").strip() or "https://x.com"
        if not site_url.startswith("http"):
            site_url = f"https://{site_url}"
    
    print(f"\n📋 Configuration:")
    print(f"   Session: {session_name}")
    print(f"   URL: {site_url}")
    
    session_file = get_session_file(session_name)
    
    try:
        await open_stealth_browser_for_login(session_name, site_url)
        
        # Verify the file was created
        if session_file.exists():
            size = session_file.stat().st_size
            print(f"✅ Storage state file exists: {session_file} ({size} bytes)")
            print(f"\n🎉 Stealth setup complete! Session '{session_name}' ready for use.")
            print(f"💡 To add more sites: uv run setup_session_stealth.py {session_name} <new_url>")
            print(f"💡 Use main.py with: uv run main.py {session_name}")
        else:
            print("❌ Storage state file not found - something went wrong")
            
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    asyncio.run(main())
