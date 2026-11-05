/** Validate the Railway listener and private Harness startup announcement. */

/**
 * Resolve required deployment variables before opening listeners or changing files.
 * Single-line access keys require eight Unicode code points, with no maximum length.
 * @param {NodeJS.ProcessEnv} env - Railway service environment.
 * @returns {{port: number, publicUrl: URL, home: string, workspace: string, key: string}} Validated configuration.
 */
export function deploymentConfig(env) {
  for (const name of ['PORT', 'PUBLIC_URL', 'DSH_HOME', 'DSH_WORKSPACE', 'VRELAY_API_KEY', 'HARNESS_LOGIN_KEY']) {
    if (!env[name]) throw new Error('Missing required variable: ' + name)
  }
  if ([...env.HARNESS_LOGIN_KEY].length < 8) {
    throw new Error('HARNESS_LOGIN_KEY must contain at least 8 characters')
  }
  if (/[\r\n]/u.test(env.HARNESS_LOGIN_KEY)) {
    throw new Error('HARNESS_LOGIN_KEY must be a single line, matching the browser password field')
  }
  const port = Number(env.PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3080 || port === 3090) {
    throw new Error('PORT must be a valid port other than private ports 3080 and 3090')
  }
  const publicUrl = new URL(env.PUBLIC_URL)
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password
    || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash
    || !/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(publicUrl.host)) {
    throw new Error('PUBLIC_URL must be an HTTPS root URL without credentials, query, or fragment')
  }
  return { port, publicUrl, home: env.DSH_HOME, workspace: env.DSH_WORKSPACE, key: env.HARNESS_LOGIN_KEY }
}

/**
 * Extract the private launch token without logging its announcement.
 * @param {string} line - One complete Harness output line.
 * @param {string} origin - Configured public HTTPS origin.
 * @returns {string | undefined} Token, or undefined for an ordinary log line.
 */
export function readLaunchToken(line, origin) {
  if (!line.startsWith('dsh web: ')) return undefined
  let announced
  try {
    announced = new URL(line.slice('dsh web: '.length))
  } catch (error) {
    throw new Error('Harness announced an unexpected login endpoint', { cause: error })
  }
  const tokens = announced.searchParams.getAll('token')
  if (announced.origin !== origin || announced.pathname !== '/' || tokens.length !== 1 || !tokens[0]) {
    throw new Error('Harness announced an unexpected login endpoint')
  }
  return tokens[0]
}
