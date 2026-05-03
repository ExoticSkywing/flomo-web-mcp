# Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `flomo-mcp` into a public GitHub and npm-publishable MCP server project with clear docs, package metadata, CI, and security guidance.

**Architecture:** Keep runtime TypeScript source and MCP behavior unchanged. Add delivery files around the existing server: npm package metadata, user-facing docs, GitHub workflows/templates, and publish verification.

**Tech Stack:** Node.js 20+, TypeScript, npm, Vitest, MCP SDK, GitHub Actions.

---

## File Structure

- Modify: `package.json` for public npm metadata, `files`, and package scripts.
- Modify: `README.md` into a user-facing package handoff.
- Create: `LICENSE` with MIT license text.
- Create: `CONTRIBUTING.md` with setup, testing, style, and credential rules.
- Create: `SECURITY.md` with sensitive-data handling and reporting guidance.
- Create: `CHANGELOG.md` with an unreleased entry for the current readiness pass.
- Create: `.github/workflows/ci.yml` for Node 20 verification.
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`.
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`.
- Create: `.github/pull_request_template.md`.

## Task 1: Package Metadata

**Files:**
- Modify: `package.json`

- [ ] Remove `private: true`.
- [ ] Add `"license": "MIT"`.
- [ ] Add keywords: `mcp`, `model-context-protocol`, `flomo`, `typescript`, `stdio`.
- [ ] Add `files` allowlist for `dist`, `src`, specific script files, public docs, `.env.example`, `README.md`, `LICENSE`, `CHANGELOG.md`.
- [ ] Keep `bin.flomo-mcp` as `./dist/index.js`.
- [ ] Run `npm run typecheck`.

## Task 2: User-Facing Documentation

**Files:**
- Modify: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CHANGELOG.md`

- [ ] Rewrite README around purpose, requirements, quick start, MCP configuration, tools, sync boundary, security, verification, and endpoint maintenance.
- [ ] Add MIT license.
- [ ] Add contribution guide with setup commands and commit style.
- [ ] Add security guide covering `FLOMO_AUTHORIZATION`, `FLOMO_COOKIE`, private memo content, and endpoint instability.
- [ ] Add changelog with `Unreleased` entry for project delivery readiness.
- [ ] Run `npm run typecheck:test` and `npm test`.

## Task 3: GitHub Project Assets

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/ISSUE_TEMPLATE/bug_report.md`
- Create: `.github/ISSUE_TEMPLATE/feature_request.md`
- Create: `.github/pull_request_template.md`

- [ ] Add GitHub Actions CI on push and pull request.
- [ ] Use `actions/setup-node` with Node 20 and npm cache.
- [ ] Run `npm ci`, `npm run typecheck`, `npm run typecheck:test`, `npm test`, `npm run test:python`, `npm run build`, `npm run smoke:stdio`, and `npm audit --audit-level=moderate`.
- [ ] Add bug report template that asks for runtime, host, tool, expected/actual behavior, sanitized logs, and verification commands.
- [ ] Add feature request template focused on use case, proposed tool/API behavior, and security implications.
- [ ] Add PR template requiring description, checks run, endpoint assumptions, and security review.
- [ ] Run `npm run build` and `npm run smoke:stdio`.

## Task 4: Publish Verification

**Files:**
- Inspect package output only.

- [ ] Run `npm pack --dry-run`.
- [ ] Confirm package output includes `dist/index.js`, source/docs, README, LICENSE, and changelog.
- [ ] Confirm package output excludes `.env`, `node_modules`, `coverage`, and generated local-only artifacts.
- [ ] Run final verification:

```bash
npm run typecheck
npm run typecheck:test
npm test
npm run test:python
npm run build
npm run smoke:stdio
npm audit --audit-level=moderate
```

- [ ] Commit implementation with `chore: prepare project for public release`.
