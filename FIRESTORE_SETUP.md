# Firestore Security Rules Setup

To enable the leaderboard and profile features, you need to set up Firestore security rules in your Firebase Console.

## Steps

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** > **Rules**
4. Replace the default rules with the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read any user document, but only write their own
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can read all generations (for leaderboard), but only create their own
    match /generations/{generationId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false; // No updates or deletes allowed
    }
  }
}
```

5. Click **Publish** to save the rules

## What These Rules Do

- **Users collection**: 
  - Anyone authenticated can read user documents (needed for leaderboard)
  - Users can only create/update their own user document
  
- **Generations collection**:
  - Anyone authenticated can read generation records (needed for leaderboard)
  - Users can only create generation records with their own userId
  - No updates or deletes allowed (data integrity)

## Testing

After setting up the rules:
1. Generate an image while logged in
2. Check the browser console for tracking logs
3. Open the leaderboard - you should see your data
4. Check your profile - generation count should update

## Troubleshooting

If you see permission errors:
- Make sure you're logged in
- Verify the security rules are published
- Check the browser console for specific error messages
- Ensure Firestore is enabled in your Firebase project

