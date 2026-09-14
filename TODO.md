# TODO

## Apple and Google sign-in

The app currently supports email-link sign-in through Supabase. Complete provider
configuration and add the social sign-in buttons below.

### Google provider

- [ ] Select or create a project in [Google Cloud Console](https://console.cloud.google.com/).
- [ ] Configure Google Auth Platform branding, audience, and test users. Use the
  `openid`, email, and profile scopes.
- [ ] Create an OAuth client of type **Web application** for the Supabase browser
  sign-in flow.
- [ ] Add the web app origins, including `http://localhost:8081` for development.
- [ ] Add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized
  redirect URI. Copy the exact callback from the Supabase Google provider page.
- [ ] In Supabase → Authentication → Sign In / Providers → Google, enable the
  provider and save the client ID and client secret.

Reference: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

### Apple provider

These steps configure browser-based Apple sign-in.

- [ ] Set up an [Apple Developer account](https://developer.apple.com/account/).
- [ ] Enable **Sign in with Apple** on the app identifier. The current bundle ID
  is `com.dropin.app`.
- [ ] Create a Services ID, such as `com.dropin.app.login`, and associate it with
  the app identifier.
- [ ] Configure the Services ID domain as `<project-ref>.supabase.co` and its
  return URL as `https://<project-ref>.supabase.co/auth/v1/callback`.
- [ ] Create a Sign in with Apple key and securely retain its `.p8` file, Team ID,
  and Key ID.
- [ ] Generate the client-secret JWT using that key and the Services ID.
- [ ] Enable Apple in Supabase's provider settings and save the Services ID and
  generated client secret.
- [ ] Set a reminder to renew the Apple browser-flow client secret before its
  expiration; its maximum lifetime is six months.

Reference: [Supabase Apple setup](https://supabase.com/docs/guides/auth/social-login/auth-apple).

### Supabase redirects

- [ ] Replace `<project-ref>` above with the hosted Supabase project reference.
- [ ] In Authentication → URL Configuration, allow these app callback URLs:
  - `dropin://callback`
  - `http://localhost:8081/callback`
  - `http://127.0.0.1:8081/callback` if used locally
  - `https://YOUR-PRODUCTION-DOMAIN/callback` once deployed
- [ ] Set the Site URL to the appropriate web app URL and match any different
  development host or port exactly.
- [ ] Keep provider client secrets and Apple's private key out of app code and
  `EXPO_PUBLIC_*` variables. Configure provider secrets in Supabase.

Reference: [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

### App implementation and verification

- [ ] Add **Continue with Google** and **Continue with Apple** buttons to
  `apps/mobile/src/features/auth/sign-in-form.tsx`.
- [ ] Start the browser flow with `supabase.auth.signInWithOAuth()` and the
  existing `authRedirectUrl()` helper.
- [ ] On native, open the provider URL with `expo-web-browser` and handle the
  return to the app. Complete the PKCE code exchange exactly once, integrating
  with `apps/mobile/src/features/auth/auth-callback.tsx`.
- [ ] Handle cancellation, loading, provider errors, and repeat taps.
- [ ] Verify both providers on web and native builds, including new-account
  onboarding, returning users, sign-out, and session persistence.
- [ ] Verify email-link sign-in still works.

Reference: [Supabase native OAuth and deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).
