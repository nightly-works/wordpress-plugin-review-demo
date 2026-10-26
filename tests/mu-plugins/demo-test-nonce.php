<?php
// Test-only helper, mounted by scripts/run-tests.mjs and never part of the plugin: hands the
// signed-in user a nonce for any action, so a test can show that a capability check holds
// even when the request carries a valid nonce.
add_action('wp_ajax_demo_test_nonce', function (): void {
    wp_send_json_success(wp_create_nonce(sanitize_key($_GET['for'] ?? '')));
});
