// What the plugin is for keeps working, on flawed/ and fixed/ alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginAs, form, nonceFor, variant } from './helpers.mjs';

test(`normal ${variant}: a client reads their own invoice`, async () => {
  const alice = await loginAs('alice');
  const body = await (await alice('/wp-admin/admin-ajax.php?action=cil_invoice&id=1')).json();
  assert.equal(body.data.reference, 'INV-ALICE');
});

test(`normal ${variant}: the administrator reads any invoice`, async () => {
  const admin = await loginAs('admin', 'password');
  const body = await (await admin('/wp-admin/admin-ajax.php?action=cil_invoice&id=2')).json();
  assert.equal(body.data.reference, 'INV-BOB');
});

test(`normal ${variant}: a client adds a note to their own invoice, not to another's`, async () => {
  const bob = await loginAs('bob');
  const nonce = await nonceFor(bob, 'cil_add_note');
  await bob('/wp-admin/admin-ajax.php', form({ action: 'cil_add_note', id: '2', note: 'PO 9001', _ajax_nonce: nonce }));
  await bob('/wp-admin/admin-ajax.php', form({ action: 'cil_add_note', id: '1', note: 'Bob was here', _ajax_nonce: nonce }));
  const admin = await loginAs('admin', 'password');
  const page = await (await admin('/wp-admin/admin.php?page=cil-invoices')).text();
  assert.ok(page.includes('PO 9001'));
  assert.ok(!page.includes('Bob was here'));
});

test(`normal ${variant}: the administrator changes where invoice copies go`, async () => {
  const admin = await loginAs('admin', 'password');
  const nonce = await nonceFor(admin, 'cil_save_settings');
  const res = await admin('/wp-admin/admin-ajax.php', form({ action: 'cil_save_settings', notify_email: 'billing@agency.test', _ajax_nonce: nonce }));
  assert.equal(res.status, 200);
  const page = await (await admin('/wp-admin/admin.php?page=cil-invoices')).text();
  assert.ok(page.includes('billing@agency.test'));
});

test(`normal ${variant}: the administrator looks a client up by email`, async () => {
  const admin = await loginAs('admin', 'password');
  const nonce = await admin.restNonce();
  const rows = await (await admin(`/?rest_route=/cil/v1/lookup&email=${encodeURIComponent('bob@client-b.test')}`, { headers: { 'X-WP-Nonce': nonce } })).json();
  assert.deepEqual(rows.map(r => r.reference), ['INV-BOB']);
});
