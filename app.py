import json
import os
import re
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = os.path.dirname(__file__)
INDEX_PATH = os.path.join(ROOT, "index.html")


class BoostHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in {"/", "/index.html"}:
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            with open(INDEX_PATH, "rb") as handle:
                self.wfile.write(handle.read())
            return
        self.send_error(404, "Not Found")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", "ignore") if length else ""

        if self.path == "/api/connect":
            self.handle_connect(body)
            return
        if self.path == "/api/run":
            self.handle_run(body)
            return

        self.send_error(404, "Not Found")

    def handle_connect(self, body):
        try:
            payload = json.loads(body or "{}")
        except json.JSONDecodeError:
            self.send_json(400, {"success": False, "message": "طلب غير صحيح"})
            return

        raw_cookies = (payload.get("cookies") or "").strip()
        if not raw_cookies:
            self.send_json(400, {"success": False, "message": "يرجى إدخال كوكيز فيسبوك أولاً"})
            return

        cookie_header = build_cookie_header(raw_cookies)
        html = fetch_facebook_page(cookie_header)
        tokens = extract_tokens_from_html(html)

        if not tokens.get("fbDtsg") or not tokens.get("lsd"):
            self.send_json(200, {
                "success": False,
                "message": "تعذر استخراج الرموز من الصفحة. تأكد من صحة الكوكيز وأنك مسجل الدخول إلى فيسبوك.",
                "fbDtsg": "",
                "lsd": "",
                "userId": ""
            })
            return

        self.send_json(200, {
            "success": True,
            "message": "تم الاتصال بنجاح",
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
            self.send_json(400, {"success": False, "message": "طلب غير صحيح"})
            return

        result = run_boost(payload)
        self.send_json(200, result)

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def parse_cookie_string(raw):
    text = (raw or "").replace("\n", ";").strip()
    if not text:
        return []
    pairs = []
    for part in text.split(";"):
        item = part.strip()
        if not item:
            continue
        eq_index = item.find("=")
        if eq_index == -1:
            continue
        name = item[:eq_index].strip()
        value = item[eq_index + 1 :].strip()
        if name:
            pairs.append({"name": name, "value": value})
    return pairs


def build_cookie_header(raw):
    pairs = parse_cookie_string(raw)
    return ";".join(f"{item['name']}={item['value']}" for item in pairs)


def fetch_facebook_page(cookie_header):
    urls = [
        "https://www.facebook.com/adsmanager/creation",
        "https://www.facebook.com/adsmanager",
        "https://www.facebook.com/",
    ]
    for url in urls:
        try:
            req = Request(
                url,
                headers={
                    "Cookie": cookie_header,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            with urlopen(req, timeout=20) as response:
                html = response.read().decode("utf-8", "ignore")
            if html and "facebook" in html.lower():
                return html
        except Exception:
            continue
    return ""


def extract_tokens_from_html(html):
    result = {"fbDtsg": "", "lsd": "", "userId": ""}
    patterns = [
        r'name="fb_dtsg"[^>]*value="([^"]+)"',
        r'"DTSGInitialData"\s*:\s*\{"token"\s*:\s*"([^"]+)"',
        r'fb_dtsg["\']?\s*[:=]\s*["\']([^"\']+)["\']',
        r'"LSD"\s*,\s*\[\]\s*,\s*\{"token"\s*:\s*"([^"]+)"',
        r'"lsd"\s*:\s*"([^"]+)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match and match.group(1):
            if "fb_dtsg" in pattern.pattern.lower() or "dtsginitialdata" in pattern.pattern.lower():
                result["fbDtsg"] = match.group(1)
            elif "lsd" in pattern.pattern.lower():
                result["lsd"] = match.group(1)
    c_user_match = re.search(r"c_user=(\d+)", html, re.I)
    if c_user_match:
        result["userId"] = c_user_match.group(1)
    return result


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
    req = Request(
        "https://www.facebook.com/api/graphql/",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "X-FB-LSD": state.get("lsd", ""),
            "Cookie": state.get("cookieHeader", ""),
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
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
        raise RuntimeError("الاستجابة عادت كـ HTML. قد تكون الكوكيز منتهية أو محظورة.")
    raise RuntimeError("استجابة غير صالحة من GraphQL.")


def expand_countries(raw):
    list_values = [item.strip() for item in raw.split(",") if item.strip()]
    expanded = []
    seen = set()
    for country in list_values:
        if country == "AFRICA_REGION":
            africa = ["NG", "GH", "KE", "ZA", "CI", "MZ", "ZM", "EG", "MA", "DZ", "TN", "CM", "SN", "ET", "TZ", "UG", "RW", "AO", "BJ", "BF", "BW", "CD", "CG", "GA", "GN"]
            for item in africa:
                if item not in seen:
                    seen.add(item)
                    expanded.append(item)
        elif country == "COMB_BOOST":
            combo = ["PH", "NG", "GH", "KE", "ZA", "CI", "MZ", "ZM", "EG", "MA", "DZ", "TN", "CM", "SN", "ET", "TZ", "UG", "RW", "AO", "BJ", "BF", "BW", "CD", "CG", "GA", "GN"]
            for item in combo:
                if item not in seen:
                    seen.add(item)
                    expanded.append(item)
        elif country not in seen:
            seen.add(country)
            expanded.append(country)
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
    ad_account_id = str(payload.get("adAccountId", "")).strip().replace("\D", "")
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
        "genders": [gender],
        "age_min": age_min,
        "age_max": age_max,
        "geo_locations": {"location_types": ["home", "recent"], "countries": countries},
    }

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
        "adgroup_specs": [{
            "creative": {
                "call_to_action": (
                    {"type": "MESSAGE_PAGE", "value": {"app_destination": "MESSENGER", "link": "https://fb.com/messenger_doc/"}}
                    if goal == "MESSAGES"
                    else {"type": "LIKE_PAGE", "value": {}}
                    if goal == "PAGE_LIKES"
                    else {"type": "NO_BUTTON", "value": {}}
                    if goal in {"POST_ENGAGEMENT", "VIDEO_VIEWS"}
                    else {"type": "LEARN_MORE", "value": {"link": link}}
                ),
                "object_story_id": f"{page_id}_{post_id}",
            }
        }],
        "cta_data": {"is_cta_share_post": False, "link": "https://fb.com/messenger_doc/", "type": "MESSAGE_PAGE"} if goal == "MESSAGES" else None,
    }

    doc_ids = ["9955578997835249", "8916092638475205", "7890123456789012", "3456789012345678"]
    last_error = None
    success_payload = None

    for doc_id in doc_ids:
        try:
            payload_to_send = {
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
                    "client_mutation_id": str(int(__import__("random").random() * 100000)),
                }
            }
            res = graphql_request(doc_id, payload_to_send, "LWICometCreateBoostedComponentMutation", state)
            if res and (res.get("data") or res.get("errors")):
                success_payload = res
                break
        except Exception as error:
            last_error = error

    if not success_payload:
        return {"success": False, "message": str(last_error) if last_error else "فشل الإرسال. حاول مرة أخرى بعد تحديث الكوكيز."}

    boost_id = success_payload.get("data", {}).get("create_boosted_component", {}).get("id")
    if boost_id:
        return {"success": True, "message": f"تم إنشاء الحملة بنجاح. Boost ID: {boost_id}", "payload": success_payload}
    if success_payload.get("errors"):
        return {"success": False, "message": success_payload["errors"][0].get("message", "تعذر إنشاء الحملة."), "payload": success_payload}
    return {"success": True, "message": "تم استلام استجابة غير مكتملة. راجع النتائج أدناه.", "payload": success_payload}


def main():
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), BoostHandler)
    print(f"Server running at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down")
        server.server_close()


if __name__ == "__main__":
    main()
