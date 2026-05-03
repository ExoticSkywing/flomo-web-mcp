# flomo-mcp

一个本地优先的 flomo MCP Server，用于无 flomo Pro 场景下基于网页登录态封装读取与写入能力。

## 状态

V1 已完成 MCP stdio 外壳、工具注册、配置读取、parser、标签处理、错误映射、读写 adapter 和测试覆盖。读取 adapter 已按当前 flomo Web 规则实现动态 query，并默认请求 `/api/v1/memo/latest_updated_desc`；写入 adapter 已按当前 Web 规则实现 `PUT /api/v1/memo` 和签名 JSON body。

完整开发流程见 [开发流程文档](docs/development-flow.md)。

实际推进记录见 [开发日志](docs/development-log.md)。

已注册工具：

- `ping`
- `list_notes`：列出最近 memo。
- `sync_notes`：分页同步 flomo memo 到本地内存缓存，只返回同步统计，不返回全部正文。
- `search_notes`：默认仍搜索最近 memo；传入 `scope: "all_synced_notes"` 时搜索 `sync_notes` 已同步的本地全库缓存。
- `get_note`：默认在最近 memo 批次中按 `slug` 定位；传入 `scope: "all_synced_notes"` 时从已同步的本地全库缓存定位。
- `create_note`

## 全量同步边界

本项目不提供“一次性返回全部笔记正文”的工具。需要全库检索时，先调用 `sync_notes` 建立本地缓存，再用 `search_notes` 或 `get_note` 显式指定：

```json
{
  "scope": "all_synced_notes"
}
```

`sync_notes` 支持 `pageSize`（最大 200）和 `maxPages`（最大 100）。如果达到页数上限但仍可能有更多笔记，返回值中的 `complete` 会是 `false`。

## 安全边界

`FLOMO_AUTHORIZATION` 等同高敏感凭据，不要提交到 Git，不要打印到日志，不要发给第三方。`.env` 已加入 `.gitignore`。

## 本地运行

PowerShell:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Bash:

```bash
npm install
cp .env.example .env
npm run dev
```

构建：

```bash
npm run build
npm start
```

测试：

```bash
npm test
```

完整验收：

```bash
npm run verify
```

`verify` 会依次执行类型检查、单元测试、构建、stdio MCP smoke test 和中等以上级别的依赖审计。

## 抓取 Authorization

1. 浏览器登录 flomo Web。
2. 打开 DevTools 的 Network。
3. 刷新页面。
4. 找到 flomo 的 XHR/fetch 请求。
5. 从 Request Headers 复制 `Authorization: Bearer ...`。
6. 写入本地 `.env` 的 `FLOMO_AUTHORIZATION`。

## 接口变化维护检查项

读取最近 memo：

- 如当前默认路径失效，重新确认请求 URL 和方法
- 必要 headers 是否变化
- `tz/timestamp/api_key/sign` 之外是否新增动态参数
- 返回体中 memo 数组字段是否仍为 `data`
- memo 的稳定标识字段是否仍为 `slug`

新建 memo：

- 如当前默认路径失效，重新确认请求 URL 和方法
- Request Payload 是否仍包含 `content/created_at/source/memo_from/file_ids/tz`
- `timestamp/api_key/sign` 签名规则是否变化
- 是否新增 Cookie、防重放字段或其它动态 header
- 成功响应中 memo 所在字段是否仍为 `data`

全量同步 memo：

- 如当前默认路径失效，重新确认 `/api/v1/memo/updated/` 或对应分页路径
- 分页参数是否仍为 `limit/latest_updated_at/latest_slug`
- 终止条件是否仍可通过返回条数、游标或空列表判断
- 返回体中 memo 数组字段是否仍为 `data`
- memo 的稳定标识字段是否仍为 `slug`

## MCP 客户端配置示例

先执行 `npm run build`，再把以下命令配置给支持 stdio MCP 的宿主：

```json
{
  "mcpServers": {
    "flomo": {
      "command": "node",
      "args": ["D:/Vib_Coding_Projects/flomo-mcp/dist/index.js"],
      "env": {
        "FLOMO_AUTHORIZATION": "Bearer xxxxxxxxxxxxxxxxx",
        "FLOMO_BASE_URL": "https://flomoapp.com",
        "FLOMO_WEB_BASE_URL": "https://v.flomoapp.com",
        "FLOMO_TIMEZONE": "Asia/Shanghai",
        "FLOMO_REQUEST_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

如果项目放在其它目录，把 `args` 改成对应的 `dist/index.js` 绝对路径。当前默认 adapter 已内置读写和同步 endpoint；只有 flomo Web 内部路径变化时才需要设置 `FLOMO_READ_ENDPOINT`、`FLOMO_SYNC_ENDPOINT` 或 `FLOMO_WRITE_ENDPOINT`。

## Roadmap

1. 打通 `ping` 并确认 MCP 宿主可加载。
2. DevTools 抓取最近 memo 请求，填充读取 adapter。已完成当前签名规则适配。
3. 用真实凭据通过 MCP 客户端验收 `list_notes`、`search_notes`、`get_note`。已完成。
4. DevTools 抓取新建 memo 请求，填充写入 adapter。已完成当前签名 body 适配。
5. 加入更完整的集成测试与错误映射。已完成首版覆盖，包括 MCP in-memory smoke test 和 `npm run smoke:stdio`。
6. 增加受控全量同步：`sync_notes` 分页建立本地缓存，`search_notes` / `get_note` 通过显式 scope 读取缓存。已完成首版。
