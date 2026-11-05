import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deploymentConfig, readLaunchToken } from '../config.mjs'
import { nginxConfig } from '../nginx.mjs'

const environment = {
  PORT: '8080', PUBLIC_URL: 'https://harness.vrelay.cc/',
  DSH_HOME: '/data/dsh', DSH_WORKSPACE: '/data/workspaces/default',
  VRELAY_API_KEY: 'model-key', HARNESS_LOGIN_KEY: 'a'.repeat(48),
}

test('deployment requires complete secrets and an HTTPS root URL', () => {
  assert.equal(deploymentConfig(environment).publicUrl.origin, 'https://harness.vrelay.cc')
  for (const name of Object.keys(environment)) {
    assert.throws(() => deploymentConfig({ ...environment, [name]: '' }), /Missing required variable/)
  }
  for (const PUBLIC_URL of ['http://harness.vrelay.cc', 'https://u:p@harness.vrelay.cc', 'https://harness.vrelay.cc/other', 'https://harness.vrelay.cc/?token=x']) {
    assert.throws(() => deploymentConfig({ ...environment, PUBLIC_URL }), /PUBLIC_URL/)
  }
  for (const PORT of ['0', '65536', '3080', '3090', 'eight']) {
    assert.throws(() => deploymentConfig({ ...environment, PORT }), /PORT/)
  }
  assert.throws(() => deploymentConfig({ ...environment, HARNESS_LOGIN_KEY: 'short' }), /HARNESS_LOGIN_KEY/)
})

test('launch readiness accepts only the configured origin and one nonempty private token', () => {
  const origin = 'https://harness.vrelay.cc'
  assert.equal(readLaunchToken('dsh web: https://harness.vrelay.cc/?token=private', origin), 'private')
  assert.equal(readLaunchToken('Loading plugins', origin), undefined)
  for (const line of ['dsh web: broken', 'dsh web: https://other.example/?token=private', 'dsh web: https://harness.vrelay.cc/', 'dsh web: https://harness.vrelay.cc/?token=a&token=b']) {
    assert.throws(() => readLaunchToken(line, origin), /unexpected login endpoint/)
  }
})

test('HTTPS proxy retains websocket forwarding, rate limits, and private-token restrictions', () => {
  const config = nginxConfig({ port: 8080, host: 'harness.vrelay.cc', version: '0.2.2-rc.1' })
  assert.match(config, /listen 8080;/)
  assert.match(config, /location = \/connect \{ return 404; \}/)
  assert.match(config, /limit_req zone=login burst=10 nodelay;/)
  assert.match(config, /error_page 401 = @login;/)
  assert.match(config, /proxy_set_header Upgrade \$http_upgrade;/)
  assert.match(config, /proxy_cookie_flags ~ secure httponly samesite=strict;/)
  assert.ok(!config.includes(environment.HARNESS_LOGIN_KEY))
})
