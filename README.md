# flomo-mcp

一个本地优先的 flomo MCP Server，用于无 flomo Pro 场景下基于网页登录态封装读取与写入能力。

## 状态

V1 已完成 MCP stdio 外壳、工具注册、配置读取、parser、标签处理、错误映射、读写 adapter 和测试覆盖。读取 adapter 已按当前 flomo Web 规则实现动态 query，并默认请求 `/api/v1/memo/latest_updated_desc`；写入 adapter 已按当前 Web 规则实现 `PUT /api/v1/memo` 和签名 JSON body。

完整开发流程见 [开发流程文档](docs/development-flow.md)。

实际推进记录见 [开发日志](docs/development-log.md)。

已注册工具：

- `ping`
- `list_notes`
- `search_notes`
- `get_note`
- `create_note`

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
        "FLOMO_TIMEZONE": "Asia/Shanghai"
      }
    }
  }
}
```

如果项目放在其它目录，把 `args` 改成对应的 `dist/index.js` 绝对路径。

## Roadmap

1. 打通 `ping` 并确认 MCP 宿主可加载。
2. DevTools 抓取最近 memo 请求，填充读取 adapter。已完成当前签名规则适配。
3. 用真实凭据通过 MCP 客户端验收 `list_notes`、`search_notes`、`get_note`。已完成。
4. DevTools 抓取新建 memo 请求，填充写入 adapter。已完成当前签名 body 适配。
5. 加入更完整的集成测试与错误映射。已完成首版覆盖，包括 MCP in-memory smoke test 和 `npm run smoke:stdio`。
