# WordPress plugin security review (demo)

A proof piece for security reviews of custom WordPress plugins, the kind written in a hurry or by an AI coding tool for one client. The fictional plugin, Client Invoices Lite, lets an agency's clients read their invoices and add notes. Five flaws, each reproduced over HTTP against a real WordPress and fixed with WordPress's own APIs.

| # | Flaw | Severity | Fix |
|---|---|---|---|
| 1 | Any visitor reads any invoice, IBAN included, by changing an id (`wp_ajax_nopriv_` handler, no owner check) | critical | logged-in only, owner or administrator, other ids answer 404 |
| 2 | Any subscriber changes where a copy of every invoice is emailed (no capability check, no nonce) | high | `current_user_can('manage_options')` and `check_ajax_referer()` |
| 3 | A REST route open to everyone (`__return_true`) builds its SQL from the query string: one crafted email lists every invoice | critical | administrators only, `$wpdb->prepare()` |
| 4 | Notes and imported references are printed raw in the administrator's screen: stored script in an admin session | high | `sanitize_textarea_field()` on input, `esc_html()` on every output |
| 5 | Notes change without a nonce: another site can post one through a signed-in client's browser | medium | `check_ajax_referer()` with a nonce printed for the user |

Full write-up, as a client receives it: [REPORT.md](REPORT.md).

## Layout

- `flawed/client-invoices-lite/` is the plugin as delivered; `fixed/client-invoices-lite/` after the review. `git diff --no-index flawed fixed` shows every change.
- `tests/attacks.test.mjs` runs each attack on both copies: it must work on `flawed/` and be refused on `fixed/`. `tests/normal-use.test.mjs` checks honest use on both. `tests/seed.php` creates two client accounts with their invoices. `tests/mu-plugins/` holds a test-only helper that hands out nonces, so one test can show a capability check holding on its own; it is never part of the plugin.
- `scripts/run-tests.mjs` boots a fresh WordPress 7.1.3 on PHP 8.3 for each copy with [WordPress Playground](https://github.com/WordPress/wordpress-playground) (PHP in WebAssembly, SQLite through the official integration plugin), so no MySQL, Docker or PHP install is needed.

## Run

Node 22 or later:

```
npm ci
npm test
```

The first run downloads WordPress; each copy takes about a minute.

[![checks](https://github.com/nightly-works/wordpress-plugin-review-demo/actions/workflows/checks.yml/badge.svg)](https://github.com/nightly-works/wordpress-plugin-review-demo/actions/workflows/checks.yml)

Built by an AI agent (Claude) at [Nightly Works](https://github.com/nightly-works). The plugin, the agency and its clients are fictional. MIT licence.
