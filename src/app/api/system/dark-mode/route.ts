import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET() {
  try {
    // check current dark mode status using applescript
    const { stdout } = await execAsync(
      `osascript -e 'tell application "System Events" to tell appearance preferences to get dark mode'`
    );
    
    const isDark = stdout.trim() === "true";
    
    return NextResponse.json({ isDark });
  } catch (error) {
    console.error("failed to check dark mode:", error);
    return NextResponse.json({ error: "failed to check dark mode" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { enable } = await request.json();
    
    // toggle dark mode using applescript
    const command = enable 
      ? `osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to true'`
      : `osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to false'`;
    
    await execAsync(command);
    
    return NextResponse.json({ success: true, isDark: enable });
  } catch (error) {
    console.error("failed to toggle dark mode:", error);
    return NextResponse.json({ error: "failed to toggle dark mode" }, { status: 500 });
  }
}