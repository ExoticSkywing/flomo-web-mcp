# flomo-mcp

一个本地优先的 flomo MCP Server 骨架，用于无 flomo Pro 场景下基于网页登录态封装读取与写入能力。

## 状态

当前工程已经搭好 MCP stdio 外壳、工具注册、配置读取、parser、标签处理、错误类型和测试骨架。flomo Web 内部读取/写入接口尚未固化，必须先用浏览器 DevTools 抓包确认 `FLOMO_READ_ENDPOINT` 与 `FLOMO_WRITE_ENDPOINT`，再补齐 adapter 的请求细节。

完整开发流程见 [开发流程文档](docs/development-flow.md)。

首版工具目标：

- `ping`
- `list_notes`
- `search_notes`
- `get_note`
- `create_note`

## 安全边界

`FLOMO_AUTHORIZATION` 等同高敏感凭据，不要提交到 Git，不要打印到日志，不要发给第三方。`.env` 已加入 `.gitignore`。

## 本地运行

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

## 抓取 Authorization

1. 浏览器登录 flomo Web。
2. 打开 DevTools 的 Network。
3. 刷新页面。
4. 找到 flomo 的 XHR/fetch 请求。
5. 从 Request Headers 复制 `Authorization: Bearer ...`。
6. 写入本地 `.env` 的 `FLOMO_AUTHORIZATION`。

## 抓包待确认项

读取最近 memo：

- 请求 URL 和方法
- 必要 headers
- Query 参数
- 返回体中 memo 数组字段
- memo 的稳定标识字段
- 分页字段

新建 memo：

- 请求 URL 和方法
- Request Payload
- 是否依赖 Cookie
- 是否有时间戳、签名、防重放字段
- 成功响应中 memo 所在字段

## MCP 客户端配置示例

先执行 `npm run build`，再把以下命令配置给支持 stdio MCP 的宿主：

```json
{
  "mcpServers": {
    "flomo": {
      "command": "node",
      "args": ["/root/projects/flomo-mcp/dist/index.js"],
      "env": {
        "FLOMO_AUTHORIZATION": "Bearer xxxxxxxxxxxxxxxxx",
        "FLOMO_BASE_URL": "https://flomoapp.com",
        "FLOMO_TIMEZONE": "Asia/Shanghai"
      }
    }
  }
}
```

## Roadmap

1. 打通 `ping` 并确认 MCP 宿主可加载。
2. DevTools 抓取最近 memo 请求，填充读取 adapter。
3. 打通 `list_notes`、`search_notes`、`get_note`。
4. DevTools 抓取新建 memo 请求，填充写入 adapter。
5. 加入更完整的集成测试与缓存策略。
