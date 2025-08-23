#!/usr/bin/env python3
"""
Setup script to create a browser session with authenticated state.

This script opens a browser where you can log into websites like X.com,
then saves the authentication cookies/session data to be reused later.

Usage:
    uv run setup_session.py [session_name] [url]
    
Examples:
    uv run setup_session.py default x.com
    uv run setup_session.py social instagram.com
    uv run setup_session.py work github.com
"""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

SESSIONS_DIR = Path(__file__).parent / "sessions"


def get_session_file(session_name: str) -> Path:
    """Get the session file path for a given session name."""
    return SESSIONS_DIR / f"{session_name}.json"


def open_browser_for_login(session_name: str, site_url: str):
    """
    Opens a browser using playwright CLI to manually log in and save storage state.
    
    Args:
        session_name: Name of the session (used for filename)
        site_url: The website to open for authentication
    """
    session_file = get_session_file(session_name)
    
    print(f"📂 Session: {session_name}")
    print(f"🌐 Opening browser to {site_url} for manual login...")
    
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
    
    # Build playwright CLI command with stealth options
    cmd = [
        "playwright",
        "open",
        site_url,
        "--save-storage",
        str(session_file),
        "--channel=chrome",  # Use real Chrome instead of Chromium
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ]
    
    # If session file exists, also load it so we preserve existing cookies
    if session_file.exists():
        cmd.extend(["--load-storage", str(session_file)])
    
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(f"✅ Browser session saved to {session_file}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running playwright: {e}")
        print(f"stderr: {e.stderr}")
        print("\n💡 Make sure playwright is installed and browsers are installed:")
        print("   uv add playwright")
        print("   playwright install")
        return False
    except FileNotFoundError:
        print("❌ playwright command not found!")
        print("💡 Install playwright first:")
        print("   uv add playwright") 
        print("   playwright install")
        return False


def verify_storage_state(session_file: Path):
    """Verify that the storage state file was created successfully."""
    if session_file.exists():
        size = session_file.stat().st_size
        print(f"✅ Storage state file exists: {session_file} ({size} bytes)")
        return True
    else:
        print(f"❌ Storage state file not found: {session_file}")
        return False


def parse_args():
    """Parse command line arguments."""
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
        print("Usage: uv run setup_session.py [session_name] [url]")
        print("Examples:")
        print("  uv run setup_session.py")
        print("  uv run setup_session.py default")
        print("  uv run setup_session.py social x.com")
        print("  uv run setup_session.py work github.com")
        sys.exit(1)


def main():
    """Main setup function."""
    print("🚀 Browser Use CDP Session Setup")
    print("=" * 50)
    
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
    
    success = open_browser_for_login(session_name, site_url)
    
    if success:
        verify_storage_state(session_file)
        print(f"\n🎉 Setup complete! Session '{session_name}' ready for use.")
        print(f"💡 To add more sites to this session: uv run setup_session.py {session_name} <new_url>")
        print(f"💡 Use main.py with: uv run main.py {session_name}")
    else:
        print("\n💥 Setup failed. Please check the error messages above.")


if __name__ == "__main__":
    main()
