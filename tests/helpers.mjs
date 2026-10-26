export const variant = process.env.VARIANT ?? 'fixed';
export const base = process.env.WP_BASE ?? 'http://127.0.0.1:9411';

// Logs in through wp-login.php and returns a fetch that sends the session cookies.
export async function loginAs(user, password = 'demo-password') {
  const jar = new Map([['wordpress_test_cookie', 'WP%20Cookie%20check']]);
  const send = async (path, init = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(base + path, { redirect: 'manual', ...init, headers: { cookie, ...(init.headers ?? {}) } });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      jar.set(k, v);
    }
    return res;
  };
  const res = await send('/wp-login.php', {
    method: 'POST',
    body: new URLSearchParams({ log: user, pwd: password, testcookie: '1', redirect_to: '/wp-admin/' }),
  });
  if (res.status !== 302) throw new Error(`login failed for ${user}: ${res.status}`);
  // The REST API treats cookie requests as logged out unless they carry a wp_rest nonce;
  // WordPress core hands one out through admin-ajax's rest-nonce action.
  send.restNonce = async () => (await (await send('/wp-admin/admin-ajax.php?action=rest-nonce')).text()).trim();
  return send;
}

export const anonymous = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });

export const form = fields => ({ method: 'POST', body: new URLSearchParams(fields) });

// A valid nonce for any action, from the test-only helper in tests/mu-plugins/.
export async function anyNonce(send, action) {
  const body = await (await send(`/wp-admin/admin-ajax.php?action=demo_test_nonce&for=${action}`)).json();
  return body.data;
}

// The nonce the plugin prints for this user and action on admin screens, or '' if none.
export async function nonceFor(send, action) {
  const page = await (await send('/wp-admin/profile.php')).text();
  const nonces = page.match(/var cilNonces = (\{.*?\});/)?.[1];
  return nonces ? (JSON.parse(nonces)[action] ?? '') : '';
}
