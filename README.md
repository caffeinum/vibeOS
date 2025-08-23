# claude os

a containerized next.js application with claude code integration via trpc api

## features

- **next.js app** - built with bun, typescript, tailwind css
- **trpc api** - type-safe api for communication with claude code
- **claude code integration** - sends prompts to claude code sdk for code modification
- **docker support** - containerized deployment with docker and docker-compose
- **hot reload** - development environment with automatic reloading

## prerequisites

- bun (or npm/yarn)
- docker & docker-compose
- anthropic api key for claude code

## quick start

### local development

1. install dependencies:
```bash
bun install
```

2. set environment variable:
```bash
export ANTHROPIC_API_KEY="your-api-key"
```

3. run development server:
```bash
bun run dev
```

4. open http://localhost:3000

### docker development

1. create `.env` file:
```bash
echo "ANTHROPIC_API_KEY=your-api-key" > .env
```

2. run with docker-compose:
```bash
docker compose down && docker compose build --no-cache && docker compose up
```

3. open http://localhost:3000

## api usage

the app exposes a trpc endpoint at `/api/trpc/click.sendToClaudeCode` that accepts:

```typescript
{
  prompt: string,      // the prompt to send to claude code
  context?: any        // optional context data
}
```

response format:
```typescript
{
  success: boolean,
  results: Array<{
    type: 'result' | 'text' | 'tool_use',
    content: any,
    timestamp: string
  }>,
  request: object
}
```

## project structure

```
.
├── src/
│   ├── app/              # next.js app router
│   ├── server/           # trpc server & api
│   ├── utils/            # utility functions
│   └── claude-code-handler.ts  # claude code sdk integration
├── public/               # static assets
├── Dockerfile           # production docker image
├── Dockerfile.dev       # development docker image
└── docker-compose.yml   # docker compose configuration
```

## environment variables

- `ANTHROPIC_API_KEY` - required for claude code api access
- `NODE_ENV` - set to 'production' for production builds
- `PORT` - server port (default: 3000)

## troubleshooting

### docker build fails
- ensure bun.lock file exists (run `bun install` locally first)
- check docker daemon is running

### claude code errors
- verify anthropic api key is set correctly
- check api key has proper permissions

### app not loading
- ensure port 3000 is not in use
- check docker logs: `docker logs <container-name>`

## license

mit