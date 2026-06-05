# How Far Will Your Duck Fly by Wulfzxx.underground

A simple mobile browser game where tapping controls a duck's altitude while it flaps through the sky.

## Rules

- Ascend: meet the current needed tap rate, starting near 5 taps per second and rising to 8 taps per second at max altitude.
- Descend: tap below the current needed rate.
- Safe landing: no taps for 0.75 seconds sends the duck gliding down.
- Run complete: altitude reaches zero and the duck lands safely.
- Score: increases over time based on current altitude.
- Leaderboards: daily and Monday-reset weekly top-three boards appear after each round, backed by Supabase when configured.

Open `index.html` in a browser to play.

## Supabase leaderboard setup

The game works offline until these constants are filled in near the top of `game.js`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SCORE_FUNCTION_URL`

To enable online scoreboards:

1. Run `supabase/schema.sql` in your Supabase SQL editor.
2. Deploy `supabase/functions/submit-score`.
3. Set the Edge Function secret `SUPABASE_SERVICE_ROLE_KEY`.
4. Put your Supabase project URL, anon key, and deployed function URL into `game.js`.
