import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FB_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface TokenState {
  cookies: string;
  cookieHeader: string;
  fbDtsg: string;
  lsd: string;
  userId: string;
}

function parseCookieString(raw: string): { name: string; value: string }[] {
  const text = (raw || "").replace(/\n/g, ";").trim();
  if (!text) return [];
  const pairs: { name: string; value: string }[] = [];
  for (const part of text.split(";")) {
    const item = part.trim();
    if (!item) continue;
    const eqIndex = item.indexOf("=");
    if (eqIndex === -1) continue;
    const name = item.slice(0, eqIndex).trim();
    const value = item.slice(eqIndex + 1).trim();
    if (name) pairs.push({ name, value });
  }
  return pairs;
}

function buildCookieHeader(raw: string): string {
  const pairs = parseCookieString(raw);
  return pairs.map((p) => `${p.name}=${p.value}`).join(";");
}

async function fetchFacebookPage(cookieHeader: string): Promise<string> {
  const urls = [
    "https://www.facebook.com/adsmanager/creation",
    "https://www.facebook.com/adsmanager",
    "https://www.facebook.com/",
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Cookie: cookieHeader,
          "User-Agent": FB_USER_AGENT,
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await response.text();
      if (html && html.toLowerCase().includes("facebook")) return html;
    } catch {
      continue;
    }
  }
  return "";
}

function extractTokensFromHtml(html: string): { fbDtsg: string; lsd: string; userId: string } {
  const result = { fbDtsg: "", lsd: "", userId: "" };
  const patterns: { regex: RegExp; key: keyof typeof result }[] = [
    { regex: /name="fb_dtsg"[^>]*value="([^"]+)"/i, key: "fbDtsg" },
    { regex: /"DTSGInitialData"\s*:\s*\{"token"\s*:\s*"([^"]+)"/i, key: "fbDtsg" },
    { regex: /fb_dtsg["']?\s*[:=]\s*["']([^"']+)["']/i, key: "fbDtsg" },
    { regex: /"LSD"\s*,\s*\[\]\s*,\s*\{"token"\s*:\s*"([^"]+)"/i, key: "lsd" },
    { regex: /"lsd"\s*:\s*"([^"]+)"/i, key: "lsd" },
  ];
  for (const { regex, key } of patterns) {
    const match = html.match(regex);
    if (match && match[1] && !result[key]) {
      result[key] = match[1];
    }
  }
  const cUserMatch = html.match(/c_user=(\d+)/i);
  if (cUserMatch && cUserMatch[1]) result.userId = cUserMatch[1];
  return result;
}

function createUuid(): string {
  return crypto.randomUUID();
}

function createJazoest(token: string): string {
  if (!token) return "22000";
  let total = 0;
  for (let i = 0; i < token.length; i++) total += token.charCodeAt(i);
  return `2${total}`;
}

async function graphqlRequest(
  docId: string,
  variables: Record<string, unknown>,
  friendlyName: string,
  state: TokenState,
): Promise<Record<string, unknown>> {
  if (!state.fbDtsg || !state.lsd) {
    throw new Error("لم يتم ربط الحساب بعد. يرجى الاتصال أولًا.");
  }

  const params = new URLSearchParams();
  params.append("av", state.userId || "");
  params.append("__user", state.userId || "");
  params.append("__a", "1");
  params.append("fb_dtsg", state.fbDtsg);
  params.append("jazoest", createJazoest(state.fbDtsg));
  params.append("lsd", state.lsd);
  params.append("variables", JSON.stringify(variables));
  params.append("doc_id", docId);
  params.append("fb_api_caller_class", "RelayModern");
  params.append("fb_api_req_friendly_name", friendlyName || "BoostTool");
  params.append("server_timestamps", "true");

  const response = await fetch("https://www.facebook.com/api/graphql/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-FB-LSD": state.lsd,
      Cookie: state.cookieHeader,
      "User-Agent": FB_USER_AGENT,
    },
    body: params.toString(),
  });

  const text = await response.text();
  const lines = text.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.data || parsed.errors) return parsed;
    } catch {
      continue;
    }
  }
  if (text.trim().startsWith("<!DOCTYPE") || text.toLowerCase().includes("<html")) {
    throw new Error("الاستجابة عادت كـ HTML. قد تكون الكوكيز منتهية أو محظورة.");
  }
  throw new Error("استجابة غير صالحة من GraphQL.");
}

function expandCountries(raw: string): string[] {
  const list = raw.split(",").map((c) => c.trim()).filter(Boolean);
  const expanded: string[] = [];
  const seen = new Set<string>();
  const africa = ["NG", "GH", "KE", "ZA", "CI", "MZ", "ZM", "EG", "MA", "DZ", "TN", "CM", "SN", "ET", "TZ", "UG", "RW", "AO", "BJ", "BF", "BW", "CD", "CG", "GA", "GN"];
  const combo = ["PH", ...africa];

  for (const country of list) {
    if (country === "AFRICA_REGION") {
      for (const item of africa) {
        if (!seen.has(item)) { seen.add(item); expanded.push(item); }
      }
    } else if (country === "COMB_BOOST") {
      for (const item of combo) {
        if (!seen.has(item)) { seen.add(item); expanded.push(item); }
      }
    } else if (!seen.has(country)) {
      seen.add(country);
      expanded.push(country);
    }
  }
  return expanded;
}

function buildCreationSpec(payload: Record<string, unknown>, state: TokenState) {
  const pageId = String(payload.pageId || "").trim();
  const adAccountId = String(payload.adAccountId || "").trim().replace(/\D/g, "");
  const postId = String(payload.postId || "").trim();
  const link = String(payload.link || "").trim();
  const budget = Number(payload.budget || 2);
  const duration = parseInt(String(payload.duration || 7), 10);
  const currency = String(payload.currency || "USD");
  const goal = String(payload.goal || "LINK_CLICKS");
  const countriesInput = String(payload.countries || "EG").trim();
  const gender = parseInt(String(payload.gender || 0), 10);
  const ageMin = parseInt(String(payload.ageMin || 18), 10);
  const ageMax = parseInt(String(payload.ageMax || 55), 10);

  const countries = expandCountries(countriesInput || "EG");
  const targetingSpec = {
    genders: [gender],
    age_min: ageMin,
    age_max: ageMax,
    geo_locations: { location_types: ["home", "recent"], countries },
  };

  let callToAction: Record<string, unknown>;
  if (goal === "MESSAGES") {
    callToAction = { type: "MESSAGE_PAGE", value: { app_destination: "MESSENGER", link: "https://fb.com/messenger_doc/" } };
  } else if (goal === "PAGE_LIKES") {
    callToAction = { type: "LIKE_PAGE", value: {} };
  } else if (goal === "POST_ENGAGEMENT" || goal === "VIDEO_VIEWS") {
    callToAction = { type: "NO_BUTTON", value: {} };
  } else {
    callToAction = { type: "LEARN_MORE", value: { link } };
  }

  return {
    ads_lwi_goal: goal === "MESSAGES" ? "GET_MULTI_MESSAGES" : goal,
    objective: goal,
    budget: Math.floor(budget * 100),
    budget_type: "DAILY_BUDGET",
    currency,
    duration_in_days: duration,
    run_continuously: false,
    is_automatic_goal: false,
    legacy_ad_account_id: adAccountId,
    legacy_entry_point: "www_profile_plus_timeline_caa_cae_voice",
    placement_spec: { publisher_platforms: ["FACEBOOK"] },
    audience: {
      targeting_spec,
      audience_option: "CUSTOM",
      saved_audience_id: null,
    },
    ad_target_spec: { client_can_edit: true },
    targeting_spec_string: JSON.stringify(targetingSpec),
    adgroup_specs: [{
      creative: {
        call_to_action: callToAction,
        object_story_id: `${pageId}_${postId}`,
      },
    }],
    cta_data: goal === "MESSAGES"
      ? { is_cta_share_post: false, link: "https://fb.com/messenger_doc/", type: "MESSAGE_PAGE" }
      : null,
  };
}

async function runBoost(payload: Record<string, unknown>, state: TokenState) {
  const pageId = String(payload.pageId || "").trim();
  const adAccountId = String(payload.adAccountId || "").trim().replace(/\D/g, "");
  const postId = String(payload.postId || "").trim();
  const link = String(payload.link || "").trim();
  const goal = String(payload.goal || "LINK_CLICKS");

  if (!pageId || !adAccountId || !postId || (goal === "LINK_CLICKS" && !link)) {
    return { success: false, message: "الرجاء ملء كل الحقول المطلوبة قبل الإرسال." };
  }

  const creationSpec = buildCreationSpec(payload, state);
  const docIds = ["9955578997835249", "8916092638475205", "7890123456789012", "3456789012345678"];
  let lastError: Error | null = null;
  let successPayload: Record<string, unknown> | null = null;

  for (const docId of docIds) {
    try {
      const variables = {
        input: {
          boost_id: null,
          creation_spec: creationSpec,
          flow_id: createUuid(),
          lwi_asset_id: { id: pageId },
          manual_review_requested: false,
          page_id: pageId,
          product: "BOOSTED_POST",
          target_id: postId,
          actor_id: state.userId || "",
          client_mutation_id: String(Math.floor(Math.random() * 100000)),
        },
      };
      const res = await graphqlRequest(docId, variables, "LWICometCreateBoostedComponentMutation", state);
      if (res && (res.data || res.errors)) {
        successPayload = res;
        break;
      }
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (!successPayload) {
    return {
      success: false,
      message: lastError ? lastError.message : "فشل الإرسال. حاول مرة أخرى بعد تحديث الكوكيز.",
    };
  }

  const data = successPayload.data as Record<string, unknown> | undefined;
  const boostData = data?.create_boosted_component as Record<string, unknown> | undefined;
  const boostId = boostData?.id;

  if (boostId) {
    return { success: true, message: `تم إنشاء الحملة بنجاح. Boost ID: ${boostId}`, boostId, payload: successPayload };
  }
  if (successPayload.errors) {
    const errors = successPayload.errors as Array<Record<string, unknown>>;
    return { success: false, message: String(errors[0]?.message || "تعذر إنشاء الحملة."), payload: successPayload };
  }
  return { success: true, message: "تم استلام استجابة غير مكتملة. راجع النتائج أدناه.", payload: successPayload };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "connect") {
      const rawCookies = String(body.cookies || "").trim();
      if (!rawCookies) {
        return new Response(
          JSON.stringify({ success: false, message: "يرجى إدخال كوكيز فيسبوك أولاً" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const cookieHeader = buildCookieHeader(rawCookies);
      const html = await fetchFacebookPage(cookieHeader);
      const tokens = extractTokensFromHtml(html);

      if (!tokens.fbDtsg || !tokens.lsd) {
        return new Response(
          JSON.stringify({
            success: false,
            message: "تعذر استخراج الرموز من الصفحة. تأكد من صحة الكوكيز وأنك مسجل الدخول إلى فيسبوك.",
            fbDtsg: "", lsd: "", userId: "",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "تم الاتصال بنجاح",
          fbDtsg: tokens.fbDtsg,
          lsd: tokens.lsd,
          userId: tokens.userId,
          cookieHeader,
          cookies: rawCookies,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "run") {
      const state: TokenState = {
        cookies: String(body.cookies || ""),
        cookieHeader: String(body.cookieHeader || ""),
        fbDtsg: String(body.fbDtsg || ""),
        lsd: String(body.lsd || ""),
        userId: String(body.userId || ""),
      };

      const result = await runBoost(body, state);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      await supabase.from("campaigns").insert({
        page_id: String(body.pageId || "").trim(),
        ad_account_id: String(body.adAccountId || "").trim().replace(/\D/g, ""),
        post_id: String(body.postId || "").trim(),
        link: String(body.link || "").trim() || null,
        budget: Number(body.budget || 2),
        duration: parseInt(String(body.duration || 7), 10),
        currency: String(body.currency || "USD"),
        goal: String(body.goal || "LINK_CLICKS"),
        countries: String(body.countries || "EG"),
        gender: parseInt(String(body.gender || 0), 10),
        age_min: parseInt(String(body.ageMin || 18), 10),
        age_max: parseInt(String(body.ageMax || 55), 10),
        boost_id: result.boostId || null,
        status: result.success ? "success" : "error",
        response_payload: result.payload || null,
        error_message: result.success ? null : result.message,
      });

      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: false, message: "إجراء غير معروف" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, message: (error as Error).message || "خطأ داخلي" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
