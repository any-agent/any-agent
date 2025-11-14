- Make sure you have docker or podman installed.
- follow the instructions in `packages/tools/supervisor/.env.example` depending on your arch/choices
- exec `bun run --filter @any-agent/tools-worker build`
- exec `bun run --filter @any-agent/tools-supervisor start`

You should be able to reach the debug panel at: http://localhost:8080/debug

If you have made code changes to the supervisor restart with `bun run --filter @any-agent/tools-supervisor restart`

If you make changes to the tool images then rebuild them but you do not need to restart anything.

When finished shutdown the tool supervisor: `bun run --filter @any-agent/tools-supervisor stop`

