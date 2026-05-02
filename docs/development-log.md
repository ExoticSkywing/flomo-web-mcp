# 开发日志

本文档记录 flomo-mcp 的实际开发推进、验证证据、踩坑记录和后续影响。日志只记录可复现的技术事实，不记录 Authorization、Cookie、完整私人 memo 内容或完整抓包响应。

## 2026-05-02：项目初始化与读取接口抓包

### 背景

`docs/development-flow.md` 已把项目后续工作拆成阶段。当前重点是阶段 2：确认 flomo Web 读取最近 memo 的真实接口，为阶段 3 的 `list_notes` adapter 实现提供依据。

### 已完成工作

| 时间点 | 工作 | 结果 |
| --- | --- | --- |
| 初始化仓库 | 在 `/root/projects/flomo-mcp` 执行 Git 初始化 | 当前分支为 `main` |
| 首次提交 | 配置本仓库 Git 作者并提交初始代码 | 提交 `a2af52f Initial commit` |
| 基线验证 | 执行 `npm run typecheck`、`npm test`、`npm run build` | 均通过；测试为 3 个文件、5 个用例 |
| 文档核对 | 阅读 `README.md` 和 `docs/development-flow.md` | 确认读取接口抓包是下一阶段阻塞点 |
| 浏览器抓包 | 通过 Windows Chrome 远程调试协议抓取 flomo Web XHR/fetch | 成功定位 memo 读取接口和响应结构 |
| 安全清理 | 删除临时 CDP 抓包脚本并关闭调试 Chrome | 工作区恢复干净 |

### 抓包结论

flomo Web 当前使用的页面域名：

```text
https://v.flomoapp.com
```

读取最近 memo 的接口：

```text
GET /api/v1/memo/latest_updated_desc
```

增量读取 memo 的接口：

```text
GET /api/v1/memo/updated/
```

`/api/v1/memo/updated/` 观察到的 query 参数形态：

```text
limit=200
latest_updated_at=<number>
latest_slug=<string>
tz=8:0
timestamp=<dynamic>
api_key=<redacted>
app_version=4.0
platform=web
webp=1
sign=<dynamic>
```

请求头观察结果：

```text
Authorization: required
Cookie: not observed as required
Referer: present
User-Agent: present
device-id: present
device-model: present
platform: present
```

memo 响应结构：

```json
{
  "code": 0,
  "message": "<string>",
  "data": [
    {
      "content": "<html string>",
      "creator_id": "<number>",
      "source": "<string>",
      "tags": "<string or object/array>",
      "pin": "<number>",
      "created_at": "<string>",
      "updated_at": "<string>",
      "deleted_at": null,
      "memo_from": "<string>",
      "slug": "<string>",
      "linked_count": "<number>",
      "files": {}
    }
  ]
}
```

### 踩坑与处理

| 问题 | 表现 | 根因 | 处理 |
| --- | --- | --- | --- |
| WSL 不能直连 Chrome 调试端口 | WSL 内 `curl http://127.0.0.1:9222/json/version` 失败 | Windows Chrome 的 DevTools 端口监听在 Windows 的 `127.0.0.1`，不是 WSL 网络命名空间 | 改为通过 Windows PowerShell 访问 CDP |
| `powershell.exe` 不在 PATH | 直接执行 `powershell.exe` 报 command not found | 当前 shell 环境未暴露 Windows PATH | 使用完整路径 `/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe` |
| PowerShell JSON 参数不兼容 | `ConvertFrom-Json -Depth` 报参数不存在 | Windows PowerShell 5.1 不支持该参数 | 移除 `-Depth`，改写脚本兼容 PS 5.1 |
| 页面刷新只返回空增量 | `/api/v1/memo/updated/` 返回 `data: []` | flomo Web 从 localStorage/IndexedDB 读取本地同步状态，只请求最新变化 | 清空临时浏览器 profile 的 `last_sync_memo` 和 `flomo` IndexedDB 缓存后重新抓包 |
| 抓包脚本过早退出 | 第二次抓包没有捕获 XHR | CDP console 事件可能复用旧完成标记 | 每次运行使用唯一 completion token |
| 同 URL 导航不稳定触发请求 | 重复导航 `/mine` 有时没有新 XHR | SPA 已加载状态和缓存会影响请求时机 | 监听新 Document 导航，并延长 XHR 等待窗口 |
| 响应结构扫描误报失败 | 大响应体被标为 `non-json-or-unparsed` 或 memo path scan failed | 临时脚本的结构扫描对数组路径和大对象不够健壮 | 分离解析状态、body 元数据和响应 shape，最终确认 `data` 是 memo 数组 |

### 已解决的问题

- 阶段 2 的核心问题已经解决：已经知道 flomo Web 读取 memo 的真实 endpoint、必要认证形态和稳定响应字段。
- 确认读取请求在本次抓包中不依赖 Cookie，主要依赖 `Authorization` 和若干 Web 端 header/query。
- 确认当前 `Memo` 模型的关键字段能从响应中映射：`slug`、`content`、`tags`、`created_at`、`updated_at`。
- 确认 `tags` 字段可能不是单一稳定形态，后续 parser 必须继续容忍 string、array 和 object。

### 对后续开发的影响

当前 adapter 不能只配置一个静态 `FLOMO_READ_ENDPOINT` 后直接请求，因为 flomo Web 请求带有动态 query：

- `timestamp`
- `api_key`
- `sign`
- 可能还有 `device-id` 关联逻辑

因此阶段 3 的实现范围需要从“填入读取路径”调整为“实现 flomo Web 签名请求适配”。如果签名算法无法稳定复现，`list_notes` 将只能依赖浏览器会话或手工抓到的短期请求，不能成为可长期使用的 MCP 工具。

现有 parser 基础基本可复用，但需要补充针对真实响应结构的测试：

- 顶层 `{ code, message, data: Memo[] }`
- `content` 为 HTML 字符串
- `tags` 为字符串或结构化对象
- `deleted_at` 存在但为 `null`
- `files` 为空对象或数组时不影响 memo 解析

### 下一步建议

1. 先逆向读取请求签名生成逻辑。
   - 重点查找 Web bundle 中 `timestamp`、`api_key`、`sign`、`device-id` 的生成位置。
   - 目标是实现一个 `buildFlomoWebQuery()` 或等价 adapter 辅助函数。

2. 调整配置模型。
   - 将 `FLOMO_BASE_URL` 默认值从 `https://flomoapp.com` 评估调整为 `https://v.flomoapp.com`。
   - 增加 `FLOMO_API_KEY`、`FLOMO_DEVICE_ID` 等配置的必要性评估。
   - 不把 `sign` 作为静态配置；它应由请求时动态生成。

3. 以 TDD 推进阶段 3。
   - 先为真实响应结构写 parser/read client 测试。
   - 再实现 `extractMemoArray()` 对 `{ data: [...] }` 的明确支持。
   - 最后实现带签名 query 的 HTTP 请求。

4. 保持首版读取范围克制。
   - `list_notes` 先使用 `/api/v1/memo/latest_updated_desc` 或 `/api/v1/memo/updated/` 获取最近 memo。
   - `search_notes` 和 `get_note` 继续基于本地读取结果过滤，不逆向额外搜索接口。

5. 写入接口不要提前实现。
   - 先把读取链路打通并通过 MCP 客户端验证。
   - 再按 `docs/development-flow.md` 的阶段 5 抓取 `create_note` 请求。

### 安全约束

- 不提交 `.env`。
- 不提交 Authorization、Cookie、完整 HAR、完整 memo 响应或私人 memo 内容。
- 日志中只记录 endpoint、字段名、结构和脱敏后的参数名。
- 后续测试快照只能使用人工构造的匿名 fixture。

### 当前状态

| 项目 | 状态 |
| --- | --- |
| Git 仓库 | 已初始化并有首次提交 |
| 基线验证 | 通过 |
| 读取接口 endpoint | 已确认 |
| 读取响应结构 | 已确认 |
| 动态签名算法 | 未确认，是下一阶段阻塞点 |
| 写入接口 | 未抓包 |
| 抓包临时文件 | 已删除 |
| 当前文档改动 | 新增本日志，并在 README 增加入口链接 |

### 阶段 2 验收核查

阶段 2 已补齐验收。2026-05-02 重新抓取读取请求后，在脚本内关闭调试 Chrome，再用内存中的完整 URL 和必要 header 执行独立 HTTP GET 复现。复现请求返回 HTTP 200，响应体仍为 `{ code, message, data }`，其中 `data` 是非空 memo 数组。

| 验收项 | 状态 | 证据 / 差距 |
| --- | --- | --- |
| 找到 flomo Web 获取最近 memo 的真实请求 | 已完成 | 已定位 `GET /api/v1/memo/latest_updated_desc` 和 `GET /api/v1/memo/updated/` |
| 记录请求 URL 和方法 | 已完成 | 已记录 base URL、endpoint 和 GET 方法 |
| 记录 Authorization 是否存在 | 已完成 | 已确认读取请求需要 `Authorization` |
| 记录是否需要 Cookie | 已完成 | 本次抓包未观察到读取请求依赖 `Cookie` |
| 记录 query 参数 | 部分完成 | 已记录参数名和动态字段，但 `timestamp/api_key/sign` 的生成逻辑未确认 |
| 记录关键请求头 | 已完成 | 已记录 `Referer`、`User-Agent`、`device-id`、`device-model`、`platform` 等 header 名称 |
| 明确响应体中 memo 数组位置 | 已完成 | 响应顶层为 `{ code, message, data }`，memo 数组位于 `data` |
| 明确 memo 唯一标识字段 | 已完成 | 使用 `slug` |
| 明确分页/增量字段 | 已完成 | 已观察并复现 `latest_updated_at` 和 `latest_slug` 增量参数；长期签名生成仍属于阶段 3 适配问题 |
| 离开浏览器页面后 curl/Postman 仍能读取最近 memo | 已完成 | 捕获请求后关闭调试 Chrome，再用独立 HTTP GET 复现成功，返回 HTTP 200 和非空 `data` 数组 |
| 不把 Authorization 或 Cookie 写进源码、README 或测试快照 | 已核查通过 | 只保留占位符和脱敏描述；未发现真实凭据 |

独立复现证据摘要：

```text
accepted=true
captured.method=GET
captured.urlPath=/api/v1/memo/updated/
captured.browserStatus=200
captured.hasAuthorization=true
captured.hasCookie=false
captured.browserClosedBeforeReplay=true
replay.statusCode=200
replay.contentType=application/json
replay.dataIsArray=true
replay.memoCount=200
replay.sampleHasSlug=true
replay.sampleHasContent=true
```

复现使用的 header 名称：

```text
Authorization
Accept
Referer
User-Agent
device-id
device-model
platform
sec-ch-ua-platform
sec-ch-ua
sec-ch-ua-mobile
```

复现没有输出或写入 Authorization、Cookie、完整 URL query 值、完整响应体或 memo 正文。阶段 2 至此满足验收条件；阶段 3 的主要风险转为如何稳定生成 `timestamp/api_key/sign` 等动态 query 参数。
