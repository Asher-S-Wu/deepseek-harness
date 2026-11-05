import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createLoginServer } from '../login-server.mjs'

const key = 'a'.repeat(48)
const publicUrl = 'https://harness.vrelay.cc/'

async function listen(server, t) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => {
    server.closeAllConnections()
    server.close(resolve)
  }))
  return server.address().port
}

async function fixture(t, { token = 'private-launch-token', status = 303, loginKey = key } = {}) {
  const exchanges = []
  const harness = createServer((req, res) => {
    exchanges.push({ url: req.url, host: req.headers.host })
    res.writeHead(status, { 'set-cookie': 'dsh-auth-test=signed-session; Path=/; HttpOnly; SameSite=Strict' })
    res.end()
  })
  const harnessPort = await listen(harness, t)
  const port = await listen(createLoginServer({ key: loginKey, publicUrl, harnessPort, getLaunchToken: () => token }), t)
  const origin = `http://127.0.0.1:${port}`
  const post = (body, headers = {}) => fetch(`${origin}/__auth/login`, {
    method: 'POST', redirect: 'manual', body,
    headers: { origin: new URL(publicUrl).origin, 'content-type': 'application/x-www-form-urlencoded', ...headers },
  })
  return { origin, post, exchanges }
}

test('unauthenticated visitors get a reopenable login dialog without credentials', async t => {
  const { origin } = await fixture(t)
  const response = await fetch(origin)
  const html = await response.text()
  assert.equal(response.status, 200)
  assert.match(html, /<dialog[^>]+aria-labelledby="login-title"/)
  assert.match(html, /autocomplete="current-password"/)
  assert.match(html, /\.showModal\(\)/)
  assert.match(html, /id="open-login"/)
  assert.match(html, /aria-label="关闭登录弹窗"/)
  assert.match(html, /role="alert"/)
  assert.ok(!html.includes(key))
  assert.ok(!html.includes('private-launch-token'))
  const nonce = html.match(/<script nonce="([^"]+)"/)[1]
  assert.ok(response.headers.get('content-security-policy').includes(`'nonce-${nonce}'`))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('set-cookie'), null)
})

test('valid key exchanges the private launch token and returns a secure session cookie', async t => {
  const { post, exchanges } = await fixture(t)
  const response = await post(new URLSearchParams({ key }))
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/')
  assert.match(response.headers.get('set-cookie'), /; Secure/)
  assert.deepEqual(exchanges, [{ url: '/?token=private-launch-token', host: 'harness.vrelay.cc' }])
  assert.ok(!(await response.text()).includes('private-launch-token'))
})

test('eight-character keys containing spaces and form symbols authenticate exactly', async t => {
  const loginKey = ' +&%=!? '
  const { post, exchanges } = await fixture(t, { loginKey })
  assert.equal((await post(new URLSearchParams({ key: loginKey }))).status, 303)
  assert.equal((await post(new URLSearchParams({ key: loginKey.trim() }))).status, 401)
  assert.equal(exchanges.length, 1)
})

test('long Unicode keys authenticate beyond the former form limit using percent encoding', async t => {
  const loginKey = '口令🔐&+ =%'.repeat(800)
  const { post, exchanges } = await fixture(t, { loginKey })
  const body = 'key=' + [...Buffer.from(loginKey)].map(byte => '%' + byte.toString(16).padStart(2, '0')).join('')
  assert.ok(body.length > 4096)
  assert.equal((await post(body)).status, 303)
  assert.equal((await post(body + '&padding=1')).status, 413)
  assert.equal(exchanges.length, 1)
})

test('incorrect and duplicate keys remain signed out with a visible error', async t => {
  const { post, exchanges } = await fixture(t)
  for (const body of ['key=wrong', `key=${key}&key=${key}`, '']) {
    const response = await post(body)
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.match(await response.text(), /密钥有误，请检查后重试/)
  }
  assert.equal(exchanges.length, 0)
})

test('cross-site requests and unsupported bodies never exchange credentials', async t => {
  const { post, exchanges } = await fixture(t)
  const cases = [
    [{ origin: 'https://other.example' }, 403],
    [{ 'sec-fetch-site': 'cross-site' }, 403],
    [{ 'content-type': 'application/json' }, 415],
  ]
  for (const [headers, status] of cases) {
    assert.equal((await post(`key=${key}`, headers)).status, status)
  }
  assert.equal((await post(`key=${'a'.repeat(4097)}`)).status, 413)
  assert.equal(exchanges.length, 0)
})

test('unready Harness returns an actionable error and a failing health check', async t => {
  const { origin, post, exchanges } = await fixture(t, { token: null })
  assert.equal((await fetch(`${origin}/healthz`)).status, 503)
  const response = await post(`key=${key}`)
  assert.equal(response.status, 503)
  assert.match(await response.text(), /服务正在启动，请稍后再试/)
  assert.equal(exchanges.length, 0)
})

test('failed session exchange never reports a successful login', async t => {
  const { post } = await fixture(t, { status: 401 })
  const response = await post(`key=${key}`)
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('set-cookie'), null)
  assert.match(await response.text(), /登录暂未完成，请稍后重试/)
})

test('query credentials are removed, HEAD has no body, and unknown POSTs are rejected', async t => {
  const { origin } = await fixture(t)
  const redirect = await fetch(`${origin}/?token=untrusted`, { redirect: 'manual' })
  assert.equal(redirect.status, 303)
  assert.equal(redirect.headers.get('location'), '/')
  assert.equal(await (await fetch(origin, { method: 'HEAD' })).text(), '')
  assert.equal((await fetch(`${origin}/other`, { method: 'POST' })).status, 405)
  assert.equal((await fetch(`${origin}/healthz`)).status, 200)
})
