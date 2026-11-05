/** Supervise the repository's dsh web profile, access-key login, and Railway edge proxy. */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { deploymentConfig, readLaunchToken } from './config.mjs'
import { createLoginServer, loginRequestBodyLimit } from './login-server.mjs'
import { nginxConfig } from './nginx.mjs'

/**
 * Launch the built dsh profile over the existing persistent Harness home.
 * Child failure stops all listeners and exits unsuccessfully; Railway owns process restart.
 * @returns {Promise<void>} Settles after both child processes and the login listener close.
 */
export async function start() {
  const config = deploymentConfig(process.env)
  const root = resolve(import.meta.dirname, '../..')
  const version = JSON.parse(readFileSync(join(root, 'apps/cli/package.json'), 'utf8')).version
  if (!/^[0-9A-Za-z.+-]+$/.test(version)) throw new Error('Invalid Harness package version')
  mkdirSync(config.home, { recursive: true })
  mkdirSync(config.workspace, { recursive: true })
  const configPath = '/tmp/harness-nginx.conf'
  writeFileSync(configPath, nginxConfig({
    port: config.port, host: config.publicUrl.host, version, loginBodyLimit: loginRequestBodyLimit(config.key),
  }))
  const checked = spawnSync('nginx', ['-t', '-c', configPath], { encoding: 'utf8' })
  if (checked.error || checked.status !== 0) {
    throw new Error('Nginx configuration failed: ' + (checked.error?.message ?? checked.stderr))
  }

  let launchToken
  const login = createLoginServer({
    key: config.key, publicUrl: config.publicUrl.href, harnessPort: 3080, getLaunchToken: () => launchToken,
  })
  login.listen(3090, '127.0.0.1')
  await once(login, 'listening')
  const children = []
  const readers = []
  let stopping = false
  let loginClosed
  function stop(code) {
    if (stopping) return
    stopping = true
    launchToken = undefined
    process.exitCode = code
    loginClosed = new Promise(resolve => login.close(resolve))
    login.closeAllConnections()
    for (const child of children) child.kill('SIGTERM')
  }
  function watch(child, name) {
    children.push(child)
    return new Promise(resolve => {
      child.once('error', error => {
        console.error(name + ' failed to start: ' + error.message)
        stop(1)
      })
      child.once('close', (code, signal) => {
        if (!stopping) {
          console.error(`${name} stopped (code=${code}, signal=${signal})`)
          stop(1)
        }
        resolve()
      })
    })
  }
  const onSignal = () => stop(0)
  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onSignal)
  login.on('error', error => {
    console.error('Login listener failed: ' + error.message)
    stop(1)
  })
  const harness = spawn(process.execPath, [
    join(root, 'apps/cli/lib/bin.js'), 'web', '--no-open', '--host', '127.0.0.1', '--port', '3080',
    '--public-url', config.publicUrl.href, '--trusted-host', config.publicUrl.host,
  ], { cwd: config.workspace, stdio: ['ignore', 'pipe', 'pipe'] })
  const harnessClosed = watch(harness, 'Harness')
  for (const [stream, output] of [[harness.stdout, process.stdout], [harness.stderr, process.stderr]]) {
    const reader = createInterface({ input: stream })
    readers.push(reader)
    reader.on('line', line => {
      let token
      try {
        token = readLaunchToken(line, config.publicUrl.origin)
      } catch (error) {
        console.error(error.message)
        stop(1)
        return
      }
      if (token) {
        if (stopping) return
        launchToken = token
        console.log('Harness key login ready at ' + config.publicUrl.origin)
      } else output.write(line + '\n')
    })
  }
  const proxy = spawn('nginx', ['-c', configPath, '-g', 'daemon off;'], { stdio: 'inherit' })
  await Promise.all([harnessClosed, watch(proxy, 'Nginx')])
  await loginClosed
  for (const reader of readers) reader.close()
  process.off('SIGTERM', onSignal)
  process.off('SIGINT', onSignal)
}

if (import.meta.main) {
  try {
    await start()
  } catch (error) {
    console.error('Railway Harness startup failed: ' + error.message)
    process.exitCode = 1
  }
}
