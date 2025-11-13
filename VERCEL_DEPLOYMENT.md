# Vercel Deployment Guide

## Configuration Complete

All necessary configuration files have been set up for Vercel deployment.

## Files Configured

### Required Files (All Present)
- `.npmrc` - Configures pnpm as package manager with legacy-peer-deps
- `vercel.json` - Vercel-specific build configuration
- `.eslintrc.json` - Fixed ESLint configuration (removed invalid "next/typescript")
- `src/lib/csv.ts` - Updated Row type with optional `error` property
- `next.config.mjs` - Optimized for Vercel with image formats
- `package.json` - Contains pnpm packageManager specification

### Removed Files
- `netlify.toml` - Removed (conflicts with Vercel)
- `.netlifyignore` - Removed (not needed for Vercel)
- `DEPLOY_NETLIFY.md` - Renamed to `DEPLOY_NETLIFY.md.backup` (kept for reference)

## Environment Variables Required

Set these in Vercel Dashboard → Project Settings → Environment Variables:

1. **GEMINI_API_KEY** (Required)
   - Your Google Gemini API key
   - Used for metadata generation

2. **MISTRAL_API_KEY** (Optional)
   - Your Mistral AI API key
   - Alternative model for metadata generation

## Deployment Steps

1. **Connect Repository to Vercel**
   - Go to https://vercel.com
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will auto-detect Next.js and pnpm

2. **Configure Environment Variables**
   - Add `GEMINI_API_KEY` (required)
   - Add `MISTRAL_API_KEY` (optional)

3. **Deploy**
   - Click "Deploy"
   - Vercel will automatically:
     - Use pnpm (detected from `.npmrc` and `package.json`)
     - Run `pnpm install`
     - Run `pnpm build`
     - Deploy to production

## Build Configuration

- **Framework**: Next.js 14.2.4
- **Package Manager**: pnpm 9.0.0
- **Node Version**: 20 (auto-detected by Vercel)
- **Build Command**: `pnpm build` (from vercel.json)
- **Install Command**: `pnpm install` (from vercel.json)

## Troubleshooting

### If Build Still Fails

1. **Clear Build Cache**
   - Vercel Dashboard → Settings → General → "Clear Build Cache"

2. **Verify Package Manager**
   - Ensure Vercel detects pnpm (check build logs)
   - If not, manually set in Project Settings → General → Package Manager

3. **Check Environment Variables**
   - Ensure all required variables are set
   - Variables are case-sensitive

4. **Check Build Logs**
   - Review detailed error messages in Vercel Dashboard
   - Common issues:
     - Missing environment variables
     - TypeScript errors
     - Missing dependencies

## Recent Changes

- Fixed ESLint configuration (removed invalid "next/typescript" extension)
- Added `error?: string` property to Row type in `src/lib/csv.ts`
- Removed Netlify-specific configuration files
- Configured `.npmrc` for pnpm with legacy-peer-deps
- Created `vercel.json` with explicit pnpm commands

## Notes

- Files are stored client-side using IndexedDB (no server-side storage needed)
- API routes in `src/app/api/*` work as serverless functions automatically
- Sharp library is included and works on Vercel's Node.js runtime
- Function timeout: 10 seconds (free tier) / 60 seconds (Pro tier)

