# Firebase Authentication Setup Guide

This project uses Firebase Authentication for user login. Follow these steps to set up Firebase for your project.

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard to create your project

## Step 2: Enable Authentication Providers

1. In your Firebase project, go to **Authentication** > **Sign-in method**
2. Enable the following providers:
   - **Email/Password**: Click "Email/Password", toggle "Enable", and click "Save"
   - **Google**: Click "Google", toggle "Enable", set a project support email, and click "Save"

## Step 3: Register Your Web App

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps" section
3. Click the **Web** icon (`</>`) to add a web app
4. Register your app with a nickname (e.g., "Stock Metadata Gen")
5. Copy the Firebase configuration object

## Step 4: Add Environment Variables

Create a `.env.local` file in the root of your project (or add to your existing `.env.local`):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

Replace the placeholder values with the actual values from your Firebase config.

## Step 5: Configure Authorized Domains (for Google Sign-In)

1. In Firebase Console, go to **Authentication** > **Settings** > **Authorized domains**
2. Add your development domain (e.g., `localhost`) if not already present
3. Add your production domain when deploying

## Step 6: Test the Implementation

1. Start your development server: `npm run dev`
2. Try to upload an image or click "API Secrets" - you should see the login modal
3. Test both email/password and Google sign-in

## Troubleshooting

- **"Firebase configuration is missing" warning**: Make sure all `NEXT_PUBLIC_FIREBASE_*` environment variables are set in `.env.local`
- **Google sign-in not working**: Check that Google provider is enabled and authorized domains are configured
- **Email/password not working**: Verify Email/Password provider is enabled in Firebase Console

## Security Notes

- Firebase client-side API keys are safe to expose in the frontend (they're public by design)
- User authentication is handled securely by Firebase
- Never commit `.env.local` to version control (it should be in `.gitignore`)

