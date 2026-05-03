# Release Readiness Design

## Goal

Prepare `flomo-mcp` as a public GitHub project and npm-publishable Node.js package that users can install, verify, and configure without relying on private local knowledge.

## Scope

This release-readiness pass focuses on project packaging, public documentation, GitHub collaboration assets, security guidance, and automated verification. It does not change MCP tool behavior, flomo Web adapter logic, credential handling semantics, or parser behavior.

## Approach

Use a complete but conservative delivery standard:

- Keep the existing TypeScript MCP server architecture unchanged.
- Treat `dist/` as the npm runtime artifact produced by `npm run build`, not as committed source.
- Publish only source, public docs, specific scripts, package metadata, and generated build output through npm's package `files` allowlist.
- Make README user-facing first, with development notes moved behind links to `docs/`.
- Add GitHub CI and contribution templates so the repository is usable as an open project immediately after upload.

## Package Metadata

`package.json` should be adjusted for public package readiness:

- Remove `private: true`.
- Add `license`.
- Add search-friendly keywords for MCP, flomo, TypeScript, and stdio.
- Add npm package `files` entries that include `dist`, source, public docs, specific scripts, README, license, and environment example while excluding local credentials, dependency folders, Python bytecode, and internal planning docs.
- Keep the current `bin.flomo-mcp` entry pointing to `./dist/index.js`.
- Avoid fake repository, bugs, or homepage URLs if the final GitHub remote URL is not known.

## Documentation

README should become the main user handoff:

- Explain what the server does and that it relies on flomo Web session credentials.
- Show install-from-source and package-consumer flows.
- Show MCP client stdio configuration with placeholders, not real credentials.
- List available tools and the full-sync boundary.
- Document verification commands.
- State compatibility requirements: Node.js 20 or newer and stdio MCP host support.
- Keep endpoint maintenance notes but frame them as non-official flomo Web API assumptions.

Supporting docs should be added:

- `LICENSE` for open-source use.
- `CONTRIBUTING.md` for local setup, testing, commit style, and credential hygiene.
- `SECURITY.md` for vulnerability reporting and sensitive data rules.
- `CHANGELOG.md` for release history starting with the current unreleased state.

## GitHub Assets

Add GitHub project assets:

- `.github/workflows/ci.yml` running install, typecheck, tests, build, stdio smoke, and moderate audit.
- `.github/ISSUE_TEMPLATE/bug_report.md`.
- `.github/ISSUE_TEMPLATE/feature_request.md`.
- `.github/pull_request_template.md`.

The CI should use `npm ci` and Node.js 20. It should not require flomo credentials because the existing smoke test only validates server startup, tool discovery, and `ping`.

## Security Design

Public materials must avoid private memo content, `FLOMO_AUTHORIZATION`, `FLOMO_COOKIE`, raw flomo responses, and logs containing credentials. `.env` and `.env.*` remain ignored except `.env.example`.

Docs should explicitly state that flomo Web endpoints are internal and may change. Endpoint-specific knowledge stays inside clients, parsers, and the maintenance notes.

## Verification

The implementation is complete only after these commands pass:

```bash
npm run typecheck
npm run typecheck:test
npm test
npm run test:python
npm run build
npm run smoke:stdio
npm audit --audit-level=moderate
```

The final review should also inspect `npm pack --dry-run` output to confirm the publishable package does not include `.env`, `node_modules`, `coverage`, or unrelated generated artifacts.
