# Contributing

感谢你改进 `flomo-mcp`。本项目是本地优先的 flomo MCP stdio server，贡献时请优先保护凭据和 memo 隐私。

## 本地设置

```bash
npm install
cp .env.example .env
```

Windows PowerShell:

```powershell
npm install
Copy-Item .env.example .env
```

只在本地 `.env` 中填写真实凭据。不要提交 `.env`、`FLOMO_AUTHORIZATION`、`FLOMO_COOKIE`、原始 memo 内容或 flomo 响应日志。

## 开发命令

```bash
npm run dev
npm run typecheck
npm run typecheck:test
npm test
npm run test:python
npm run build
npm run smoke:stdio
```

完整验收：

```bash
npm run verify
```

## 代码风格

- 使用 TypeScript strict mode、ES modules 和 NodeNext resolution。
- 本地 TypeScript import 保留 `.js` 扩展名。
- 使用 2 空格缩进和分号。
- 函数和变量使用 `camelCase`，类型和类使用 `PascalCase`。
- MCP tools 保持薄封装：校验输入、调用 client、映射错误，不暴露 flomo 内部响应细节。

## 测试要求

- Vitest 测试放在 `tests/*.test.ts`。
- parser、client、tool 行为变化都需要补充或更新测试。
- fixture 必须确定性，且不得包含私密 memo 内容、Authorization header 或 Cookie。
- adapter 变化至少覆盖响应结构变化、错误映射和缓存失效相关行为。

## Commit

使用短 Conventional Commit 风格：

```text
type: concise imperative summary
```

示例：

```text
test: cover memo parser fallback
docs: clarify mcp setup
fix: redact authorization from logs
```

## Pull Request

PR 请包含：

- 变更说明。
- 关联 issue 或任务。
- 已运行的测试命令。
- flomo Web endpoint 假设或抓包依据。
- 安全检查说明，确认没有提交凭据、私密 memo 或原始响应日志。
