/**
 * 从 src/shared/ipc.ts 生成 IPC 契约表，避免文档和代码脱节。
 * 用法：node scripts/gen-ipc-doc.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'shared', 'ipc.ts'), 'utf8');

const channels = [...source.matchAll(/^\s{2}(\w+): '([\w:]+)',/gm)].map((match) => ({
  constName: match[1],
  channel: match[2],
}));

const apiStart = source.indexOf('export interface WenhuoApi');
const apiBody = source.slice(apiStart);
const namespaces = [...apiBody.matchAll(/^ {2}(\w+): \{$/gm)].map((match) => match[1]);

const lines = [
  '# IPC 契约',
  '',
  '> 本文件由 `node scripts/gen-ipc-doc.cjs` 从 `src/shared/ipc.ts` 生成，请勿手改。',
  '> 通道统一走 `handle(channel, logger, fn)` 包装，返回值恒为 `Result<T>`。',
  '',
  `## 通道（${channels.length}）`,
  '',
  '| 常量 | 通道 |',
  '| --- | --- |',
  ...channels.map((item) => `| \`${item.constName}\` | \`${item.channel}\` |`),
  '',
  `## API 命名空间（${namespaces.length}）`,
  '',
  namespaces.map((name) => `- \`window.api.${name}\``).join('\n'),
  '',
  '## 约束',
  '',
  '- 渲染层不直接调用 `window.api`，统一经 `src/renderer/api/*`。',
  '- 新增通道时同步更新：`shared/ipc.ts`、`preload/index.ts`、主进程 handler，并重跑本脚本。',
  '- 通道命名 `domain:action`，全小写、动词在后。',
  '',
];

const target = path.join(root, 'docs', 'ipc.md');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, lines.join('\n'), 'utf8');
console.log(`docs/ipc.md 已生成：${channels.length} 个通道、${namespaces.length} 个命名空间`);
