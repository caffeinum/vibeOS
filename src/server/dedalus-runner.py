#!/usr/bin/env python3
"""
dedalus runner with mcp integration and local tools
spawnable from node.js with streaming support
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from dedalus_labs import AsyncDedalus, DedalusRunner
from dedalus_labs.utils.streaming import stream_async


class LocalTools:
    """local filesystem and bash tools"""
    
    @staticmethod
    def bash(command: str) -> Dict[str, Any]:
        """execute bash command"""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=30
            )
            return {
                "success": True,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "returncode": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "command timed out after 30 seconds"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def read_file(file_path: str) -> Dict[str, Any]:
        """read contents of a file"""
        try:
            path = Path(file_path).expanduser().resolve()
            if not path.exists():
                return {
                    "success": False,
                    "error": f"file not found: {file_path}"
                }
            
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            return {
                "success": True,
                "content": content,
                "path": str(path)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def edit_file(file_path: str, old_content: str, new_content: str) -> Dict[str, Any]:
        """edit file by replacing old content with new content"""
        try:
            path = Path(file_path).expanduser().resolve()
            
            if not path.exists():
                return {
                    "success": False,
                    "error": f"file not found: {file_path}"
                }
            
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if old_content not in content:
                return {
                    "success": False,
                    "error": "old content not found in file"
                }
            
            updated_content = content.replace(old_content, new_content)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(updated_content)
            
            return {
                "success": True,
                "path": str(path),
                "message": "file updated successfully"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def write_file(file_path: str, content: str) -> Dict[str, Any]:
        """write content to a file"""
        try:
            path = Path(file_path).expanduser().resolve()
            path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            return {
                "success": True,
                "path": str(path),
                "message": "file written successfully"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def list_directory(directory: str = ".") -> Dict[str, Any]:
        """list contents of a directory"""
        try:
            path = Path(directory).expanduser().resolve()
            
            if not path.exists():
                return {
                    "success": False,
                    "error": f"directory not found: {directory}"
                }
            
            if not path.is_dir():
                return {
                    "success": False,
                    "error": f"not a directory: {directory}"
                }
            
            items = []
            for item in path.iterdir():
                items.append({
                    "name": item.name,
                    "type": "directory" if item.is_dir() else "file",
                    "size": item.stat().st_size if item.is_file() else None
                })
            
            return {
                "success": True,
                "path": str(path),
                "items": items
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


class DedalusStreamRunner:
    """runner for dedalus with streaming support"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("DEDALUS_API_KEY")
        if not self.api_key:
            raise ValueError("dedalus api key required")
        
        self.client = AsyncDedalus(api_key=self.api_key)
        self.runner = DedalusRunner(self.client)
        self.local_tools = LocalTools()
    
    def _create_local_tools(self) -> List[Any]:
        """create local tool definitions for dedalus"""
        return [
            self.local_tools.bash,
            self.local_tools.read_file,
            self.local_tools.edit_file,
            self.local_tools.write_file,
            self.local_tools.list_directory
        ]
    
    async def run_streaming(
        self,
        input_text: str,
        model: str = "openai/gpt-4o-mini",
        mcp_servers: Optional[List[str]] = None,
        use_local_tools: bool = True
    ):
        """run dedalus with streaming output"""
        
        # prepare tools
        tools = self._create_local_tools() if use_local_tools else []
        
        # prepare mcp servers
        mcp_servers = mcp_servers or []
        
        try:
            # create streaming response
            response = await self.runner.run(
                input=input_text,
                model=model,
                tools=tools,
                mcp_servers=mcp_servers,
                stream=True
            )
            
            # stream output to stdout for node.js to capture
            async for chunk in stream_async(response):
                # output json lines for easy parsing
                output = {
                    "type": "chunk",
                    "content": chunk
                }
                print(json.dumps(output), flush=True)
            
            # send completion signal
            print(json.dumps({
                "type": "complete",
                "status": "success"
            }), flush=True)
            
        except Exception as e:
            # send error
            print(json.dumps({
                "type": "error",
                "error": str(e)
            }), flush=True)
            sys.exit(1)
    
    async def run_sync(
        self,
        input_text: str,
        model: str = "openai/gpt-4o-mini",
        mcp_servers: Optional[List[str]] = None,
        use_local_tools: bool = True
    ):
        """run dedalus synchronously"""
        
        # prepare tools
        tools = self._create_local_tools() if use_local_tools else []
        
        # prepare mcp servers
        mcp_servers = mcp_servers or []
        
        try:
            result = await self.runner.run(
                input=input_text,
                model=model,
                tools=tools,
                mcp_servers=mcp_servers,
                stream=False
            )
            
            # output result
            print(json.dumps({
                "type": "complete",
                "content": result.final_output,
                "status": "success"
            }), flush=True)
            
        except Exception as e:
            print(json.dumps({
                "type": "error",
                "error": str(e)
            }), flush=True)
            sys.exit(1)


async def main():
    """main entry point"""
    
    # parse arguments from stdin or command line
    if len(sys.argv) > 1:
        # command line mode
        config = {
            "input": sys.argv[1],
            "model": sys.argv[2] if len(sys.argv) > 2 else "openai/gpt-4o-mini",
            "stream": sys.argv[3].lower() == "true" if len(sys.argv) > 3 else True,
            "mcp_servers": sys.argv[4].split(",") if len(sys.argv) > 4 else [],
            "use_local_tools": sys.argv[5].lower() == "true" if len(sys.argv) > 5 else True
        }
    else:
        # stdin mode for json config
        config_str = sys.stdin.read()
        config = json.loads(config_str)
    
    # get api key from env or config
    api_key = config.get("api_key") or os.getenv("DEDALUS_API_KEY")
    
    # create runner
    runner = DedalusStreamRunner(api_key=api_key)
    
    # run based on stream mode
    if config.get("stream", True):
        await runner.run_streaming(
            input_text=config["input"],
            model=config.get("model", "openai/gpt-4o-mini"),
            mcp_servers=config.get("mcp_servers", []),
            use_local_tools=config.get("use_local_tools", True)
        )
    else:
        await runner.run_sync(
            input_text=config["input"],
            model=config.get("model", "openai/gpt-4o-mini"),
            mcp_servers=config.get("mcp_servers", []),
            use_local_tools=config.get("use_local_tools", True)
        )


if __name__ == "__main__":
    asyncio.run(main())