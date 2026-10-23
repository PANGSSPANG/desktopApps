/**
 * 导入拆章：纯函数，输入全文，输出章节数组。
 *
 * 规则之所以要做成可选，是因为中文 TXT 的排版差异很大：
 * 有「第一章」标题的、只有空行的、Markdown 的，还有一种标题都没有的整篇稿子。
 */
export const SPLIT_RULES = ['chapter', 'markdown', 'blank-line', 'single'] as const;

export type SplitRule = (typeof SPLIT_RULES)[number];

export const SPLIT_RULE_LABELS: Record<SplitRule, string> = {
  chapter: '按「第X章/节/回」标题',
  markdown: '按 Markdown 标题（# / ##）',
  'blank-line': '按空行分段',
  single: '整篇作为一章',
};

export interface SplitChapter {
  title: string;
  body: string;
}

export interface SplitResult {
  chapters: SplitChapter[];
  warnings: string[];
}

const CHAPTER_HEADING = /^[ \t　]*(第[零一二三四五六七八九十百千万两0-9]+[章节回][^\n]{0,30})$/;
const MD_HEADING = /^[ \t]{0,3}#{1,3}[ \t]+(.+)$/;

function normalize(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function toChapters(blocks: { title: string; lines: string[] }[]): SplitChapter[] {
  return blocks
    .map((block) => ({
      title: block.title.trim(),
      body: block.lines.join('\n').trim(),
    }))
    .filter((chapter) => chapter.title.length > 0 || chapter.body.length > 0);
}

function splitByHeading(
  text: string,
  isHeading: (line: string) => string | null,
  fallbackTitle: string,
): SplitResult {
  const lines = normalize(text).split('\n');
  const blocks: { title: string; lines: string[] }[] = [];
  const warnings: string[] = [];

  let current: { title: string; lines: string[] } | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    const heading = isHeading(line);
    if (heading !== null) {
      if (current) blocks.push(current);
      current = { title: heading, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) blocks.push(current);

  const leading = preamble.join('\n').trim();
  if (leading && blocks.length > 0) {
    warnings.push(`第一个标题之前有 ${leading.length} 个字符，已单独作为「开篇」。`);
    blocks.unshift({ title: '开篇', lines: [leading] });
  }

  if (blocks.length === 0) {
    warnings.push('没有识别到任何标题，已把全文作为一章导入。');
    return { chapters: [{ title: fallbackTitle, body: normalize(text).trim() }], warnings };
  }

  return { chapters: toChapters(blocks), warnings };
}

export function splitChapters(
  text: string,
  rule: SplitRule,
  fallbackTitle = '导入内容',
): SplitResult {
  if (rule === 'single') {
    return {
      chapters: [{ title: fallbackTitle, body: normalize(text).trim() }],
      warnings: [],
    };
  }

  if (rule === 'blank-line') {
    const blocks = normalize(text)
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);
    if (blocks.length === 0) {
      return { chapters: [], warnings: ['文件里没有可导入的内容。'] };
    }
    return {
      chapters: blocks.map((block, index) => ({
        title: `第 ${index + 1} 节`,
        body: block,
      })),
      warnings: ['按空行拆分时标题会丢失，导入后可自行改名。'],
    };
  }

  if (rule === 'markdown') {
    return splitByHeading(
      text,
      (line) => {
        const match = MD_HEADING.exec(line);
        return match?.[1] ? match[1].trim() : null;
      },
      fallbackTitle,
    );
  }

  return splitByHeading(
    text,
    (line) => {
      const match = CHAPTER_HEADING.exec(line);
      return match?.[1] ? match[1].trim() : null;
    },
    fallbackTitle,
  );
}
