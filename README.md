# Tripmates

Tripmates is a lightweight Expo app for a small group of friends to collect travel ideas, practical guides, day plans, and post-trip memories in one shared place.

## Current MVP

- One Expo / React Native codebase for iOS and Android.
- Four travel boards: ideas, guides, itinerary, and memories.
- Seed content for a Kyoto / Osaka / Nara trip.
- Local persistent card creation with AsyncStorage.
- Optional Supabase login, trip sync, and invite-code join flow.
- Mobile-first UI that runs in Expo Go while the product shape is still changing.

## Why Not Ionic?

Ionic is a strong choice when the app should behave mostly like a web app and reuse web UI directly. Tripmates is likely to grow into a more native-feeling phone app: photo memories, share sheets, push notifications, maps, offline access, and app-store/TestFlight distribution. React Native with Expo keeps one TypeScript codebase while rendering through native UI primitives, so it is still lightweight now but leaves more room for native mobile polish later.

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

## Supabase Setup

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Restart Expo so the public environment variables are bundled.

Without these environment variables, Tripmates stays in local-only mode and still saves entries on the device.

## Distribution Path

Android can start with a signed APK once native builds are configured. iOS should use TestFlight for friends during beta, or an unlisted App Store release once the app is ready for long-term use.

## Next Milestones

1. Smoke test Supabase auth on a physical iOS and Android device.
2. Replace manual sync with realtime updates and conflict handling.
3. Add generated invite links that open a specific trip in the app.
4. Add maps, link previews, and photo memories.
5. Configure EAS Build for Android APK / AAB and iOS TestFlight builds.
