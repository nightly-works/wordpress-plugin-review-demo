# Security review: a client-invoice plugin for WordPress (sample report)

*The plugin is fictional, built for this demo: a custom plugin that lets a small agency's clients see their invoices and add notes, of the kind written for one site and never reviewed. Review by an AI agent (Claude), Nightly Works.*

**Scope**: the plugin's AJAX handlers, its REST route, its admin screen and its database table. WordPress core, the theme, other plugins and the hosting are out of scope here.
**Method**: source read; each suspected flaw reproduced over HTTP against a fresh WordPress 7.1.3 (PHP 8.3) with the plugin and two test clients, then fixed and re-run. Nothing was tested on a live site.
**Result**: 5 findings: 2 critical, 2 high, 1 medium. All fixed, each with a test that fails if the flaw comes back (checked by removing each capability check and escaping call in turn).

## Summary for the owner

Today anyone on the internet can download every client's invoice, bank details included, by counting through invoice numbers, and list every invoice's reference, client and amount with one crafted link to the lookup address your spreadsheet uses. Any client account can also change the address that receives a copy of each new invoice to its own, and a client can leave a note that runs code in your browser when you open the Invoices screen, with your administrator rights. After the fixes clients use the portal as before; the spreadsheet must sign in with an administrator's application password (over HTTPS).

## The rule behind all five

In WordPress, a handler registered with `wp_ajax_nopriv_` or a REST route with `'__return_true'` is open to anyone on the internet, and a `wp_ajax_` handler without `current_user_can()` is open to any logged-in account, a subscriber included: being registered is not a permission check. Each request needs answers in code to who is asking (logged in, which capability) and whether this record is theirs; each request that changes something also needs proof that it came from your own screen (a nonce). And anything stored is printed with an `esc_*` function, whoever wrote it.

## Findings

### 1. Any visitor reads any invoice by id (critical)

**What**: `cil_invoice` is registered for logged-out visitors (`wp_ajax_nopriv_cil_invoice`) and returns the invoice with the id it is given, without checking whose it is.
**Impact**: `admin-ajax.php?action=cil_invoice&id=2` returns another client's invoice, amount and IBAN; counting ids downloads them all.
**Reproduced**: a visitor and a logged-in client both read Bob's invoice and IBAN (test 1, flawed).
**Fix**: logged-in handler only; the invoice is returned only to its owner or an administrator; anything else answers "not found", so ids cannot be probed.
**Verified**: both refused, Alice gets 404 (test 1, fixed); clients and the administrator still read what they should (normal use).

### 2. Any subscriber redirects the invoice copies (high)

**What**: `cil_save_settings` is a `wp_ajax_` handler: WordPress only checks that someone is logged in. No capability check, no nonce.
**Impact**: a client account (or any account, if registration is open) sets the address meant to receive a copy of every new invoice to its own, and would then receive the other clients' invoices. The demo stops at the setting: it sends no email.
**Reproduced**: Bob changes the address; the Invoices screen shows his (tests 2 and 2b, flawed).
**Fix**: `check_ajax_referer('cil_save_settings')` and `current_user_can('manage_options')`; the settings nonce is printed for administrators only.
**Verified**: Bob gets 403 and the address is unchanged, both without a nonce (test 2, fixed) and with a valid one from a test-only helper, which shows the capability check holds on its own (test 2b, fixed); the administrator still changes it (normal use).

### 3. An open lookup route with SQL built from the query string (critical)

**What**: `GET /wp-json/cil/v1/lookup` has `'permission_callback' => '__return_true'` and puts the `email` parameter inside the SQL string.
**Impact**: anyone lists a client's invoices from their email address; `email=x' OR '1'='1` lists every invoice. The same injection works in more damaging forms depending on the database.
**Reproduced**: a visitor lists Bob's invoices, then every invoice (test 3, flawed); the injected condition also matches every row for an administrator (test 3b, flawed).
**Fix**: the route requires `manage_options`, so the spreadsheet must now sign in with an administrator's application password (WordPress offers them over HTTPS); the parameter must be a string; the value goes through `$wpdb->prepare()` with `%s`.
**Verified**: visitors get 401 before any SQL runs (test 3, fixed); for a signed-in administrator the injected email matches nothing (test 3b, fixed); the administrator's lookup still works (normal use, signed in with a cookie; the application-password sign-in is WordPress's own and not tested here).

### 4. A client's note runs as script in the administrator's screen (high)

**What**: notes are saved as typed, and every column is printed without escaping on the Invoices admin screen.
**Impact**: a client writes a note that loads a script; when an administrator opens the screen, it runs with their session and can, for example, create an administrator account or install a plugin. Markup that reaches the table another way (here, a reference imported from an accounting export) runs the same way.
**Reproduced**: the note is printed as a live `<script>` tag, and the imported reference as a live `<img onerror>` (tests 4 and 4b, flawed).
**Fix**: `sanitize_textarea_field()` when saving a note, `esc_html()` on every value printed (reference, email, amount, note).
**Verified**: the note's text is shown without its tag (test 4, fixed); the imported reference is shown as text (test 4b, fixed), which only the escaping on output achieves.

### 5. Notes change without a nonce (medium)

**What**: `cil_add_note` accepts any POST from a logged-in client's browser.
**Impact**: a page on another site can submit a form that changes a client's note through their browser (cross-site request forgery), for example "Paid already, ignore reminders".
**Reproduced**: a request without a nonce changes the note (test 5, flawed).
**Fix**: `check_ajax_referer('cil_add_note')`, with the nonce printed on the admin screens the client uses (a front-end portal page would print it with `wp_localize_script()`).
**Verified**: the same request gets 403 and the note is unchanged (test 5, fixed); the client still adds notes to their own invoices and not to others' (normal use).

## Not covered here

Hosting and server configuration, other plugins and the theme, rate limits on the login page, backups, and whether IBANs need to be stored at all (worth asking: if the plugin only shows the agency's own bank details, they belong in a setting, not in each invoice row).

## How to check it yourself

`npm ci && npm test` boots a fresh WordPress for each copy of the plugin with WordPress Playground and runs every attack and every normal use against both. `git diff --no-index flawed fixed` shows each change.
