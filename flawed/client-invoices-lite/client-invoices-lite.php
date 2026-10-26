<?php
/**
 * Plugin Name: Client Invoices Lite
 * Description: Lets a small agency's clients see and comment on their invoices. Fictional plugin used as a security review demo.
 * Version: 1.0.0
 * Requires PHP: 8.1
 */

if (!defined('ABSPATH')) {
    exit;
}

function cil_table(): string
{
    global $wpdb;
    return $wpdb->prefix . 'cil_invoices';
}

register_activation_hook(__FILE__, 'cil_activate');

function cil_activate(): void
{
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = cil_table();
    dbDelta("CREATE TABLE $table (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        user_id bigint(20) unsigned NOT NULL,
        client_email varchar(190) NOT NULL,
        reference varchar(40) NOT NULL,
        amount_cents int NOT NULL,
        iban varchar(40) NOT NULL DEFAULT '',
        note text NULL,
        PRIMARY KEY  (id)
    ) " . $wpdb->get_charset_collate() . ';');
    add_option('cil_notify_email', get_option('admin_email'));
}

/* Invoice details for the client portal page. */
add_action('wp_ajax_cil_invoice', 'cil_invoice');
add_action('wp_ajax_nopriv_cil_invoice', 'cil_invoice');

function cil_invoice(): void
{
    global $wpdb;
    $id = (int) ($_GET['id'] ?? 0);
    $invoice = $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . cil_table() . ' WHERE id = %d', $id), ARRAY_A);
    if (!$invoice) {
        wp_send_json_error('not found', 404);
    }
    wp_send_json_success($invoice);
}

/* Clients add a note to an invoice (payment date, purchase order number). */
add_action('wp_ajax_cil_add_note', 'cil_add_note');

function cil_add_note(): void
{
    global $wpdb;
    $id = (int) ($_POST['id'] ?? 0);
    $note = wp_unslash($_POST['note'] ?? '');
    $wpdb->update(cil_table(), ['note' => $note], ['id' => $id, 'user_id' => get_current_user_id()]);
    wp_send_json_success();
}

/* Settings: where a copy of every new invoice is emailed. */
add_action('wp_ajax_cil_save_settings', 'cil_save_settings');

function cil_save_settings(): void
{
    update_option('cil_notify_email', sanitize_email(wp_unslash($_POST['notify_email'] ?? '')));
    wp_send_json_success();
}

/* Lookup used by the accounting spreadsheet. */
add_action('rest_api_init', function (): void {
    register_rest_route('cil/v1', '/lookup', [
        'methods' => 'GET',
        'callback' => 'cil_lookup',
        'permission_callback' => '__return_true',
    ]);
});

function cil_lookup(WP_REST_Request $request): array
{
    global $wpdb;
    $email = $request->get_param('email');
    return $wpdb->get_results(
        "SELECT reference, client_email, amount_cents FROM " . cil_table() . " WHERE client_email = '$email'",
        ARRAY_A
    );
}

/* Admin screen listing every invoice. */
add_action('admin_menu', function (): void {
    add_menu_page('Invoices', 'Invoices', 'manage_options', 'cil-invoices', 'cil_admin_page');
});

function cil_admin_page(): void
{
    global $wpdb;
    $rows = $wpdb->get_results('SELECT * FROM ' . cil_table() . ' ORDER BY id', ARRAY_A);
    echo '<div class="wrap"><h1>Invoices</h1>';
    echo '<p>A copy of every new invoice goes to <strong>' . esc_html(get_option('cil_notify_email')) . '</strong>.</p>';
    echo '<table class="widefat">';
    foreach ($rows as $row) {
        echo '<tr><td>' . $row['reference'] . '</td><td>' . $row['client_email'] . '</td><td>'
            . number_format($row['amount_cents'] / 100, 2) . '</td><td class="cil-note">' . $row['note'] . '</td></tr>';
    }
    echo '</table></div>';
}
