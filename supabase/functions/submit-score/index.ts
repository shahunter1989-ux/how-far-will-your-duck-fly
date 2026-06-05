import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PeriodType = "daily" | "weekly";

type ScorePayload = {
  score: unknown;
  peakAltitude: unknown;
  deviceId: unknown;
  nickname: unknown;
  dailyPeriodKey: unknown;
  weeklyPeriodKey: unknown;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function getSupabaseClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function isPeriodKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeNickname(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function parsePayload(payload: ScorePayload) {
  const score = Math.floor(Number(payload.score));
  const peakAltitude = Math.floor(Number(payload.peakAltitude));
  const deviceId = String(payload.deviceId || "").trim();
  const nickname = sanitizeNickname(payload.nickname);
  const dailyPeriodKey = String(payload.dailyPeriodKey || "").trim();
  const weeklyPeriodKey = String(payload.weeklyPeriodKey || "").trim();

  if (!Number.isInteger(score) || score < 0) {
    throw new Error("Score must be a non-negative integer.");
  }

  if (!Number.isInteger(peakAltitude) || peakAltitude < 0) {
    throw new Error("Peak altitude must be a non-negative integer.");
  }

  if (deviceId.length < 8 || deviceId.length > 80) {
    throw new Error("Device ID is invalid.");
  }

  if (nickname.length < 1 || nickname.length > 18) {
    throw new Error("Nickname must be 1 to 18 characters.");
  }

  if (!isPeriodKey(dailyPeriodKey) || !isPeriodKey(weeklyPeriodKey)) {
    throw new Error("Period keys must use YYYY-MM-DD.");
  }

  return { score, peakAltitude, deviceId, nickname, dailyPeriodKey, weeklyPeriodKey };
}

async function upsertBestScore(
  supabase: ReturnType<typeof createClient>,
  periodType: PeriodType,
  periodKey: string,
  score: number,
  peakAltitude: number,
  deviceId: string,
  nickname: string,
) {
  const { data, error } = await supabase.rpc("upsert_leaderboard_best", {
    p_period_type: periodType,
    p_period_key: periodKey,
    p_device_id: deviceId,
    p_nickname: nickname,
    p_score: score,
    p_peak_altitude: peakAltitude,
  });

  if (error) {
    throw error;
  }

  return Number(data) || score;
}

async function getTopThree(
  supabase: ReturnType<typeof createClient>,
  periodType: PeriodType,
  periodKey: string,
) {
  const { data, error } = await supabase
    .from("leaderboard_scores")
    .select("nickname,score,peak_altitude,played_at")
    .eq("period_type", periodType)
    .eq("period_key", periodKey)
    .order("score", { ascending: false })
    .order("played_at", { ascending: true })
    .limit(3);

  if (error) {
    throw error;
  }

  return data || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase environment is not configured." }, 500);
  }

  try {
    const supabase = getSupabaseClient();
    const payload = parsePayload(await req.json());
    const dailyBest = await upsertBestScore(
      supabase,
      "daily",
      payload.dailyPeriodKey,
      payload.score,
      payload.peakAltitude,
      payload.deviceId,
      payload.nickname,
    );
    const weeklyBest = await upsertBestScore(
      supabase,
      "weekly",
      payload.weeklyPeriodKey,
      payload.score,
      payload.peakAltitude,
      payload.deviceId,
      payload.nickname,
    );

    const [dailyTop, weeklyTop] = await Promise.all([
      getTopThree(supabase, "daily", payload.dailyPeriodKey),
      getTopThree(supabase, "weekly", payload.weeklyPeriodKey),
    ]);

    return jsonResponse({
      personalBests: {
        daily: dailyBest,
        weekly: weeklyBest,
      },
      dailyTop,
      weeklyTop,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Score upload failed." },
      400,
    );
  }
});
