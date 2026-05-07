# Guardian AI  —  Sentient Home Watch

Guardian AI is a smart home security assistant that combines a React dashboard, simulated home sensors, Gemini-powered safety reasoning, photo-based room audits, and Telegram alerts. It was built as a college AI essentials project, but the code is structured like a real prototype: frontend state stays private in the browser, AI calls run through Supabase Edge Functions, and Telegram integration is handled server-side so bot secrets never reach the client.

## What it does

- **AI home safety chat** — ask Guardian about home security, baby-proofing, pet safety, emergency readiness, or daily safety checks.
- **Live sensor dashboard** — simulated readings for temperature, smoke, carbon monoxide, flood, motion, and door/window sensors.
- **Threat state** — recent sensor alerts roll up into `SECURE`, `CAUTION`, or `ALERT` status.
- **Photo safety audits** — upload room photos and get structured risks, visible observations, priority actions, and follow-up checks.
- **Room memory demo** — save baseline room images so Guardian can remember layout, entry points, and common risks.
- **Motion comparison demo** — compare a saved room image with a current image to detect meaningful occupancy changes.
- **Telegram alerts** — receive sensor alerts and test messages on Telegram using a Supabase Edge Function proxy.
- **Telegram bot mode** — chat with Guardian or send photos directly through Telegram; audit summaries and chat history are persisted in Supabase.
- **Location + weather context** — optional geolocation and weather calls improve Guardian's recommendations.
- **Privacy-first local state** — browser chat history, settings, and saved room snapshots are stored in `localStorage`.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Vite, React, TypeScript |
| UI | Tailwind CSS, shadcn/ui, Radix UI, lucide-react |
| State/data | React hooks, localStorage, TanStack Query-ready setup |
| AI | Gemini via Supabase Edge Functions |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase Postgres for Telegram sessions/audits/state |
| Messaging | Telegram Bot API |
| Testing | Vitest, Testing Library |

## Architecture

```text
React app
  ├─ Guardian chat + dashboard + settings
  ├─ Sensor simulation hook
  ├─ localStorage
  │   ├─ user settings
  │   ├─ chat history
  │   └─ saved room memory
  └─ Supabase Edge Functions
      ├─ guardian-chat      → Gemini text assistant
      ├─ guardian-vision    → Gemini image audit / room memory / motion demo
      ├─ telegram-alert     → sends Telegram alert messages
      ├─ telegram-poll      → polls Telegram bot updates and replies
      ├─ geolocate          → approximate user location
      ├─ weather            → weather context
      └─ safety-news        → home-security news + optional AI summary

Supabase Postgres
  ├─ telegram_bot_state
  ├─ telegram_sessions
  └─ telegram_audits
```

## Key project folders

```text
src/
├─ components/
│  ├─ GuardianHeader.tsx
│  ├─ GuardianSidebar.tsx
│  ├─ DashboardStrip.tsx
│  └─ tabs/
│     ├─ ChatTab.tsx       # AI chat + image upload audits
│     ├─ SensorsTab.tsx    # sensor cards, room memory, motion demo
│     └─ SettingsTab.tsx   # profile, presence, notifications, Telegram
├─ hooks/
│  ├─ useSensorSimulation.ts
│  └─ useSettings.ts
├─ lib/
│  ├─ api.ts               # Edge Function caller
│  ├─ guardianMemory.ts    # local chat + room memory storage
│  ├─ settings.ts
│  └─ threat.ts
└─ integrations/supabase/

supabase/
├─ functions/
│  ├─ guardian-chat/
│  ├─ guardian-vision/
│  ├─ telegram-alert/
│  ├─ telegram-poll/
│  ├─ geolocate/
│  ├─ weather/
│  └─ safety-news/
└─ migrations/
   └─ telegram bot tables + cron/net extensions
```

## Environment variables

Create a `.env` file for the frontend:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_or_publishable_key
VITE_SUPABASE_PROJECT_ID=your_supabase_project_id
```

Set these as Supabase Edge Function secrets:

```env
GEMINI_API_KEY=your_gemini_api_key
OPENWEATHER_API_KEY=your_openweather_api_key
NEWS_API_KEY=your_news_api_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Notes:

- `GEMINI_API_KEY` powers chat, image audits, room memory, motion demo, and optional news summaries.
- `TELEGRAM_BOT_TOKEN` is only used inside Edge Functions. Do not expose it to the browser.
- `SUPABASE_SERVICE_ROLE_KEY` is needed by `telegram-poll` to write Telegram session/audit state behind RLS.

## Local development

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

Useful commands:

```bash
npm run lint
npm run test
npm run build
npm run preview
```

## Supabase setup

1. Create a Supabase project.
2. Add the frontend environment variables to `.env`.
3. Apply the SQL migration in `supabase/migrations/`.
4. Add the Edge Function secrets listed above.
5. Deploy the Edge Functions:

```bash
supabase functions deploy guardian-chat
supabase functions deploy guardian-vision
supabase functions deploy telegram-alert
supabase functions deploy telegram-poll
supabase functions deploy geolocate
supabase functions deploy weather
supabase functions deploy safety-news
```

## Telegram setup

1. Create a bot with [@BotFather](https://t.me/BotFather).
2. Save the bot token as `TELEGRAM_BOT_TOKEN` in Supabase secrets.
3. Deploy `telegram-alert` and `telegram-poll`.
4. Open the bot in Telegram and send `/start`.
5. Copy the returned chat ID into **Settings → Connect Telegram** in the web app.
6. Use **Test Telegram** to verify alert delivery.

The bot supports:

- `/start` — returns the chat ID and connection instructions.
- `/help` — short usage help.
- `/reset` — clears Telegram conversation history.
- Normal text chat — Guardian replies with AI safety guidance.
- Photo messages — Guardian performs a home safety audit.

## How the demos work

### Sensor simulation

`useSensorSimulation.ts` keeps six sensor streams stable by default and exposes manual triggers:

- motion
- smoke
- carbon monoxide
- flood
- door/window
- high temperature

Threshold crossings create alerts. Recent high-severity alerts switch the global state to `ALERT`; recent medium alerts switch it to `CAUTION`.

### Presence mode

When presence is set to **Home**, motion and door alerts are suppressed so Guardian does not notify the owner for normal movement. When set to **Away**, those alerts can be pushed to Telegram depending on notification preferences and quiet hours.

### Photo audit

`guardian-vision` asks Gemini for strict JSON, then normalizes or partially recovers malformed model output. The UI formats this into a practical audit with risk level, findings, priority actions, and manual follow-up checks.

### Room memory + motion demo

Saved room baselines are stored locally in the browser. A motion demo sends the saved baseline image and a current image to `guardian-vision`; Guardian compares them and decides whether a person or meaningful occupancy change should trigger an alert.

## Privacy and safety model

- Browser settings, chat history, and saved room photos stay in `localStorage`.
- Telegram chat history and Telegram photo audit summaries are stored in Supabase tables behind RLS.
- Edge Functions hold provider secrets; the frontend only uses the Supabase publishable key.
- Guardian gives safety guidance, but it is not a certified alarm system. For fire, carbon monoxide, intrusion, or medical emergencies, users should contact local emergency services.

## Current limitations

- Sensor data is simulated, not connected to real IoT hardware yet.
- Saved room memory is local to one browser/device.
- Telegram cannot see live browser-only sensor readings unless they are sent or persisted through backend storage.
- AI image analysis depends on photo quality and Gemini availability.

## Roadmap ideas

- Connect real ESP32/Raspberry Pi sensors.
- Persist sensor readings and room memory in Supabase with user accounts.
- Add camera stream support and scheduled safety checks.
- Add push notifications beyond Telegram.
- Add real device automation rules with confirmation gates.
- Add multi-home support and shared household access.

## License

No license specified yet.
