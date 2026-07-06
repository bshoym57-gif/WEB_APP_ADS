import json
import os
import re
import uuid
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = os.path.dirname(__file__)
INDEX_PATH = os.path.join(ROOT, "index.html")


# ─── Cookie Parsing ────────────────────────────────────────────────────────

def parse_cookie_string(raw):
    """
    Accept cookies in any common format:
      1. key=value; key=value  (raw cookie header)
      2. JSON array: [{"name":"x","value":"y"}, ...]  (EditThisCookie / J2TEAM export)
      3. JSON object: {"key": "value", ...}
      4. Netscape format (tab-separated lines from cookie exporters)
      5. One pair per line
    Returns list of {"name": ..., "value": ...}
    """
    text = (raw or "").strip()
    if not text:
        return []

    # --- Try JSON array first (EditThisCookie, J2TEAM, etc.) ---
    if text.lstrip().startswith("["):
        try:
            data = json.loads(text)
            pairs = []
            for item in data:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("key") or ""
                    value = str(item.get("value") or "")
                    if name:
                        pairs.append({"name": name.strip(), "value": value})
            if pairs:
                return pairs
        except (json.JSONDecodeError, Exception):
            pass

    # --- Try JSON object ---
    if text.lstrip().startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                return [{"name": k, "value": str(v)} for k, v in data.items()]
        except (json.JSONDecodeError, Exception):
            pass

    # --- Netscape cookie format (tab-separated, 7 columns) ---
    lines = text.splitlines()
    if any("\t" in line for line in lines):
        pairs = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                name = parts[5].strip()
                value = parts[6].strip() if len(parts) > 6 else ""
                if name:
                    pairs.append({"name": name, "value": value})
        if pairs:
            return pairs

    # --- Standard key=value pairs (separated by ; or newlines) ---
    text = text.replace("\n", ";").replace("\r", "")
    pairs = []
    seen = set()
    for part in text.split(";"):
        item = part.strip()
        if not item:
            continue
        eq_index = item.find("=")
        if eq_index == -1:
            continue
        name = item[:eq_index].strip()
        value = item[eq_index + 1:].strip()
        if name and name not in seen:
            seen.add(name)
            pairs.append({"name": name, "value": value})
    return pairs


def build_cookie_header(raw):
    pairs = parse_cookie_string(raw)
    return "; ".join(f"{item['name']}={item['value']}" for item in pairs)


# ─── Token Extraction ──────────────────────────────────────────────────────

def extract_tokens_from_html(html):
    result = {"fbDtsg": "", "lsd": "", "userId": ""}
    if not html:
        return result

    # ---- fbDtsg patterns (ordered by reliability) ----
    fb_dtsg_patterns = [
        r'"DTSGInitialData"\s*,\s*\[\]\s*,\s*\{"token"\s*:\s*"([^"]{10,})"',
        r'"DTSGInitialData"\s*:\s*\{"token"\s*:\s*"([^"]{10,})"',
        r'name="fb_dtsg"\s[^>]*value="([^"]{10,})"',
        r'value="([^"]{10,})"\s[^>]*name="fb_dtsg"',
        r'"fb_dtsg"\s*(?:,|\:)\s*(?:\[\]\s*,\s*)?\{"token"\s*:\s*"([^"]{10,})"',
        r'fb_dtsg["\']\s*[,:].*?["\']([A-Za-z0-9_\-]{20,})["\']',
        r'"token"\s*:\s*"(A[A-Za-z0-9+/=_\-]{10,})"',
    ]
    for pattern in fb_dtsg_patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            result["fbDtsg"] = match.group(1)
            break

    # ---- LSD patterns ----
    lsd_patterns = [
        r'"LSD"\s*,\s*\[\]\s*,\s*\{"token"\s*:\s*"([^"]{4,})"',
        r'"lsd"\s*:\s*\{"token"\s*:\s*"([^"]{4,})"',
        r'name="lsd"\s[^>]*value="([^"]{4,})"',
        r'value="([^"]{4,})"\s[^>]*name="lsd"',
        r'"lsd"\s*:\s*"([^"]{4,})"',
        r'LSD.*?"token"\s*:\s*"([^"]{4,})"',
    ]
    for pattern in lsd_patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            result["lsd"] = match.group(1)
            break

    # ---- userId patterns ----
    uid_patterns = [
        r'"USER_ID"\s*:\s*"(\d+)"',
        r'"actorID"\s*:\s*"(\d+)"',
        r'"viewerID"\s*:\s*"(\d+)"',
        r'"ACCOUNT_ID"\s*:\s*"(\d+)"',
        r'c_user[="](\d+)',
        r'"uid"\s*:\s*(\d+)',
        r'"userId"\s*:\s*"(\d+)"',
    ]
    for pattern in uid_patterns:
        match = re.search(pattern, html)
        if match:
            result["userId"] = match.group(1)
            break

    return result


# ─── HTTP Helpers ────────────────────────────────────────────────────────────

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0",
}


def fetch_facebook_page(cookie_header):
    import urllib.request
    import gzip as gzip_module

    urls = [
        "https://www.facebook.com/adsmanager/creation",
        "https://www.facebook.com/adsmanager",
        "https://web.facebook.com/",
        "https://www.facebook.com/",
    ]
    for url in urls:
        try:
            headers = {**BROWSER_HEADERS, "Cookie": cookie_header}
            req = Request(url, headers=headers)
            opener = urllib.request.build_opener()
            with opener.open(req, timeout=25) as response:
                data = response.read()
                encoding = response.headers.get("Content-Encoding", "")
                if encoding == "gzip":
                    data = gzip_module.decompress(data)
                html = data.decode("utf-8", "ignore")
            if html and len(html) > 5000 and ("facebook" in html.lower() or "fb" in html.lower()):
                return html
        except Exception:
            continue
    return ""


# ─── GraphQL ──────────────────────────────────────────────────────────────

def create_uuid():
    return str(uuid.uuid4())


def create_jazoest(token):
    if not token:
        return "22000"
    total = sum(ord(char) for char in token)
    return f"2{total}"


def graphql_request(doc_id, variables, friendly_name, state):
    if not state.get("fbDtsg") or not state.get("lsd"):
        raise RuntimeError("لم يتم ربط الحساب بعد. يرجى الاتصال أولًا.")

    params = {
        "av": state.get("userId") or "",
        "__user": state.get("userId") or "",
        "__a": "1",
        "__req": hex(random.randint(1, 255))[2:],
        "__hs": "19957.HYP:comet_pkg.2.1..0.0",
        "__dyn": "7AzHJ16U9ob8ng568oE10d0BS1ZzXwIzy4ECwjwpUe8hx7oqovzEdF8ixy360CEbo9E3Lx62G3i1ywOwv89k2C1Fwc60D85e0FE2awdFTw8O2K2u360kEcwhEze4UaEW0HU1IEe87q0jEbxa",
        "fb_dtsg": state.get("fbDtsg", ""),
        "jazoest": create_jazoest(state.get("fbDtsg", "")),
        "lsd": state.get("lsd", ""),
        "variables": json.dumps(variables),
        "doc_id": doc_id,
        "fb_api_caller_class": "RelayModern",
        "fb_api_req_friendly_name": friendly_name or "BoostTool",
        "server_timestamps": "true",
    }
    body = urlencode(params).encode("utf-8")
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-FB-LSD": state.get("lsd", ""),
        "X-FB-Friendly-Name": friendly_name or "BoostTool",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": state.get("cookieHeader", ""),
        "Origin": "https://www.facebook.com",
        "Referer": "https://www.facebook.com/adsmanager/",
        "User-Agent": BROWSER_HEADERS["User-Agent"],
        "Accept": "*/*",
        "Accept-Language": BROWSER_HEADERS["Accept-Language"],
    }
    req = Request(
        "https://www.facebook.com/api/graphql/",
        data=body,
        method="POST",
        headers=headers,
    )
    with urlopen(req, timeout=30) as response:
        text = response.read().decode("utf-8", "ignore")

    lines = [line for line in text.splitlines() if line.strip()]
    for line in lines:
        try:
            parsed = json.loads(line)
            if parsed.get("data") or parsed.get("errors"):
                return parsed
        except Exception:
            continue
    if text.strip().startswith("<!DOCTYPE") or "<html" in text.lower():
        raise RuntimeError("الاستجابة عادت كً HTML. قد تكون الكوكيز منتهية أو محظورة.")
    raise RuntimeError(f"استجابة غير صالحة من GraphQL: {text[:300]}")


# ─── Ad Boost ───────────────────────────────────────────────────────────────

def expand_countries(raw):
    AFRICA = ["NG", "GH", "KE", "ZA", "CI", "MZ", "ZM", "EG", "MA", "DZ", "TN",
              "CM", "SN", "ET", "TZ", "UG", "RW", "AO", "BJ", "BF", "BW", "CD", "CG", "GA", "GN"]
    COMB = ["PH"] + AFRICA
    list_values = [item.strip() for item in raw.split(",") if item.strip()]
    expanded = []
    seen = set()
    for country in list_values:
        targets = AFRICA if country == "AFRICA_REGION" else COMB if country == "COMB_BOOST" else [country]
        for t in targets:
            if t not in seen:
                seen.add(t)
                expanded.append(t)
    return expanded


def run_boost(payload):
    state = {
        "cookies": payload.get("cookies", ""),
        "cookieHeader": payload.get("cookieHeader", ""),
        "fbDtsg": payload.get("fbDtsg", ""),
        "lsd": payload.get("lsd", ""),
        "userId": payload.get("userId", ""),
    }
    page_id = str(payload.get("pageId", "")).strip()
    ad_account_id = re.sub(r"\D", "", str(payload.get("adAccountId", "")).strip())
    post_id = str(payload.get("postId", "")).strip()
    link = str(payload.get("link", "")).strip()
    budget = float(payload.get("budget") or 2)
    duration = int(payload.get("duration") or 7)
    currency = payload.get("currency") or "USD"
    goal = payload.get("goal") or "LINK_CLICKS"
    countries_input = str(payload.get("countries") or "EG").strip()
    gender = int(payload.get("gender") or 0)
    age_min = int(payload.get("ageMin") or 18)
    age_max = int(payload.get("ageMax") or 55)

    if not page_id or not ad_account_id or not post_id or (goal == "LINK_CLICKS" and not link):
        return {"success": False, "message": "الرجاء ملء كل الحقول المطلوبة قبل الإرسال."}

    countries = expand_countries(countries_input or "EG")
    if not countries:
        return {"success": False, "message": "يرجى اختيار دولة/دول على الأقل."}

    targeting_spec = {
        "genders": [1, 2] if gender == 0 else [gender],
        "age_min": age_min,
        "age_max": age_max,
        "geo_locations": {
            "location_types": ["home", "recent"],
            "countries": countries,
        },
    }

    cta_map = {
        "MESSAGES": {"type": "MESSAGE_PAGE", "value": {"app_destination": "MESSENGER", "link": "https://fb.com/messenger_doc/"}},
        "PAGE_LIKES": {"type": "LIKE_PAGE", "value": {}},
        "POST_ENGAGEMENT": {"type": "NO_BUTTON", "value": {}},
        "VIDEO_VIEWS": {"type": "NO_BUTTON", "value": {}},
    }
    cta = cta_map.get(goal) or {"type": "LEARN_MORE", "value": {"link": link}}

    creation_spec = {
        "ads_lwi_goal": "GET_MULTI_MESSAGES" if goal == "MESSAGES" else goal,
        "objective": goal,
        "budget": int(budget * 100),
        "budget_type": "DAILY_BUDGET",
        "currency": currency,
        "duration_in_days": duration,
        "run_continuously": False,
        "is_automatic_goal": False,
        "legacy_ad_account_id": ad_account_id,
        "legacy_entry_point": "www_profile_plus_timeline_caa_cae_voice",
        "placement_spec": {"publisher_platforms": ["FACEBOOK"]},
        "audience": {
            "targeting_spec": targeting_spec,
            "audience_option": "CUSTOM",
            "saved_audience_id": None,
        },
        "ad_target_spec": {"client_can_edit": True},
        "targeting_spec_string": json.dumps(targeting_spec),
        "adgroup_specs": [{"creative": {"call_to_action": cta, "object_story_id": f"{page_id}_{post_id}"}}],
    }
    if goal == "MESSAGES":
        creation_spec["cta_data"] = {
            "is_cta_share_post": False,
            "link": "https://fb.com/messenger_doc/",
            "type": "MESSAGE_PAGE",
        }

    doc_ids = [
        "9955578997835249",
        "8916092638475205",
        "6489498407756881",
        "5765279870242471",
        "7890123456789012",
        "3456789012345678",
    ]
    last_error = None
    success_payload = None

    for doc_id in doc_ids:
        try:
            variables = {
                "input": {
                    "boost_id": None,
                    "creation_spec": creation_spec,
                    "flow_id": create_uuid(),
                    "lwi_asset_id": {"id": page_id},
                    "manual_review_requested": False,
                    "page_id": page_id,
                    "product": "BOOSTED_POST",
                    "target_id": post_id,
                    "actor_id": state.get("userId") or "",
                    "client_mutation_id": str(random.randint(10000, 99999)),
                }
            }
            res = graphql_request(doc_id, variables, "LWICometCreateBoostedComponentMutation", state)
            if res and (res.get("data") or res.get("errors")):
                success_payload = res
                break
        except Exception as error:
            last_error = error
            continue

    if not success_payload:
        return {
            "success": False,
            "message": str(last_error) if last_error else "فشل الإرسال. حاول مرة أخرى بعد تحديث الكوكيز.",
        }

    boost_id = (success_payload.get("data") or {}).get("create_boosted_component", {}).get("id")
    if boost_id:
        return {"success": True, "message": f"✅ تم إنشاء الحملة بنجاح. Boost ID: {boost_id}", "payload": success_payload}
    if success_payload.get("errors"):
        msg = success_payload["errors"][0].get("message", "تعذر إنشاء الحملة.")
        return {"success": False, "message": msg, "payload": success_payload}
    return {"success": True, "message": "تم استلام استجابة. راجع النتائج أدناه.", "payload": success_payload}


# ─── HTTP Server ──────────────────────────────────────────────────────────────

class BoostHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in {"/", "/index.html"}:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(INDEX_PATH, "rb") as f:
                self.wfile.write(f.read())
            return
        self.send_error(404, "Not Found")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", "ignore") if length else ""
        if self.path == "/api/connect":
            self.handle_connect(body)
        elif self.path == "/api/run":
            self.handle_run(body)
        else:
            self.send_error(404, "Not Found")

    def handle_connect(self, body):
        try:
            payload = json.loads(body or "{}")
        except json.JSONDecodeError:
            return self.send_json(400, {"success": False, "message": "طلب غير صحيح"})

        raw_cookies = (payload.get("cookies") or "").strip()
        if not raw_cookies:
            return self.send_json(400, {"success": False, "message": "يرجى إدخال كوكيز فيسبوك أولاً"})

        cookie_header = build_cookie_header(raw_cookies)
        parsed = parse_cookie_string(raw_cookies)
        cookie_names = {p["name"].lower() for p in parsed}

        # Check essential cookies
        missing = [e for e in ["c_user", "xs"] if e not in cookie_names]
        if missing:
            return self.send_json(200, {
                "success": False,
                "message": f"الكوكيز ناقصة: يجب أن تحتوي على {', '.join(missing)}. تأكد من تصدير كل الكوكيز.",
                "fbDtsg": "", "lsd": "", "userId": ""
            })

        html = fetch_facebook_page(cookie_header)
        if not html:
            return self.send_json(200, {
                "success": False,
                "message": "تعذر الوصول إلى فيسبوك. تحقق من الاتصال أو جرب مرة أخرى.",
                "fbDtsg": "", "lsd": "", "userId": ""
            })

        tokens = extract_tokens_from_html(html)

        # Fallback: extract userId from c_user cookie
        if not tokens.get("userId"):
            for p in parsed:
                if p["name"] == "c_user":
                    tokens["userId"] = p["value"]
                    break

        if not tokens.get("fbDtsg") or not tokens.get("lsd"):
            is_logged_in = "logout" in html.lower() or "log_out" in html.lower()
            if not is_logged_in:
                msg = "الكوكيز منتهية الصلاحية أو غير صحيحة. أعد تصديرها من المتصفح وأنت مسجل الدخول."
            else:
                msg = "الحساب مسجل الدخول لكن تعذر استخراج الرموز. جرب تصدير الكوكيز من Ads Manager مباشرة."
            return self.send_json(200, {
                "success": False, "message": msg,
                "fbDtsg": "", "lsd": "",
                "userId": tokens.get("userId", ""),
                "debug": {"htmlLength": len(html), "isLoggedIn": is_logged_in}
            })

        self.send_json(200, {
            "success": True,
            "message": f"✅ تم الاتصال بنجاح (userId: {tokens.get('userId', 'غير معروف')})",
            "fbDtsg": tokens["fbDtsg"],
            "lsd": tokens["lsd"],
            "userId": tokens.get("userId", ""),
            "cookieHeader": cookie_header,
            "cookies": raw_cookies,
        })

    def handle_run(self, body):
        try:
            payload = json.loads(body or "{}")
        except json.JSONDecodeError:
            return self.send_json(400, {"success": False, "message": "طلب غير صحيح"})
        result = run_boost(payload)
        self.send_json(200, result)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        return


def main():
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), BoostHandler)
    print(f"🚀 Server running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down")
        server.server_close()


if __name__ == "__main__":
    main()
