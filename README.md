# Tripmates

Tripmates is a lightweight Expo app for a small group of friends to collect travel ideas, practical guides, day plans, and post-trip memories in one shared place.

## Current MVP

- One Expo / React Native codebase for iOS and Android.
- Four travel boards: ideas, guides, itinerary, and memories.
- Seed content for a Kyoto / Osaka / Nara trip.
- Local in-memory card creation for the first prototype.
- Mobile-first UI that runs in Expo Go while the product shape is still changing.

## Run Locally

```bash
npm install
npm run start
```

Then scan the Expo QR code with Expo Go, or run:

```bash
npm run android
npm run ios
```

## Verify

```bash
npm run typecheck
```

## Distribution Path

Android can start with a signed APK once native builds are configured. iOS should use TestFlight for friends during beta, or an unlisted App Store release once the app is ready for long-term use.

## Next Milestones

1. Add persistent local storage so prototype entries survive app restarts.
2. Add Supabase projects, tables, and auth for private friend groups.
3. Add invite links for each trip space.
4. Add maps, link previews, and photo memories.
5. Configure EAS Build for Android APK / AAB and iOS TestFlight builds.
