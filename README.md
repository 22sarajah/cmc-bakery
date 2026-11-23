# CMC Bakery — Turso database edition

This version stores bakery users, records, audit entries and settings in Turso rather than Render's temporary local filesystem. Render's free web service can therefore restart without losing those database records, provided the Turso database remains active and credentials are configured correctly.

## IMPORTANT before deploying

- This package contains application code, not your live database contents.
- It does NOT automatically copy users, staff accounts, records, or uploaded logos from the old Render SQLite database.
- If you have entered any records or created employee accounts in the old app, stop and tell us before replacing the deployment. The CSV export contains operational records only; it does not export users or passwords.
- Do not delete your Turso database.
- Never put the Turso auth token in GitHub or share it in chat.

## Render environment variables

In Render → CMC Bakery service → Environment, add:

- `TURSO_DATABASE_URL` = your Turso database URL (starts with `libsql://`)
- `TURSO_AUTH_TOKEN` = the Read/Write token created in Turso
- Keep `ADMIN_USERNAME` as `admin`.
- Keep `ADMIN_PASSWORD` set to your administrator password. It is used only when the Turso database is first initialized.
- Keep `SESSION_SECRET` set to a long random secret.

The app refuses to start if the Turso URL or token is missing. On first connection, it creates the tables and initial admin account. If the Turso database already has a user, it does not overwrite that user or reset the password.

## Deploy

Upload the contents of this ZIP to the root of the existing `cmc-bakery` GitHub repository, replacing `server.js`, `package.json`, `render.yaml`, and `README.md`. Keep the existing `public` folder and all its files.

Render should redeploy after the GitHub commit. Check logs for `CMC Bakery running ... with Turso database`, then test login and a test sale.

## Notes

- Employee sessions are still stored locally on Render, so a restart may sign employees out; they can sign in again. Bakery records are stored in Turso.
- Uploaded logo image files are still stored on Render's temporary filesystem. Re-upload the PNG logo if it disappears after a restart.
- This is still an operational MVP, not a full statutory accounting package. Debtor and supplier balances are estimates, not invoice-level reconciled ledgers. Export/backup data regularly.
