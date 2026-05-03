# flomo-mcp

`flomo-mcp` 是一个本地运行的 flomo MCP stdio server。它基于你自己的 flomo Web 登录态凭据，为支持 Model Context Protocol 的客户端提供 memo 读取、搜索、同步和新建能力。

> 本项目不是 flomo 官方项目。它依赖 flomo Web 的内部接口和会话凭据，接口可能变化；请只在你信任的本地环境中运行。

## 功能

- 通过 stdio 暴露 MCP 工具。
- 读取最近 memo，按 `slug` 获取 memo。
- 分页同步 memo 到本地内存缓存，再进行显式全库搜索。
- 新建 memo。
- 对敏感 header 和日志做基础脱敏。
- 提供 TypeScript 类型检查、Vitest 测试、Python 辅助脚本测试、构建、stdio smoke test 和依赖审计。

## 要求

- Node.js 20 或更高版本。
- npm。
- 支持 stdio MCP server 的客户端。
- 你自己的 flomo Web 会话 `Authorization`，必要时还包括 `Cookie`。

## 快速开始

从源码运行：

```powershell
npm install
Copy-Item .env.example .env
npm run build
npm run smoke:stdio
```

编辑 `.env`，至少填入：

```dotenv
FLOMO_AUTHORIZATION=Bearer your-token-here
```

开发模式：

```powershell
npm run dev
```

生产模式：

```powershell
npm run build
npm start
```

## MCP 客户端配置

先执行 `npm run build`，然后把以下 stdio server 配置加入 MCP 客户端。路径按你的本地目录调整。

```json
{
  "mcpServers": {
    "flomo": {
      "command": "node",
      "args": ["D:/Vib_Coding_Projects/flomo-mcp/dist/index.js"],
      "env": {
        "FLOMO_AUTHORIZATION": "Bearer your-token-here",
        "FLOMO_BASE_URL": "https://flomoapp.com",
        "FLOMO_WEB_BASE_URL": "https://v.flomoapp.com",
        "FLOMO_TIMEZONE": "Asia/Shanghai",
        "FLOMO_REQUEST_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

发布到 npm 后，也可以把命令配置为包入口：

```json
{
  "mcpServers": {
    "flomo": {
      "command": "flomo-mcp",
      "args": [],
      "env": {
        "FLOMO_AUTHORIZATION": "Bearer your-token-here"
      }
    }
  }
}
```

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `FLOMO_AUTHORIZATION` | 读取/写入时必填 | 无 | flomo Web 请求中的 `Authorization` header。 |
| `FLOMO_COOKIE` | 可选 | 无 | flomo Web Cookie；只有当前接口要求时再填写。 |
| `FLOMO_USER_AGENT` | 可选 | `Mozilla/5.0` | 请求 flomo Web 时使用的 User-Agent。 |
| `FLOMO_BASE_URL` | 可选 | `https://flomoapp.com` | flomo API 基础地址。 |
| `FLOMO_WEB_BASE_URL` | 可选 | `https://v.flomoapp.com` | flomo Web 基础地址。 |
| `FLOMO_TIMEZONE` | 可选 | `Asia/Shanghai` | IANA timezone。 |
| `FLOMO_REQUEST_TIMEOUT_MS` | 可选 | `30000` | flomo Web 请求超时时间，单位毫秒。 |
| `LOG_LEVEL` | 可选 | `info` | `debug`、`info`、`warn` 或 `error`。 |
| `FLOMO_READ_ENDPOINT` | 可选 | 内置当前路径 | 仅在 flomo Web 内部读取路径变化时覆盖。 |
| `FLOMO_SYNC_ENDPOINT` | 可选 | 内置当前路径 | 仅在 flomo Web 内部同步路径变化时覆盖。 |
| `FLOMO_WRITE_ENDPOINT` | 可选 | 内置当前路径 | 仅在 flomo Web 内部写入路径变化时覆盖。 |

完整示例见 [.env.example](.env.example)。

## MCP 工具

| 工具 | 说明 |
| --- | --- |
| `ping` | 检查 server 是否可用。 |
| `list_notes` | 列出最近 memo。 |
| `sync_notes` | 分页同步 memo 到本地内存缓存，只返回同步统计。 |
| `search_notes` | 默认搜索最近 memo；传入 `scope: "all_synced_notes"` 时搜索已同步缓存。 |
| `get_note` | 默认按 `slug` 从最近 memo 定位；传入 `scope: "all_synced_notes"` 时从已同步缓存定位。 |
| `create_note` | 新建 memo。 |

## 全量同步边界

本项目不提供“一次性返回全部笔记正文”的工具。需要全库检索时，先调用 `sync_notes` 建立本地内存缓存，再用 `search_notes` 或 `get_note` 显式指定：

```json
{
  "scope": "all_synced_notes"
}
```

`sync_notes` 支持 `pageSize`（最大 200）和 `maxPages`（最大 100）。如果达到页数上限但仍可能有更多笔记，返回值中的 `complete` 会是 `false`。

## 抓取 Authorization

1. 浏览器登录 flomo Web。
2. 打开 DevTools 的 Network。
3. 刷新页面。
4. 找到 flomo 的 XHR/fetch 请求。
5. 从 Request Headers 复制 `Authorization: Bearer ...`。
6. 写入本地 `.env` 或 MCP 客户端配置中的 `FLOMO_AUTHORIZATION`。

不要把 Authorization、Cookie、原始 memo 内容或 flomo 响应日志提交到 Git，也不要发给第三方。

## 验证

开发和发布前运行：

```bash
npm run typecheck
npm run typecheck:test
npm test
npm run test:python
npm run build
npm run smoke:stdio
npm audit --audit-level=moderate
```

也可以一次运行：

```bash
npm run verify
```

检查 npm 发布内容：

```bash
npm pack --dry-run
```

## 从源码发布准备

当前包入口是 `bin.flomo-mcp -> ./dist/index.js`，发布前需要先构建：

```bash
npm run build
npm pack --dry-run
```

确认包内容不包含 `.env`、`node_modules`、`coverage` 或私密 memo 数据后，再执行 npm 发布流程。

## flomo Web 接口维护

flomo Web endpoint 是内部接口，可能变化。当前 adapter 内置读写和同步 endpoint；只有路径或签名规则变化时才需要设置 `FLOMO_READ_ENDPOINT`、`FLOMO_SYNC_ENDPOINT` 或 `FLOMO_WRITE_ENDPOINT`。

维护检查项：

- 读取最近 memo：确认请求 URL、方法、必要 headers、动态参数、返回体 memo 数组字段和稳定标识字段。
- 新建 memo：确认 payload、签名规则、必要 Cookie、防重放字段和成功响应结构。
- 全量同步 memo：确认分页路径、分页参数、终止条件、memo 数组字段和稳定标识字段。

## 开发文档

- [开发流程文档](docs/development-flow.md)
- [开发日志](docs/development-log.md)

## 许可证

MIT，见 [LICENSE](LICENSE)。
