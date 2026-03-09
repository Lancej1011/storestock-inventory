# StoreStock - Setup Instructions

## Prerequisites

- Node.js 18+ installed
- PostgreSQL 14+ installed

## Step 1: Install PostgreSQL

### Windows (using Chocolatey)
```powershell
choco install postgresql
```

### Windows (manual)
1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer
3. During installation, set:
   - Port: 5432 (default)
   - Password: password (or your preferred password)
   - Username: postgres (default)

### macOS
```bash
brew install postgresql
brew services start postgresql
```

### Linux (Ubuntu)
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

## Step 2: Create the Database

Open pgAdmin or use psql command line:

```sql
CREATE DATABASE storestock;
```

Or via command line:
```bash
psql -U postgres -c "CREATE DATABASE storestock;"
```

## Step 3: Configure Environment Variables

Edit `server/.env` with your PostgreSQL credentials:

```env
DATABASE_URL="postgresql://USERNAME:PASSWORD@localhost:5432/storestock?schema=public"
```

Replace:
- `USERNAME` - Your PostgreSQL username (default: postgres)
- `PASSWORD` - Your PostgreSQL password

Example:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/storestock?schema=public"
```

## Step 4: Generate Prisma Client & Create Tables

```bash
cd server
npx prisma generate
npx prisma db push
```

## Step 5: (Optional) Seed Initial Data

```bash
cd server
npx tsx prisma/seed.ts
```

## Step 6: Start the Application

From the root directory:

```bash
npm run dev
```

This starts:
- Frontend at http://localhost:5173
- Backend API at http://localhost:3000

## Default Login (after seeding)

- Email: admin@store.com
- Password: password123

## Troubleshooting

### "Cannot connect to database"
- Verify PostgreSQL is running: `pg_isready`
- Check your DATABASE_URL in .env
- Ensure database exists: `psql -U postgres -l`

### "Port 5432 already in use"
- Find and stop the process using port 5432
- Or change the port in DATABASE_URL: `...localhost:5433/...`

### "Password authentication failed"
- Check your pg_hba.conf file for authentication settings
- Or reset PostgreSQL password if forgotten
