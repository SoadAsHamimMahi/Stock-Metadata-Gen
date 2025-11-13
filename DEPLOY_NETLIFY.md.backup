# Deploying to Netlify - Complete Guide

## ⚠️ Important Limitations

**File Storage Issue**: Netlify is a serverless platform. Files uploaded to `/public/uploads` will **NOT persist** between deployments or function invocations. You have two options:

1. **Use external storage** (Recommended): AWS S3, Cloudinary, or similar
2. **Use Netlify Large Media** (Paid feature)
3. **Accept temporary storage** (Files only last during function execution)

## Step-by-Step Deployment

### Option 1: Deploy via Netlify Dashboard (Easiest)

1. **Push your code to GitHub/GitLab/Bitbucket**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Go to Netlify Dashboard**
   - Visit https://app.netlify.com
   - Sign up/Login
   - Click "Add new site" → "Import an existing project"
   - Connect your Git repository

3. **Configure Build Settings**
   - **Base directory**: `stock-metadata-gen` (the inner folder)
   - **Build command**: `npm run build`
   - **Publish directory**: `stock-metadata-gen/.next`
   - **Note**: The `netlify.toml` file is already configured with these settings

4. **Set Environment Variables**
   Go to Site settings → Environment variables and add:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   MISTRAL_API_KEY=your_mistral_api_key_here (optional)
   NODE_VERSION=20
   ```

5. **Deploy**
   - Click "Deploy site"
   - Wait for build to complete

### Option 2: Deploy via Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize Netlify**
   ```bash
   cd stock-metadata-gen
   netlify init
   ```
   - Follow prompts to link/create site
   - Choose build command: `npm run build`
   - Choose publish directory: `.next`

4. **Set Environment Variables**
   ```bash
   netlify env:set GEMINI_API_KEY "your_key_here"
   netlify env:set MISTRAL_API_KEY "your_key_here"  # optional
   ```

5. **Deploy**
   ```bash
   netlify deploy --prod
   ```

## Configuration Files Created

- `netlify.toml` - Netlify configuration
- `.netlifyignore` - Files to exclude from deployment

## Important Notes

### 1. File Upload Storage
Since Netlify is serverless, uploaded files won't persist. You need to:

**Option A: Use Cloudinary (Recommended)**
- Sign up at https://cloudinary.com (free tier available)
- Install: `npm install cloudinary`
- Update upload route to use Cloudinary instead of local storage

**Option B: Use AWS S3**
- Set up S3 bucket
- Install: `npm install @aws-sdk/client-s3`
- Update upload route to use S3

**Option C: Use Netlify Large Media** (Paid)
- Enable in Netlify dashboard
- Configure Git LFS

### 2. API Routes
All API routes in `/api/*` will work as serverless functions automatically.

### 3. Build Time
- First build: ~5-10 minutes
- Subsequent builds: ~3-5 minutes

### 4. Function Timeout
- Default: 10 seconds
- Maximum: 26 seconds (free tier) or 26 seconds (paid)
- For long operations, consider background jobs

### 5. Sharp Library
Sharp is included and will work on Netlify's Node.js runtime.

## Troubleshooting

### Build Fails
- Check Node version (should be 20)
- Ensure all dependencies are in `package.json`
- Check build logs in Netlify dashboard

### API Routes Not Working
- Verify `netlify.toml` redirects are correct
- Check function logs in Netlify dashboard
- Ensure environment variables are set

### File Uploads Not Working
- This is expected - files don't persist on Netlify
- Implement external storage (Cloudinary/S3)

## Next Steps After Deployment

1. **Set up custom domain** (optional)
2. **Enable HTTPS** (automatic with Netlify)
3. **Set up file storage** (Cloudinary/S3)
4. **Monitor function logs** for errors
5. **Set up continuous deployment** (automatic with Git)

## Alternative: Vercel (Better for Next.js)

If you encounter issues with Netlify, consider **Vercel** (made by Next.js creators):
- Better Next.js support
- Simpler deployment
- Free tier available
- Visit: https://vercel.com

