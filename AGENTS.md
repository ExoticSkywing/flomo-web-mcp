# Repository Guidelines

## Project Structure & Module Organization

This is a Node.js 20+ TypeScript MCP server for flomo. `src/index.ts` starts the stdio server, and `src/server.ts` wires tools to clients. Tool registrations live in `src/tools/`; flomo Web adapters live in `src/clients/`; parsers, models, types, utilities, and environment loading live in `src/parsers/`, `src/models/`, `src/types/`, `src/utils/`, and `src/config/`. Tests are in `tests/*.test.ts`. Development notes and Mermaid/SVG assets are under `docs/`. Generated or local-only paths such as `dist/`, `node_modules/`, `coverage/`, and `.env*` are ignored.

## Build, Test, and Development Commands

- `npm install` installs dependencies from `package-lock.json`.
- `npm run dev` runs `src/index.ts` through `tsx`.
- `npm run typecheck` runs `tsc` without emitting files.
- `npm test` runs Vitest once.
- `npm run build` compiles to `dist/`.
- `npm start` runs `dist/index.js`; build first.

## Coding Style & Naming Conventions

Use strict TypeScript with ES modules and NodeNext resolution. Keep `.js` extensions on local TypeScript imports. Use 2-space indentation, semicolons, `camelCase` for functions and variables, `PascalCase` for classes and types, and descriptive filenames such as `flomoReadClient.ts` or `searchNotes.ts`. Keep MCP tools thin: validate inputs, call clients, and map errors without exposing raw flomo internals.

No lint or formatter script is currently configured, so match nearby code style and run `npm run typecheck` before submitting.

## Testing Guidelines

Vitest is the test framework. Add or update `tests/<area>.test.ts` for parser, client, and tool behavior. Use deterministic fixtures that exclude private memo content, Authorization headers, and Cookies. Run:

```bash
npm run typecheck
npm test
npm run build
```

For adapter changes, test response-shape changes, error mapping, and cache invalidation where relevant.

## Commit & Pull Request Guidelines

The existing history uses short Conventional Commit style messages such as `docs: add Windows migration handoff`. Use `type: concise imperative summary`, for example `test: cover memo parser fallback`.

Pull requests should include a brief description, linked issue or task when available, test commands run, and notes about flomo Web endpoint assumptions. Include screenshots only for documentation diagrams or other visual assets.

## Security & Configuration Tips

Copy `.env.example` to `.env` for local credentials. Never commit `.env`, `FLOMO_AUTHORIZATION`, `FLOMO_COOKIE`, raw private memo content, or debug logs containing flomo responses. Treat flomo Web endpoints as unstable internal APIs and keep endpoint-specific logic inside clients and parsers.
