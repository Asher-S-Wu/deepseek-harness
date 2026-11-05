/** Access-key exchange for the Railway HTTPS proxy; Harness owns session signing. */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, request } from 'node:http'
import { loginPage } from './login-page.mjs'

function exchangeSession({ harnessPort, host, launchToken }) {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: '127.0.0.1', port: harnessPort,
      path: '/?token=' + encodeURIComponent(launchToken), headers: { host }, method: 'GET',
    }, res => {
      res.resume()
      const cookies = res.headers['set-cookie']
      if (res.statusCode !== 303 || !cookies?.some(cookie => cookie.startsWith('dsh-auth-'))) {
        reject(new Error('Harness rejected the session exchange'))
        return
      }
      resolve(cookies.map(cookie => /;\s*secure(?:;|$)/i.test(cookie) ? cookie : cookie + '; Secure'))
    })
    req.setTimeout(10000, () => req.destroy(new Error('Harness session exchange timed out')))
    req.on('error', reject)
    req.end()
  })
}

/**
 * Create the loopback-only login listener behind the rate-limited HTTPS proxy.
 * A successful POST sets Harness's existing signed cookie; failures leave the visitor signed out.
 * @param {{key: string, publicUrl: string, harnessPort: number, getLaunchToken: () => (string | undefined)}} options - Deployment credentials and private Harness listener.
 * @returns {import('node:http').Server} Unbound server owned by the deployment supervisor.
 */
export function createLoginServer({ key, publicUrl, harnessPort, getLaunchToken }) {
  const url = new URL(publicUrl)
  const expected = Buffer.from(key)
  return createServer(async (req, res) => {
    const nonce = randomBytes(18).toString('base64')
    const headers = {
      'cache-control': 'no-store', 'referrer-policy': 'same-origin', 'x-content-type-options': 'nosniff',
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    }
    const respond = (status, message) => {
      res.writeHead(status, { ...headers, 'content-type': 'text/html; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : loginPage(message, nonce))
    }
    try {
      const path = new URL(req.url, 'http://localhost')
      if (path.pathname === '/healthz') {
        const ready = Boolean(getLaunchToken())
        res.writeHead(ready ? 200 : 503, { ...headers, 'content-type': 'text/plain' })
        res.end(req.method === 'HEAD' ? undefined : ready ? 'ok\n' : 'starting\n')
        return
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (path.search) {
          res.writeHead(303, { ...headers, location: '/' })
          res.end()
        } else respond(200, '')
        return
      }
      if (req.method !== 'POST' || path.pathname !== '/__auth/login') {
        res.writeHead(405, { ...headers, allow: 'GET, HEAD, POST' })
        res.end()
        return
      }
      if (req.headers.origin !== url.origin || req.headers['sec-fetch-site'] === 'cross-site') {
        respond(403, '请从本站登录页面提交密钥')
        return
      }
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
        respond(415, '请使用页面中的密钥输入框')
        return
      }
      let size = 0
      const chunks = []
      for await (const chunk of req) {
        size += chunk.length
        if (size > 4096) {
          respond(413, '输入内容过长，请检查密钥')
          return
        }
        chunks.push(chunk)
      }
      const values = new URLSearchParams(Buffer.concat(chunks).toString('utf8')).getAll('key')
      const actual = Buffer.from(values.length === 1 ? values[0] : '')
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        respond(401, '密钥有误，请检查后重试')
        return
      }
      const launchToken = getLaunchToken()
      if (!launchToken) {
        respond(503, '服务正在启动，请稍后再试')
        return
      }
      const cookies = await exchangeSession({ harnessPort, host: url.host, launchToken })
      res.writeHead(303, { ...headers, location: '/', 'set-cookie': cookies })
      res.end()
    } catch (error) {
      console.error('Harness login exchange failed:', error.message)
      if (!res.headersSent && !res.destroyed) respond(502, '登录暂未完成，请稍后重试')
    }
  })
}
