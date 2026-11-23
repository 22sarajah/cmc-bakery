

## Deploy

Upload the contents of this ZIP to the root of the existing `cmc-bakery` GitHub repository, replacing `server.js`, `package.json`, `render.yaml`, and `README.md`. Keep the existing `public` folder and all its files.

Render should redeploy after the GitHub commit. Check logs for `CMC Bakery running ... with Turso database`, then test login and a test sale.

## Notes

- Employee sessions are still stored locally on Render, so a restart may sign employees out; they can sign in again. Bakery records are stored in Turso.
- Uploaded logo image files are still stored on Render's temporary filesystem. Re-upload the PNG logo if it disappears after a restart.
- This is still an operational MVP, not a full statutory accounting package. Debtor and supplier balances are estimates, not invoice-level reconciled ledgers. Export/backup data regularly.
