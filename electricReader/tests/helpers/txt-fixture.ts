import { writeFile } from 'node:fs/promises'

export interface TestTxtOptions {
  title?: string
  author?: string
  chapters?: number
  paragraphsPerChapter?: number
}

export function buildTestTxt(options: TestTxtOptions = {}): string {
  const title = options.title ?? 'TXT 夜航'
  const author = options.author ?? '林川'
  const chapters = Math.max(1, options.chapters ?? 3)
  const paragraphs = Math.max(3, options.paragraphsPerChapter ?? 24)

  const blocks: string[] = [`书名：${title}`, `作者：${author}`, '']
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    if (chapter === 1) blocks.push('第一卷 夜航', '')
    if (chapter === 3) blocks.push('第二卷 远方', '')
    blocks.push(`第${chapter}章 ${chapter === 1 ? '起点' : chapter === 2 ? '继续' : '远方'}`, '')
    for (let index = 1; index <= paragraphs; index += 1) {
      blocks.push(
        `这是第${chapter}章的第${index}段。夜色落在窗台上，纸页翻动时发出很轻的响声。TXT 文档被切成章节后，仍然可以用目录跳转，并记住读到这里的位置。稳定句子 ${chapter}-${index}。`,
        '',
      )
    }
  }
  return blocks.join('\n')
}

export async function writeTestTxt(target: string, options: TestTxtOptions = {}): Promise<void> {
  await writeFile(target, buildTestTxt(options), 'utf8')
}
