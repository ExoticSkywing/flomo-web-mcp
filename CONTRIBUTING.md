# Contributing

This project is a third-party MCP stdio server for flomo Web. It is not affiliated with flomo.

## Local Setup

```bash
npm install
npm run build
npm run verify
```

Use Node.js 20 or newer.

## Development Workflow

- Keep runtime changes in `src/` and tests in `tests/`.
- Run `npm run verify` before opening a pull request.
- Do not commit `.env`, tokens, cookies, memo content, HAR files, or raw flomo responses.
- Keep MCP tool documentation aligned with `src/server.ts` and `scripts/smoke-stdio.mjs`.
- Prefer small pull requests with a clear problem statement and verification notes.

## Package Boundary

The GitHub repository contains source, tests, and maintenance files. The npm package is intentionally limited by `package.json#files` to runtime files and user-facing docs.
