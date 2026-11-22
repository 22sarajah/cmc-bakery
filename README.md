# CMC Bakery Management System

A deployable first-version web application for CMC Bakery, configured for Nigerian Naira (₦) and multiple employee roles.

## Included
- Admin login and role-based employee accounts
- Sales, debtor payments, dispatches and returns
- Supplier purchases, supplier payments and expenses
- Production records and flour consumption
- Store receipts and issues to production
- Dashboard, reports, CSV export and audit trail
- Replaceable PNG bakery-logo upload
- SQLite database with persistent storage configuration for Render

## Deploy today using Render

### 1. Prepare the files
1. Download and extract `cmc-bakery-deploy.zip`.
2. Create or sign in to a GitHub account at https://github.com.
3. Create a new repository named `cmc-bakery`.
4. Upload the extracted contents (the `package.json`, `server.js`, `render.yaml`, `public` folder, etc.) to the repository root. Do not upload a nested folder containing all the files.

### 2. Create the hosted application
1. Create or sign in to Render at https://render.com.
2. Choose **New +** → **Blueprint**.
3. Connect GitHub and select the `cmc-bakery` repository.
4. Render reads `render.yaml` and proposes the web service and persistent disk.
5. When prompted for `ADMIN_PASSWORD`, enter a strong, unique password. Keep it private and save it in a password manager.
6. Confirm and deploy. Wait for the build and deploy to finish.

### 3. Sign in
1. Open the public `onrender.com` URL shown in the Render dashboard.
2. Sign in with username `admin` and the `ADMIN_PASSWORD` you supplied.
3. Open **User management** and create named employee accounts with the appropriate roles.
4. Upload the official CMC Bakery logo as a PNG (maximum 2 MB).

### 4. Test before business use
- Enter a test sale, debtor payment, supplier purchase and supplier payment.
- Enter a production batch and stock receipt/issue.
- Check the dashboard and CSV export.
- Sign out and test an employee account to confirm its permissions.
- Remove test records only after confirming the workflow; administrator deletion is permanent.

## Local test (optional)
Requires Node.js 20 or later.

```bash
npm install
```

Set environment variables and start:

Linux/macOS:
```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='Your-Strong-Unique-Password' SESSION_SECRET='Use-a-long-random-secret' npm start
```

Windows PowerShell:
```powershell
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='Your-Strong-Unique-Password'
$env:SESSION_SECRET='Use-a-long-random-secret'
npm start
```

Open http://localhost:3000.

## Important operational and accounting limitations
This is an MVP for operational record keeping, not a complete statutory accounting package. Before relying on it for financial statements, it still needs invoice-level debtor allocations, supplier-bill allocations, reconciled stock costing, full period-filtered reporting, double-entry bookkeeping, tax handling and backup/restore procedures. Current dashboard debtor and supplier balances are estimates from aggregate entries, not individual reconciled ledgers. Have your accountant validate the process before live financial reliance.

## Security and backups
- Never commit passwords or secrets to GitHub.
- Use unique accounts; do not share the administrator login.
- The Render blueprint uses a persistent disk mounted at `/var/data` so SQLite and uploaded logos persist across restarts.
- Arrange regular backups of the persistent database and uploaded logo files before entering important business records.
- Use a paid hosting plan with persistent storage for ongoing business operations.
