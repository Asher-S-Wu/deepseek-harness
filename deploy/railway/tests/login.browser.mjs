/** Rendered login checks; run separately from the server-only Railway build tests. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { createLoginServer } from '../login-server.mjs'

const { chromium } = createRequire(new URL('../../../apps/web/package.json', import.meta.url))('playwright')

test('login dialog supports keyboard, errors, light/dark themes, and constrained screens', { timeout: 120_000 }, async t => {
  let login
  const server = createServer((req, res) => login.emit('request', req, res))
  t.after(() => new Promise(resolve => {
    server.closeAllConnections()
    server.close(resolve)
  }))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  login = createLoginServer({ key: 'a'.repeat(48), publicUrl: url, harnessPort: 1, getLaunchToken: () => undefined })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, colorScheme: 'light' })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url)
  assert.equal(await page.title(), '登录 · Harness')
  const dialog = page.getByRole('dialog', { name: '登录工作空间' })
  await dialog.waitFor({ state: 'visible' })
  const expected = await readFile(new URL('expected/login.txt', import.meta.url), 'utf8')
  assert.equal(await dialog.ariaSnapshot(), expected.trimEnd())
  assert.equal(await page.locator(':focus').getAttribute('id'), 'key')
  await page.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), false)
  const opener = page.getByRole('button', { name: '登录 Harness', exact: true })
  await opener.click()
  await dialog.waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '关闭登录弹窗' }).click()
  assert.equal(await dialog.isVisible(), false)
  await opener.click()
  await page.mouse.click(10, 10)
  assert.equal(await dialog.isVisible(), false)
  await opener.click()
  const key = page.getByLabel('访问密钥', { exact: true })
  const submit = page.getByRole('button', { name: '进入 Harness', exact: true })
  await key.fill('wrong-key')
  let captureLoading
  const loading = new Promise(resolve => { captureLoading = resolve })
  await page.exposeFunction('captureLoginLoading', state => captureLoading(state))
  await page.evaluate(() => {
    document.querySelector('form').addEventListener('submit', () => window.captureLoginLoading({
      disabled: document.getElementById('submit-login').disabled,
      label: document.getElementById('submit-label').textContent,
      readOnly: document.getElementById('key').readOnly,
      busy: document.getElementById('login-dialog').getAttribute('aria-busy'),
    }), { once: true })
  })
  await submit.click()
  assert.deepEqual(await loading, { disabled: true, label: '正在登录…', readOnly: true, busy: 'true' })
  await page.getByRole('alert').filter({ hasText: '密钥有误，请检查后重试' }).waitFor()
  assert.equal(await key.getAttribute('aria-invalid'), 'true')
  await key.fill('a'.repeat(48))
  await submit.click()
  await page.getByRole('alert').filter({ hasText: '服务正在启动，请稍后再试' }).waitFor()
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    for (const width of [360, 381]) {
      await page.setViewportSize({ width, height: 740 })
      const rect = await dialog.boundingBox()
      assert.ok(rect.x >= 16 && rect.x + rect.width <= width - 16)
      assert.ok(rect.y >= 16 && rect.y + rect.height <= 724)
    }
  }
  await page.setViewportSize({ width: 760, height: 320 })
  await submit.scrollIntoViewIfNeeded()
  const button = await submit.boundingBox()
  assert.ok(button.y >= 16 && button.y + button.height <= 304)
  assert.deepEqual(errors, [])
})
