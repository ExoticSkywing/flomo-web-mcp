# Security Policy

## Sensitive Data

`flomo-mcp` 依赖 flomo Web 会话凭据。以下内容都属于高敏感数据：

- `FLOMO_AUTHORIZATION`
- `FLOMO_COOKIE`
- flomo 原始响应体
- 私密 memo 正文、附件信息和标签组合
- 包含上述内容的 debug 日志、截图或测试 fixture

不要把这些内容提交到 GitHub、issue、PR、npm 包或第三方服务。

## Reporting a Vulnerability

如果你发现安全问题，请不要在公开 issue 中贴出凭据、memo 内容或完整响应体。请提交一个最小复现说明，包含：

- 受影响版本或 commit。
- Node.js 版本和 MCP 客户端。
- 经过脱敏的日志或错误信息。
- 影响范围，例如凭据泄露、日志泄露、错误权限访问或私密内容暴露。

如果项目尚未配置私密安全邮箱，请先在公开 issue 中只描述问题类别和影响范围，不要附带敏感样本。

## Endpoint Risk

本项目不是 flomo 官方项目。flomo Web 内部 endpoint、签名参数和响应结构可能变化。维护 endpoint 时应：

- 将 endpoint 细节限制在 clients、parsers 和维护文档中。
- 不在日志中输出 Authorization、Cookie 或原始响应体。
- 使用脱敏 fixture 覆盖响应结构变化。
- 对失败进行错误映射，避免把内部响应直接暴露给 MCP 客户端。
