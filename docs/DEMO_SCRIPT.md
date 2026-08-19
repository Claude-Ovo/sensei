# Demo script — "build my first MCP server"（录屏时照着敲）

前提：Node 24、`sensei` 已 link、`~/.sensei/.env` 有 key、v2ray 开着、配额充足（北京 15:00 之后录）。
终端：Windows Terminal，字号 18，窗口 120×34；第二屏开 https://sensei-agent.web.app。

```
mkdir ~\mcp-demo; cd ~\mcp-demo
sensei start -g "build my first MCP server" --public
```
（banner 出现 → 切到面板，刷新，会话在列表顶部）

```
npm init -y
npm install @modelcontextprotocol/sdk zod
```
（安静，Observer 可能露一句 "(watching) …"）

新建 server.js（用 `notepad server.js` 或提前准备好复制）：
```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'hello-mcp', version: '0.1.0' });
server.tool('add', { a: z.number(), b: z.number() }, async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }));
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('hello-mcp ready on stdio');
```

```
node server.js
```
→ 真报错：`Warning: Failed to load the ES module … set "type": "module" … SyntaxError: Cannot use import statement outside a module`
（第一次失败：Sensei 大概率不说话，或一句 nudge）

```
node server.js
```
→ 同样的错，第二次。**几秒后 Sensei 开口**（hint-first：指向 package.json / .mjs）。

```
sensei ask "type module 是什么意思，我该改哪"
```
→ Coach 回答（引用报错行）。

```
npm pkg set type=module
node server.js
```
→ `hello-mcp ready on stdio`（按 Ctrl+C 结束；Observer 记 milestone）

握手验证（可选，很上镜）：
```
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}' | node server.js
```
→ 一行 JSON：`serverInfo: hello-mcp`

```
sensei fb too-basic
```
（面板画像卡变化）

```
sensei done
```
→ 教程 Markdown 打在终端；面板「编译教程」页签出现；滚到 Pitfalls 表 + 60 秒口播稿。

```
exit
```

备用摩擦（如果想多一层）：先不装 zod → `Cannot find package 'zod'`；或把 `server.tool` 写成 `server.tools` → TypeError。
