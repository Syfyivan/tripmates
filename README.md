# Tripmates

Tripmates is a lightweight Expo app for a small group of friends to build a private city-by-city travel library: ideas, practical guides, day plans, and post-trip memories all live under each city card.

## Current MVP

- One Expo / React Native codebase for iOS and Android.
- City-card home screen with a detail page for each city.
- Four travel boards: ideas, guides, itinerary, and memories.
- A short in-app usage guide for the city-first workflow.
- Inspiration entries can store a Xiaohongshu/Douyin source link plus a short note for later Codex整理.
- Guide entries can be generated from the current city's inspiration board as a day-by-day draft.
- Guide entries can store a Feishu/Lark document link as their source.
- Itinerary entries can be generated from the current city's guide board and linked guide documents.
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

### Versioning Rule

Every user-visible update should bump the in-app version label shown in `应用更新`. Use `版本 1.0.x · 功能 YYYY-MM-DD.n` so friends can tell which update they are seeing on their phones.

When shipping a new Android APK, also bump `android.versionCode` in `app.json`. JavaScript-only OTA updates can keep `expo.version` and runtime `1.0.0` unchanged so they remain compatible with the installed preview APK.

#### If OTA Does Not Appear

Use the visible version label in `应用更新` to confirm whether the phone is on the latest capability set:

- Updated: the version label matches the latest release note or commit message.
- Old embedded build: the version label is missing or lower than the latest release.

Troubleshooting order:

1. Scroll to the top of the city detail page and find `应用更新`.
2. Tap `检查更新`.
3. If the panel says a new version was downloaded, tap `重启更新`.
4. Force close and reopen the app if the UI still looks old.
5. If it still does not change, install the latest Android preview APK. The Android `versionCode` should be higher than the old installed package so Android treats it as an upgrade.

The current preview runtime is `1.0.0`, so JavaScript-only updates can keep targeting `preview` / runtime `1.0.0`.

## AI Generation Path

The current app does not perform real AI summarization in the phone client. For this private friends-only workflow, the near-term path is:

```text
Friends collect Xiaohongshu/Douyin links in Tripmates
-> sync/export the city inspiration list
-> use Codex manually to read and整理 link contents
-> save the resulting guide or itinerary back into Tripmates/Feishu
```

Xiaohongshu image-text posts, long notes, and Douyin posts with clear captions are easier to organize than pure short videos because they usually include explicit names, addresses, prices, route order, and caveats. For short videos, add a one-line note in Tripmates explaining why it is worth saving.

Idea and guide cards can be deleted from the card footer. If a card has already been synced, the user must be logged in and the Supabase delete policy from `supabase/migrations/20260606000000_allow_entry_delete.sql` must be applied.

The in-app guide and itinerary generation buttons are draft helpers for the main organizer. Friends should collect links and add context first, then let the main organizer decide when to generate a guide or itinerary draft from the shared material.

Later, real AI summarization can run server-side. The app still should not fetch or understand Xiaohongshu/Douyin pages or Feishu document bodies on its own. A production path would be:

```text
App -> Supabase Edge Function -> link/doc fetcher -> AI model API -> saved ai_summary / guide draft / itinerary draft
```

Keeping model calls and Feishu credentials on the server avoids putting private API keys into the mobile app and gives one place to add document fetching, link fetching, rate limits, and better prompts.

## Next Milestones

1. Smoke test Supabase auth on a physical iOS and Android device.
2. Install the first OTA-enabled Android preview APK on a real phone.
3. Add an export/share view that turns a city's inspirations into Codex-ready text.
4. Replace local draft generation with a Supabase Edge Function AI summarizer and Feishu document reader when the manual Codex workflow is proven.
5. Publish and verify each small capability through the `preview` channel OTA flow.
6. Replace manual sync with realtime updates and conflict handling.
7. Add generated invite links that open a specific city in the app.
8. Add maps, link previews, and photo memories.
