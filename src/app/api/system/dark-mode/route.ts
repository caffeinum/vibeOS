import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";

const execAsync = promisify(exec);

export async function GET() {
  try {
    // only check dark mode on macos
    if (os.platform() !== "darwin") {
      // return a default value for non-macos systems
      return NextResponse.json({ isDark: false, unsupported: true });
    }
    
    // check current dark mode status using applescript
    const { stdout } = await execAsync(
      `osascript -e 'tell application "System Events" to tell appearance preferences to get dark mode'`
    );
    
    const isDark = stdout.trim() === "true";
    
    return NextResponse.json({ isDark });
  } catch (error) {
    console.error("failed to check dark mode:", error);
    // return a safe default instead of error
    return NextResponse.json({ isDark: false, error: "failed to check dark mode" });
  }
}

export async function POST(request: Request) {
  try {
    const { enable } = await request.json();
    
    // only toggle dark mode on macos
    if (os.platform() !== "darwin") {
      // return success but indicate it's unsupported
      return NextResponse.json({ success: true, isDark: enable, unsupported: true });
    }
    
    // toggle dark mode using applescript
    const command = enable 
      ? `osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to true'`
      : `osascript -e 'tell application "System Events" to tell appearance preferences to set dark mode to false'`;
    
    await execAsync(command);
    
    return NextResponse.json({ success: true, isDark: enable });
  } catch (error) {
    console.error("failed to toggle dark mode:", error);
    // return success with the requested state even if command fails
    return NextResponse.json({ success: true, isDark: false, error: "failed to toggle dark mode" });
  }
}