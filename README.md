# Tripmates

Tripmates is a lightweight Expo app for a small group of friends to build a private city-by-city travel library: ideas, practical guides, day plans, and post-trip memories all live under each city card.

## Current MVP

- One Expo / React Native codebase for iOS and Android.
- City-card home screen with a detail page for each city.
- Four travel boards: ideas, guides, itinerary, and memories.
- A short in-app usage guide for the city-first workflow.
- Inspiration entries can store a note, a Xiaohongshu/Douyin/web source link, and an editable summary draft.
- Guide entries can be generated from the current city's inspiration board as a day-by-day draft.
- Seed city cards for Xinjiang and Guangxi.
- Local persistent card creation with AsyncStorage.
- Optional Supabase login, city sync, and invite-code join flow.
- EAS Update support with an in-app update prompt for compatible OTA changes.
- Mobile-first UI that runs in Expo Go while the product shape is still changing.

## Why Not Ionic?

Ionic is a strong choice when the app should behave mostly like a web app and reuse web UI directly. Tripmates is likely to grow into a more native-feeling phone app: photo memories, share sheets, push notifications, maps, offline access, and app-store/TestFlight distribution. React Native with Expo keeps one TypeScript codebase while rendering through native UI primitives, so it is still lightweight now but leaves more room for native mobile polish later.

## Run Locally

```bash
npx yarn@1.22.22 install
npx yarn@1.22.22 start
```

Then scan the Expo QR code with Expo Go, or run:

```bash
npx yarn@1.22.22 android
npx yarn@1.22.22 ios
```

## Verify

```bash
npx yarn@1.22.22 typecheck
```

## Supabase Setup

1. Create a Supabase project on the Free plan.
2. Use a clear project name such as `tripmates`.
3. Pick the region closest to the people who will use the app most often.
4. Link the CLI with `npx supabase link --project-ref <project-ref>`.
5. Push the database migration with `npx supabase db push`.
6. If you prefer the dashboard SQL editor, run `supabase/schema.sql`; it has the same contents as the initial migration.
7. Copy `.env.example` to `.env.local`.
8. Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
9. Restart Expo so the public environment variables are bundled.

Without these environment variables, Tripmates stays in local-only mode and still saves city cards and entries on the device.

If your Supabase project was created before source links were added, run this SQL once in the dashboard SQL editor before syncing link entries:

```sql
alter table public.city_entries
add column if not exists source_url text,
add column if not exists ai_summary text;
```

## Distribution Path

Android can start with a signed APK through EAS Build. iOS should use TestFlight for friends during beta, or an unlisted App Store release once the app is ready for long-term use.

### Android APK for Friends

The project already has the Android application ID in `app.json`:

```text
com.syfyivan.tripmates
```

`eas.json` has a `preview` profile that builds an installable APK instead of a Play Store AAB. The first real cloud build needs an Expo account:

```bash
npx eas-cli@latest login
npx eas-cli@latest init
```

Add the Supabase client variables to the EAS `preview` environment so cloud APK builds can connect to the same backend as local development:

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://uyrnccoygbgeqvxusdqc.supabase.co --environment preview --visibility plaintext
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <publishable-key> --environment preview --visibility plaintext
```

Then start the APK build:

```bash
npx eas-cli@latest build --platform android --profile preview
```

When the build finishes, EAS prints a build page and APK download link. Send that APK link to Android friends and they can install it directly. Android may ask them to allow installation from the browser or file manager.

### OTA Updates

This project is configured for EAS Update. The `preview` APK listens to the `preview` update channel, and the app shows an in-app update panel that can check, download, and restart into a compatible update.

Publish a small JavaScript, styling, text, or asset update without rebuilding the APK:

```bash
npx eas-cli@latest update --channel preview --message "Short update note" --environment preview
```

Users must first install a build created after EAS Update was configured. Updates that change native code or native configuration still require a new APK build, for example installing a new native module, changing permissions, changing app icons or splash screens, upgrading Expo SDK, or changing the native runtime.

## AI Generation Path

The current app can create local, editable drafts from pasted inspiration links and existing notes. It does not yet fetch or understand Xiaohongshu/Douyin pages on its own. Real AI summarization should run server-side, for example:

```text
App -> Supabase Edge Function -> AI model API -> saved ai_summary / guide draft
```

Keeping model calls on the server avoids putting private API keys into the mobile app and gives one place to add link fetching, rate limits, and better prompts.

## Next Milestones

1. Smoke test Supabase auth on a physical iOS and Android device.
2. Install the first OTA-enabled Android preview APK on a real phone.
3. Replace local draft generation with a Supabase Edge Function AI summarizer.
4. Publish and verify each small capability through the `preview` channel OTA flow.
5. Replace manual sync with realtime updates and conflict handling.
6. Add generated invite links that open a specific city in the app.
7. Add maps, link previews, and photo memories.
