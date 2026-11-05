/** Chinese access-key dialog served before the authenticated Harness application. */

/**
 * Render the login document without credentials or application data.
 * @param {string} message - Deployment-owned validation message.
 * @param {string} nonce - Per-response Content Security Policy nonce.
 * @returns {string} Complete login document.
 */
export function loginPage(message, nonce) {
  const error = message.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>登录 · Harness</title>
  <style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#252a32;background:#f5f5f3;font-synthesis:none}
    *{box-sizing:border-box}body{margin:0}button,input{font:inherit}button{cursor:pointer}
    .landing{min-height:100svh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
    .brand{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:500;letter-spacing:2px}
    .mark{display:grid;place-items:center;width:34px;height:34px;background:#252a32;color:#fff;border-radius:10px;letter-spacing:0;font-size:20px}
    h1{margin:24px 0 10px;font-size:28px;font-weight:500;letter-spacing:-.5px}
    .landing p{margin:0 0 24px;font-size:14px;color:#74777a;line-height:1.7}
    .primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:12px 22px;border:0;border-radius:10px;background:#252a32;color:#fff;font-size:14px;font-weight:500}
    .primary:hover{background:#3a404a}.primary:disabled{cursor:wait;opacity:.65}
    button:focus-visible{outline:3px solid #5473c3;outline-offset:3px}
    dialog{position:fixed;inset:0;width:min(420px,calc(100% - 32px));max-height:calc(100svh - 32px);margin:auto;padding:32px;border:1px solid #e1e3e5;border-radius:20px;background:#fff;color:inherit;box-shadow:0 24px 80px #20232626;overflow:auto}
    dialog::backdrop{background:#1c20254d;backdrop-filter:blur(6px)}
    .close{position:absolute;top:14px;right:14px;display:grid;place-items:center;width:36px;height:36px;padding:8px;border:0;border-radius:8px;background:transparent;color:#74777a}
    .close:hover{background:#f1f2f3;color:#252a32}.close svg{width:18px;height:18px}
    dialog h2{margin:26px 0 10px;font-size:24px;font-weight:500;letter-spacing:-.4px}
    .description{margin:0 0 26px;color:#74777a;font-size:14px;line-height:1.7}
    label{display:block;margin-bottom:9px;font-size:13px;font-weight:500}
    input{width:100%;height:48px;padding:0 14px;border:1px solid #d9dcdf;border-radius:10px;background:#fff;color:inherit;font-size:16px;outline:none}
    input:focus{border-color:#5473c3;box-shadow:0 0 0 3px #5473c31a}input[aria-invalid="true"]{border-color:#bd3b38}
    .error{min-height:38px;margin:10px 0 8px;color:#bd3b38;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
    form .primary{width:100%}.note{margin:20px 0 0;color:#74777a;font-size:12px;text-align:center;line-height:1.6}
    .spinner{width:15px;height:15px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}
    [hidden]{display:none!important}@keyframes spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.spinner{animation:none}}
    @media(max-width:380px){dialog{padding:28px 22px}dialog h2{font-size:22px}}
    @media(prefers-color-scheme:dark){:root{color:#edf0f2;background:#17191c}.mark{background:#edf0f2;color:#17191c}.landing p,.description,.note,.close{color:#a4a9b0}dialog{background:#202328;border-color:#3b4047;box-shadow:0 24px 80px #0006}dialog::backdrop{background:#080a0d88}input{background:#17191c;border-color:#4a5059}.primary{background:#e2e7ef;color:#202328}.primary:hover{background:#fff}.close:hover{background:#30353c;color:#edf0f2}.error{color:#ff9692}input[aria-invalid="true"]{border-color:#ff9692}}
  </style>
</head>
<body>
  <main class="landing">
    <div class="brand"><span class="mark" aria-hidden="true">H</span>HARNESS</div>
    <h1>你的云端工作空间</h1>
    <p>在这里继续对话，完成工作</p>
    <button class="primary" id="open-login" type="button">登录 Harness</button>
  </main>
  <dialog id="login-dialog" aria-labelledby="login-title" aria-describedby="login-description">
    <button class="close" id="close-login" type="button" aria-label="关闭登录弹窗"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <div class="brand"><span class="mark" aria-hidden="true">H</span>HARNESS</div>
    <h2 id="login-title">登录工作空间</h2>
    <p class="description" id="login-description">输入访问密钥，继续对话与工作</p>
    <form method="post" action="/__auth/login">
      <label for="key">访问密钥</label>
      <input id="key" name="key" type="password" autocomplete="current-password" placeholder="输入访问密钥" required autofocus aria-describedby="login-message" aria-invalid="${Boolean(message)}">
      <div class="error" id="login-message" role="alert">${error}</div>
      <button class="primary" id="submit-login" type="submit"><span class="spinner" hidden aria-hidden="true"></span><span id="submit-label">进入 Harness</span></button>
    </form>
    <p class="note">登录状态将在此浏览器保留 30 天</p>
  </dialog>
  <script nonce="${nonce}">
    const dialog = document.getElementById('login-dialog');
    const opener = document.getElementById('open-login');
    opener.addEventListener('click', () => dialog.showModal());
    document.getElementById('close-login').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => opener.focus());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    document.querySelector('form').addEventListener('submit', () => {
      document.getElementById('submit-login').disabled = true;
      document.getElementById('submit-label').textContent = '正在登录…';
      document.querySelector('.spinner').hidden = false;
      document.getElementById('key').readOnly = true;
      document.getElementById('close-login').disabled = true;
      dialog.setAttribute('aria-busy', 'true');
    });
    window.addEventListener('pageshow', () => {
      document.getElementById('submit-login').disabled = false;
      document.getElementById('submit-label').textContent = '进入 Harness';
      document.querySelector('.spinner').hidden = true;
      document.getElementById('key').readOnly = false;
      document.getElementById('close-login').disabled = false;
      dialog.removeAttribute('aria-busy');
    });
    dialog.showModal();
  </script>
</body>
</html>
`
}
