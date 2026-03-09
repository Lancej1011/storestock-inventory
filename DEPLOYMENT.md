# Deployment Guide

This guide explains how to deploy StoreStock Inventory to Netlify (frontend) and Railway (backend).

## Prerequisites

- GitHub, GitLab, or Bitbucket account
- Porkbun account (for domain)
- Railway account (free tier)
- Netlify account (free tier)

---

## Step 1: Deploy Backend to Railway

### 1.1 Push Your Code to GitHub
```bash
# Initialize git if not already done
git init
git add .
git commit -m "Prepare for deployment"

# Create a GitHub repository and push your code
git remote add origin https://github.com/your-username/storestock-inventory.git
git push -u origin main
```

### 1.2 Set Up Railway Project
1. Go to [Railway.app](https://railway.app) and sign in
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Select the `server` folder as the root (or configure it in railway.json)

### 1.3 Add Database
1. In your Railway project, click "New" → "Database" → "Add PostgreSQL"
2. Wait for the database to provision

### 1.4 Configure Environment Variables
1. Go to your Railway service → "Variables" tab
2. Add these variables:
   - `DATABASE_URL` - Copy from the PostgreSQL service (it will be auto-populated)
   - `JWT_SECRET` - Generate a secure string: `openssl rand -base64 32`
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `CLIENT_URL` = Your Netlify URL (e.g., `https://your-app.netlify.app`)

### 1.5 Run Database Migrations
1. In Railway, go to your service → "Deployments"
2. Find a deployment and click the "..." → "Rebuild" after adding env vars
3. Or use Railway CLI to run migrations:
   ```bash
   npm install -g railway
   railway login
   railway run npx prisma migrate deploy
   ```

---

## Step 2: Deploy Frontend to Netlify

### 2.1 Connect to Netlify
1. Go to [Netlify](https://netlify.com) and sign in
2. Click "Add new site" → "Import an existing project"
3. Select your GitHub repository
4. Configure:
   - Build command: `npm run build`
   - Publish directory: `client/dist`

### 2.2 Configure Environment Variables
In Netlify site settings → "Environment Variables", add:
- `VITE_API_URL` = `/api`

### 2.3 Update API Proxy
After deploying Railway, you'll get a URL like `https://your-app.railway.app`

1. Edit `client/netlify.toml`
2. Replace `your-app-name.railway.app` with your actual Railway subdomain:
```toml
[[redirects]]
  from = "/api/*"
  to = "https://your-actual-subdomain.railway.app/api/:splat"
  status = 200
  force = true
```
3. Commit and push - Netlify will redeploy

---

## Step 3: Connect Your Domain (Porkbun)

### 3.1 Get Netlify DNS Servers
1. In Netlify, go to "Domain Management"
2. Click "Add custom domain"
3. Enter your domain (e.g., `inventory.yourstore.com`)
4. Netlify will provide DNS servers (e.g., `dns1.p01.nsone.net`)

### 3.2 Configure Porkbun
1. Log in to [Porkbun](https://porkbun.com)
2. Go to "DNS"
3. Change nameservers to Netlify's DNS servers

### 3.3 Wait for Propagation
DNS changes can take 24-48 hours, but usually complete in a few minutes.

---

## Quick Reference

| Component | URL Pattern | Notes |
|-----------|-------------|-------|
| Frontend | `https://yourdomain.com` | Netlify |
| API | `https://your-app.railway.app/api` | Railway |
| Database | Managed by Railway | PostgreSQL |

---

## Troubleshooting

### CORS Errors
- Ensure `CLIENT_URL` in Railway matches your Netlify URL exactly
- Include `https://` prefix

### Database Connection
- Verify `DATABASE_URL` is correct in Railway
- Ensure Prisma schema is pushed: `npx prisma db push`

### Build Failures
- Check that `npm run build` works locally
- Verify Node.js version (use Node 18+)
