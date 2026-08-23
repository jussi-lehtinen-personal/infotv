#!/usr/bin/env python3
"""
Create a recurring series of "Taitojää" club events in Jopox (hallinta3 CMS) via the
service account. Two weekly series from 2026-08-11 (tomorrow) through 2026-12-20:
  - Tuesday   15:30-16:50
  - Wednesday 14:30-15:50
Auth + SaveEvent endpoint proven in tools/jopox-event.js. Stdlib only (urllib).

  python tools/jopox-taitojaa.py dry            # print the schedule + a sample body, NO writes
  python tools/jopox-taitojaa.py create-first   # create ONLY the first Tue + first Wed (formatting check)
  python tools/jopox-taitojaa.py create         # create the WHOLE series (writes to the live site!)
"""
import json, sys, time, urllib.request, http.cookiejar
from datetime import date, timedelta
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ROOT = "D:/work/ahma-code/infotv/infotv"
CFG = json.load(open(ROOT + "/api/local.settings.json", encoding="utf-8"))["Values"]
USER, PASS = CFG["JOPOX_SVC_USER"], CFG["JOPOX_SVC_PASS"]
MYAPI, HALL, SITE = "https://myapi.jopox.fi", "https://hallinta3.jopox.fi", "197"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"

START, END = date(2026, 8, 11), date(2026, 12, 20)
NL = "<br>"  # Jopox renders the description as HTML → \n collapsed to one line, use <br>

# (weekday: Mon=0..Sun=6), time, endTime, message — texts VERBATIM from the user.
SERIES = [
    dict(name="Taitojää", weekday=1, time="15:30", endTime="16:50",
         text=NL.join(["Taitojää", "Kokoontuminen: 15:30", "Jäävuoro: 16:00 - 16:50"])),
    dict(name="Taitojää", weekday=2, time="14:30", endTime="15:50",
         text=NL.join(["Taitojää", "Kokoontuminen 14:30", "Jäävuoro 15:00 - 15:50"])),
]

def dates_for(weekday):
    d, out = START, []
    while d <= END:
        if d.weekday() == weekday:
            out.append(d)
        d += timedelta(days=1)
    return out

def event_body(s, d, eid=None):
    ds = d.strftime("%d.%m.%Y")
    return {"newEvent": {"id": eid, "name": s["name"], "date": ds, "time": s["time"],
            "endDate": ds, "endTime": s["endTime"], "location": "Wareena", "text": s["text"],
            "visibilty": 3, "maxParticipants": None, "deadline": "", "groups": [],
            "privateText": False, "isPrivate": False}}

# ---- HTTP (cookie jar follows the otlogin redirect → MopoxAdm session) ----
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def req(url, method="GET", data=None, token=None, ctype="application/json"):
    body = json.dumps(data).encode() if data is not None else None
    h = {"User-Agent": UA, "Accept": "application/json", "Content-Type": ctype + "; charset=UTF-8"}
    if token: h["Authorization"] = "Bearer " + token
    if "hallinta3" in url:
        h["X-Requested-With"] = "XMLHttpRequest"; h["Origin"] = HALL
        h["Referer"] = HALL + "/Admin/HockeyPox2020/Events/Events.aspx"
    else:
        h["Origin"] = "https://login.jopox.fi"; h["Referer"] = "https://login.jopox.fi/"
    r = opener.open(urllib.request.Request(url, data=body, headers=h, method=method))
    return r.status, r.read().decode("utf-8", "replace")

def find_token(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if "accesstoken" in k.lower() and isinstance(v, str): return v
            t = find_token(v)
            if t: return t
    return None

def auth():
    _, lt = req(MYAPI + "/api/v1/myjopoxaccount/login", "POST", {"username": USER, "password": PASS})
    token = find_token(json.loads(lt))
    if not token: raise SystemExit("login failed")
    _, bt = req(MYAPI + f"/api/v1/adminlogin/{SITE}/onetimer?source=selfservice", "POST", {}, token=token)
    url = json.loads(bt).get("url")
    if not url: raise SystemExit("bridge failed")
    req(url)  # GET otlogin → sets MopoxAdm (opener follows redirect)
    if not any(c.name == "MopoxAdm" for c in jar): raise SystemExit("no MopoxAdm session")

def save(s, d):
    st, body = req(HALL + "/Admin/Hockeypox2020/Events/Ajax.aspx/SaveEvent", "POST", event_body(s, d))
    return st, body

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "dry"
    plan = [(s, d) for s in SERIES for d in dates_for(s["weekday"])]
    plan.sort(key=lambda x: x[1])
    print(f"Series: {len(plan)} events, {START} → {END}")
    for s in SERIES:
        ds = dates_for(s["weekday"])
        print(f"  {['Ma','Ti','Ke','To','Pe','La','Su'][s['weekday']]} {s['time']}-{s['endTime']}: {len(ds)} kpl  ({ds[0]} … {ds[-1]})")

    if cmd == "dry":
        print("\nSample body (first Tuesday):")
        print(json.dumps(event_body(SERIES[0], dates_for(1)[0]), ensure_ascii=False, indent=1))
        print("\nDRY RUN — nothing written.")
        return

    if cmd == "update":
        # Edit existing events in place: one id per series in order (Tue, Wed).
        ids = sys.argv[2:2 + len(SERIES)]
        if len(ids) != len(SERIES):
            raise SystemExit("give one id per series: update <TueId> <WedId>")
        print(f"\nAuthenticating… (updating {len(ids)} events)")
        auth(); print("auth ok (MopoxAdm)\n")
        for s, eid in zip(SERIES, ids):
            d = dates_for(s["weekday"])[0]
            st, body = req(HALL + "/Admin/Hockeypox2020/Events/Ajax.aspx/SaveEvent", "POST", event_body(s, d, int(eid)))
            good = st == 200 and '"d":true' in body.replace(" ", "")
            print(f"  edit {eid}  {d.strftime('%a %d.%m.')} {s['time']}: {st} {'OK' if good else body[:80]}")
        print("\nDone (update). Check the app for line breaks.")
        return

    todo = plan
    if cmd == "create-first":
        todo = [(s, dates_for(s["weekday"])[0]) for s in SERIES]           # first of each series
    elif cmd == "create-rest":
        todo = [(s, d) for s in SERIES for d in dates_for(s["weekday"])[1:]]  # skip the first (already made)
        todo.sort(key=lambda x: x[1])
    elif cmd != "create":
        raise SystemExit("unknown cmd: " + cmd)

    print(f"\nAuthenticating… (writing {len(todo)} events)")
    auth()
    print("auth ok (MopoxAdm)\n")
    ok = 0
    for s, d in todo:
        st, body = save(s, d)
        good = st == 200 and '"d":true' in body.replace(" ", "")
        print(f"  {d.strftime('%a %d.%m.%Y')} {s['time']}: {st} {'OK' if good else body[:80]}")
        ok += good
        time.sleep(0.6)
    print(f"\nDone: {ok}/{len(todo)} created.")

if __name__ == "__main__":
    main()
