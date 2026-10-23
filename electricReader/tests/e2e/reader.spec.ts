import { test, expect, type Page } from '@playwright/test'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { writeTestEpub } from '../helpers/epub-fixture'
import { writeTestTxt } from '../helpers/txt-fixture'
import {
  cleanup,
  closeApp,
  launchApp,
  makeTempDir,
  readLibrary,
  type RunningApp,
} from '../helpers/electron-app'

async function importFixture(page: Page, fixture: string): Promise<{ id: string; title: string }> {
  const summary = await page.evaluate((filePath) => window.api.importPaths([filePath]), fixture)
  expect(summary.ok).toBe(true)
  if (!summary.ok) throw new Error(summary.message)
  expect(summary.data.errors).toEqual([])
  expect(summary.data.imported).toHaveLength(1)
  const book = summary.data.imported[0]
  if (!book) throw new Error('import returned no book')
  return { id: book.id, title: book.title }
}

async function prepare(): Promise<{
  userData: string
  app: RunningApp
  id: string
}> {
  const userData = await makeTempDir('electricreader-e2e-')
  const fixture = path.join(userData, 'fixture.epub')
  await writeTestEpub(fixture)
  const app = await launchApp(userData)
  const { id } = await importFixture(app.page, fixture)
  return { userData, app, id }
}

async function openBook(
  app: RunningApp,
  title = '夜航测试书',
  chapterText = '第 1 章 · 夜航',
  bodyText = '夜色落在窗台上',
): Promise<void> {
  await app.page.reload()
  await expect(app.page.getByText(title).first()).toBeVisible({ timeout: 15_000 })
  await app.page.getByRole('button', { name: `阅读《${title}》`, exact: true }).click()
  const frame = app.page.frameLocator('iframe').first()
  await expect(frame.locator('body')).toContainText(chapterText, { timeout: 20_000 })
  await expect(frame.locator('body')).toContainText(bodyText, { timeout: 20_000 })
}

test('EPUB + TXT 导入后封面出现，重启两本书仍在', async () => {
  const { userData, app, id } = await prepare()
  try {
    const txtFixture = path.join(userData, 'second-book.txt')
    await writeTestTxt(txtFixture, { title: 'TXT 同架', author: '另一位作者' })
    await app.page.evaluate((filePath) => window.api.importPaths([filePath]), txtFixture)

    await app.page.reload()
    await expect(app.page.getByText('夜航测试书').first()).toBeVisible({ timeout: 15_000 })
    await expect(app.page.getByText('TXT 同架').first()).toBeVisible({ timeout: 15_000 })
    await expect(app.page.getByText('2 本', { exact: true })).toBeVisible()

    const cover = app.page.locator('img[alt*="封面"]').first()
    await expect(cover).toBeVisible()
    await expect
      .poll(async () => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0)

    await expect(app.page.getByText('未读').first()).toBeVisible()
    expect((await stat(path.join(userData, 'books', `${id}.epub`))).isFile()).toBe(true)
    expect((await readLibrary(userData)).books).toHaveLength(2)
    await app.page.screenshot({ path: test.info().outputPath('library.png') })

    await closeApp(app)

    const relaunched = await launchApp(userData)
    try {
      await expect(relaunched.page.getByText('夜航测试书').first()).toBeVisible({
        timeout: 15_000,
      })
      await expect(relaunched.page.getByText('TXT 同架').first()).toBeVisible({
        timeout: 15_000,
      })
      await expect(relaunched.page.getByText('2 本', { exact: true })).toBeVisible()
    } finally {
      await closeApp(relaunched)
    }
  } finally {
    await cleanup(userData)
  }
})

test('翻页、调字号后位置不漂移，重启回到同一段落', async () => {
  const { userData, app } = await prepare()
  try {
    await openBook(app)

    await app.page.keyboard.press('ArrowRight')
    await app.page.waitForTimeout(350)
    await app.page.keyboard.press('ArrowRight')
    await app.page.waitForTimeout(1800)

    const first = (await readLibrary(userData)).books[0]
    expect(first?.status).toBe('reading')
    expect(first?.progress.percent).toBeGreaterThan(0)
    expect(first?.progress.locator.cfi).toBeTruthy()
    expect(first?.progress.locator.href).toContain('chapter1')

    const beforeSettingsCfi = first!.progress.locator.cfi

    await app.page.getByTestId('settings-open').click()
    await app.page.getByTestId('font-size-160').click()
    await expect(app.page.getByTestId('font-size-160')).toHaveAttribute('aria-pressed', 'true')

    await expect
      .poll(async () => (await readLibrary(userData)).books[0]?.progress.locator.cfi, {
        timeout: 15_000,
      })
      .toBe(beforeSettingsCfi)

    const afterSettings = (await readLibrary(userData)).books[0]
    expect(afterSettings?.progress.locator.href).toBe(first?.progress.locator.href)
    expect(
      JSON.parse(await readFile(path.join(userData, 'library.json'), 'utf8')).settings.fontSize,
    ).toBe(160)

    await app.page.getByRole('button', { name: '关闭排版设置' }).click()
    await closeApp(app)

    const relaunched = await launchApp(userData)
    try {
      await openBook(relaunched)
      await expect
        .poll(async () => (await readLibrary(userData)).books[0]?.progress.locator.cfi, {
          timeout: 15_000,
        })
        .toBe(beforeSettingsCfi)
      const resumed = (await readLibrary(userData)).books[0]
      expect(resumed?.progress.locator.href).toBe(first?.progress.locator.href)
      expect(resumed?.progress.percent).toBeGreaterThan(0)
    } finally {
      await closeApp(relaunched)
    }
  } finally {
    await cleanup(userData)
  }
})

test('目录跳转、点击翻页与深色主题生效', async () => {
  const { userData, app } = await prepare()
  try {
    await openBook(app)

    await app.page.getByTestId('toc-open').click()
    await expect(app.page.getByRole('dialog', { name: '目录' })).toBeVisible()
    await app.page.getByRole('button', { name: /第 2 章/ }).click()

    const frame = app.page.frameLocator('iframe').first()
    await expect(frame.locator('h1')).toContainText('第 2 章', { timeout: 15_000 })
    await expect
      .poll(async () => (await readLibrary(userData)).books[0]?.progress.locator.href, {
        timeout: 15_000,
      })
      .toContain('chapter2')

    await app.page.getByTestId('toc-open').click()
    await expect(app.page.locator('[data-active="true"]').first()).toContainText('第 2 章')
    await app.page.getByRole('button', { name: '关闭目录' }).click()

    const beforeClick = (await readLibrary(userData)).books[0]?.progress.percent ?? 0
    const host = app.page.locator('.er-reader-host').first()
    const box = await host.boundingBox()
    if (!box) throw new Error('reader host has no bounds')
    await app.page.mouse.click(box.x + box.width - 40, box.y + box.height / 2)
    await expect
      .poll(async () => (await readLibrary(userData)).books[0]?.progress.percent ?? 0, {
        timeout: 15_000,
      })
      .toBeGreaterThan(beforeClick)

    await app.page.getByTestId('settings-open').click()
    await app.page.getByTestId('theme-dark').click()
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect
      .poll(async () => (await readLibrary(userData)).settings.theme, { timeout: 15_000 })
      .toBe('dark')
    expect((await readLibrary(userData)).settings.followSystem).toBe(false)

    await app.page.getByRole('button', { name: '关闭排版设置' }).click()
    await app.page.waitForTimeout(400)
    await app.page.screenshot({ path: test.info().outputPath('reader-dark.png') })
  } finally {
    await closeApp(app)
    await cleanup(userData)
  }
})

test('TXT 导入、目录切章与重启续读', async () => {
  const userData = await makeTempDir('electricreader-txt-')
  const fixture = path.join(userData, 'novel.txt')
  await writeTestTxt(fixture)
  const app = await launchApp(userData)

  try {
    const summary = await app.page.evaluate(
      (filePath) => window.api.importPaths([filePath]),
      fixture,
    )
    expect(summary.ok).toBe(true)
    if (!summary.ok) throw new Error(summary.message)
    const imported = summary.data.imported[0]
    expect(imported?.format).toBe('txt')
    expect(imported?.title).toBe('TXT 夜航')

    await app.page.reload()
    await expect(app.page.getByText('TXT 夜航').first()).toBeVisible({ timeout: 15_000 })
    await expect(app.page.getByText('TXT', { exact: true }).first()).toBeVisible()
    expect((await readLibrary(userData)).books[0]?.format).toBe('txt')

    await openBook(app, 'TXT 夜航', '第1章 起点', '这是第1章的第1段')

    await app.page.getByTestId('toc-open').click()
    const toc = app.page.getByRole('dialog', { name: '目录' })
    await expect(toc).toBeVisible()
    await expect(toc.getByRole('button', { name: /第一卷 夜航/ })).toBeVisible()
    await toc.getByRole('button', { name: /第2章/ }).click()

    const frame = app.page.frameLocator('iframe').first()
    await expect(frame.locator('h1')).toContainText('第2章 继续', { timeout: 15_000 })
    await expect
      .poll(async () => (await readLibrary(userData)).books[0]?.progress.locator.href, {
        timeout: 15_000,
      })
      .toContain('text-1-0.xhtml')
    await app.page.screenshot({ path: test.info().outputPath('txt-reader.png') })

    const saved = (await readLibrary(userData)).books[0]
    expect(saved?.format).toBe('txt')
    expect(saved?.progress.percent).toBeGreaterThan(0)
    expect((await stat(path.join(userData, 'books', `${saved!.id}.txt`))).isFile()).toBe(true)

    await closeApp(app)
    const relaunched = await launchApp(userData)
    try {
      await openBook(relaunched, 'TXT 夜航', '这是第2章的第1段', '这是第2章的第1段')
      await expect
        .poll(async () => (await readLibrary(userData)).books[0]?.progress.locator.cfi, {
          timeout: 15_000,
        })
        .toBe(saved?.progress.locator.cfi)
      expect((await readLibrary(userData)).books[0]?.format).toBe('txt')
    } finally {
      await closeApp(relaunched)
    }
  } finally {
    await cleanup(userData)
  }
})

test('删除书会同步清理书籍副本与封面缓存', async () => {
  const { userData, app, id } = await prepare()
  try {
    await app.page.reload()
    await expect(app.page.getByText('夜航测试书').first()).toBeVisible({ timeout: 15_000 })

    const bookFile = path.join(userData, 'books', `${id}.epub`)
    const coverDir = path.join(userData, 'books', id)
    expect((await stat(bookFile)).isFile()).toBe(true)
    expect((await stat(path.join(coverDir, 'cover.jpg'))).isFile()).toBe(true)

    await app.page.getByRole('button', { name: '《夜航测试书》更多操作' }).click()
    await app.page.getByRole('menuitem', { name: '从书库移除' }).click()
    await app.page.getByRole('button', { name: '确认移除' }).click()

    await expect(app.page.getByText('书架还是空的')).toBeVisible({ timeout: 15_000 })
    await expect(stat(bookFile)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(coverDir)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readLibrary(userData)).books).toHaveLength(0)
  } finally {
    await cleanup(userData)
  }
})
