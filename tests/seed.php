<?php
// Demo data: two client accounts with one invoice each. Loaded by blueprint.json only.
global $wpdb;
foreach (['alice' => 'alice@client-a.test', 'bob' => 'bob@client-b.test'] as $login => $email) {
    $id = wp_insert_user(['user_login' => $login, 'user_pass' => 'demo-password', 'user_email' => $email, 'role' => 'subscriber']);
    $wpdb->insert($wpdb->prefix . 'cil_invoices', [
        'user_id' => $id,
        'client_email' => $email,
        'reference' => 'INV-' . strtoupper($login),
        'amount_cents' => $login === 'alice' ? 120000 : 98000,
        'iban' => $login === 'alice' ? 'FR7630006000011234567890189' : 'DE89370400440532013000',
        'note' => '',
    ]);
}
// An invoice imported from the agency's accounting export, whose reference holds markup
// (under 40 characters: wpdb refuses values longer than the column).
$wpdb->insert($wpdb->prefix . 'cil_invoices', [
    'user_id' => get_user_by('login', 'alice')->ID,
    'client_email' => 'alice@client-a.test',
    'reference' => 'INV-<img src=x onerror=alert(1)>',
    'amount_cents' => 4500,
    'iban' => 'FR7630006000011234567890189',
    'note' => '',
]);
// Written last: scripts/run-tests.mjs starts the tests only once this file is served.
file_put_contents(ABSPATH . 'demo-seeded.txt', 'ok');
