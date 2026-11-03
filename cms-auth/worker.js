/* --------------------------------------------------------------------------
 * GitHub sign-in for the website editor (Decap CMS at /admin/).
 *
 * GitHub Pages cannot keep a secret, so this Cloudflare Worker does the one
 * step that needs one: swapping GitHub's sign-in code for an access token.
 *
 *   /auth      sends the editor to GitHub's "Authorize" page
 *   /callback  GitHub returns here; the token is handed back to the editor
 *
 * Settings (Worker → Settings → Variables and Secrets):
 *   GITHUB_CLIENT_ID      from the GitHub OAuth App
 *   GITHUB_CLIENT_SECRET  from the GitHub OAuth App (add as a Secret)
 *   ALLOWED_ORIGINS       sites allowed to receive a token, comma-separated,
 *                         e.g. https://silverpeakdesignbuild.github.io,https://silverpeakdesignbuild.com
 * ------------------------------------------------------------------------ */

const SCOPE = 'public_repo';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth') return startSignIn(url, env);
    if (url.pathname === '/callback') return finishSignIn(request, url, env);
    return new Response('Silver Peak website editor sign-in.', { status: 404 });
  },
};

function startSignIn(url, env) {
  const state = crypto.randomUUID();
  const github = new URL('https://github.com/login/oauth/authorize');
  github.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  github.searchParams.set('redirect_uri', `${url.origin}/callback`);
  github.searchParams.set('scope', SCOPE);
  github.searchParams.set('state', state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: github.toString(),
      'Set-Cookie': `cms_state=${state}; Path=/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

async function finishSignIn(request, url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)cms_state=([^;]+)/);
  if (!code || !state || !cookie || cookie[1] !== state) return reply(env, 'error', 'Sign-in expired. Close this window and try again.');

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) return reply(env, 'error', data.error_description || 'GitHub did not return a token.');
  return reply(env, 'success', { token: data.access_token, provider: 'github' });
}

/** Hand the result to the editor window that opened this popup, but only if it is one of our sites. */
function reply(env, status, content) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const message = `authorization:github:${status}:${JSON.stringify(status === 'success' ? content : { message: content })}`;
  const html = `<!doctype html><html><body><p>Signing you in…</p><script>
(function () {
  var allowed = ${JSON.stringify(allowed)};
  var message = ${JSON.stringify(message)};
  window.addEventListener('message', function (e) {
    if (allowed.indexOf(e.origin) === -1) return;
    window.opener.postMessage(message, e.origin);
  });
  if (window.opener) window.opener.postMessage('authorizing:github', '*');
})();
</script></body></html>`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': 'cms_state=; Path=/callback; Max-Age=0' },
  });
}
