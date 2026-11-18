# PromptVault

A library for your AI prompts. Each prompt is a square: click it to copy, or fill in its
`{{variables}}` first. Prompts are kept on your device, or in your own cloud vault when you sign in with Google.

## Get it

- **Website**: https://anandhavaradhan.github.io/Prompts/
- **Android**: [PromptVault.apk](https://github.com/Anandhavaradhan/Prompts/raw/downloads/PromptVault.apk)
- **Windows**: [PromptVault.exe](https://github.com/Anandhavaradhan/Prompts/raw/downloads/PromptVault.exe) (portable, no installation)

The website and the apps are static builds with no server of their own:

- Prompts, the variable Workbench, export and the on-device library work everywhere.
- **Search and auto-naming** use on-device matching. Set the repository variable `API_BASE` to the address of a
  hosted copy of `server.ts` (which holds the Gemini key) and rebuild to switch them to Gemini.
- **Google sign-in and cloud sync** work on the website once `anandhavaradhan.github.io` is added in the
  Firebase console (Authentication → Settings → Authorized domains). Google does not allow its sign-in inside
  app shells, so the Android and Windows apps keep prompts on the device; use the Vault's export to move them.

## Develop

```bash
npm install
npm run dev      # Express + Vite on http://localhost:3000 (set GEMINI_API_KEY in .env for Gemini)
npm test         # prompt logic and rules tests
npm run lint     # type check
npm run check:gemini   # is GEMINI_API_KEY valid, and does gemini-3.8-flash answer?
```

`check:gemini` asks Google which models the key can see, then calls the one this app uses and reports
the result. The key is never printed. Without a working key, naming and search fall back to on-device
matching.

`VITE_STATIC=true npm run build` makes the static build in `dist/`.
`.github/workflows/pages.yml` publishes it to GitHub Pages and `.github/workflows/apps.yml` builds the apps from `android/` and `desktop/`.
