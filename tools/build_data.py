# -*- coding: utf-8 -*-
"""Build ../data.js from the ThemeParks.wiki snapshot + Hebrew content + curated images.

Run:  python tools/build_data.py            (offline, uses cached tools/src/*.json)
      python tools/build_data.py --credits  (also fetches missing image credits from Commons)
"""
import io, json, os, re, subprocess, sys, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
sys.path.insert(0, HERE)
from content_rides import RIDES, STATIONS
from content_food_shows import FOOD, SHOWS, SKIP_SHOWS
from content_places import PLACES, TIPS, CHECKLIST, ITINERARY

DEST = "e8d0207f-da8a-4048-bec8-117aa946b2c2"
PARKS = {"dae968d5-630d-4719-8b06-3d107e944401": "DLP", "ca888437-ebb4-4d50-aed2-d227f7096968": "DAW"}
LANDS = {  # externalId prefix -> Hebrew land name
    "P1M": "מיין סטריט", "P1R": "פרונטירלנד", "P1A": "אדוונצ׳רלנד", "P1N": "פנטזילנד", "P1D": "דיסקברילנד",
    "P1G1": "דיסקברילנד", "P1GR": "פרונטירלנד",
    "P2X": "עולמות פיקסאר", "P2T": "עולמות פיקסאר", "P2A": "מתחם הנוקמים", "P2E": "עולם פרוזן",
    "P2D": "Adventure Way", "P2Z": "חצר ההפקה", "P2F": "הכניסה ל-Adventure World", "P2B": "מתחם הנוקמים",
    "P2P": "מתחם הנוקמים", "P2V": "עולמות פיקסאר", "heroicWelcome": "מתחם הנוקמים",
}
# Hand-curated image picks (auto search returned many wrong files: fountains, a jeep, a German restaurant...)
COMMONS_OK = {"P1NA00", "P1AA01", "P1NA02", "P2XA08", "P1RA03", "P1MA04", "P1AA04", "P1DA08", "P1RA06", "P2XA03",
              "P2XA06", "P1NA09", "P1GS21", "P1M116", "P1NA07", "P1MA02", "P1AA00", "P1DA03", "P1RA00", "P2XA09",
              "P1NR01", "h_hny", "h_nbc", "h_seq", "h_chy", "h_stf", "h_dream", "h_magic", "h_expl", "x_village",
              "x_station", "x_valdeurope", "p_eiffel", "p_champ", "p_bateaux", "p_wilson", "p_lux", "p_cdg"}
WIKI_OK = {"P1NA10", "P1NA08", "P1NA03", "P1NA01", "P1NA13", "P1NA06", "P1AA02", "P1DA09", "P1DA04", "P2EA00",
           "P2AC02", "P2XA07", "P2XA05", "p_arc", "p_trocagarden", "p_laduree", "p_etoile", "p_auber"}
WIKI_ALIAS = {"p_troca": "p_trocagarden", "P1MA01": None}
# Images that show the same ride at another Disney park (illustration only)
OTHER_PARK = {"P1NA08", "P1NA03", "P1NA01", "P1NA13", "P1NA06", "P1DA09", "P1DA04", "P2EA00", "P2AC02", "P2XA07", "P2XA05"}


def load(name):
    return json.load(io.open(os.path.join(SRC, name), encoding="utf-8"))


def thumb500(url):
    url = (url or "").split("?")[0]
    return re.sub(r"/\d+px-", "/500px-", url)


def realfile(url):
    # .../commons/thumb/1/15/Dlp_peter_pan.jpg/330px-Dlp_peter_pan.jpg -> File:Dlp peter pan.jpg
    parts = (url or "").split("?")[0].split("/")
    i = parts.index("thumb") if "thumb" in parts else -1
    name = parts[i + 3] if i >= 0 and len(parts) > i + 3 else parts[-1]
    return "File:" + urllib.parse.unquote(name).replace("_", " ")


def credits(files):
    """Fetch Artist/License for commons file titles (batched)."""
    out = {}
    UA = "DLPTripPlanner/1.0 (personal family trip planner; github.com/yardenkupi/disneyland-paris-trip)"
    for i in range(0, len(files), 40):
        chunk = files[i:i + 40]
        q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "imageinfo", "iiprop": "extmetadata",
                                    "titles": "|".join(chunk)})
        r = subprocess.run(["curl", "-sS", "--ssl-no-revoke", "-m", "40", "-A", UA,
                            "https://commons.wikimedia.org/w/api.php?" + q], capture_output=True)
        d = json.loads(r.stdout.decode("utf-8") or "{}")
        for p in d.get("query", {}).get("pages", {}).values():
            em = (p.get("imageinfo") or [{}])[0].get("extmetadata", {})
            strip = lambda h: re.sub(r"<[^>]+>", "", h or "").strip()[:80]
            out[p["title"]] = (strip(em.get("Artist", {}).get("value")), strip(em.get("LicenseShortName", {}).get("value")))
        time.sleep(0.3)
    return out


def main():
    children = {c["externalId"]: c for c in load("children.json")["children"]}
    geo, imgs, wiki = load("geo.json"), load("images.json"), load("wikiimg.json")

    def image_for(key):
        if key in COMMONS_OK and imgs.get(key):
            v = imgs[key]
            return {"src": thumb500(v["thumb"]), "page": v["page"], "by": v.get("artist", ""), "lic": v.get("license", "")}
        wk = WIKI_ALIAS.get(key, key)
        if wk and wk in WIKI_OK and wiki.get(wk):
            v = wiki[wk]
            fn = realfile(v["thumb"])
            return {"src": thumb500(v["thumb"]), "page": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(fn.replace(" ", "_")),
                    "by": v.get("by", ""), "lic": v.get("lic", ""), "file": fn}
        return None

    items = []

    def land_of(ext):
        for pre in sorted(LANDS, key=len, reverse=True):
            if ext.startswith(pre):
                return LANDS[pre]
        return ""

    def base(ext, kind, extra):
        c = children.get(ext, {})
        loc = c.get("location") or {}
        it = {"k": ext, "id": c.get("id"), "type": kind, "en": re.sub(r"\s+", " ", c.get("name", "")).strip(),
              "park": PARKS.get(c.get("parentId"), ""), "land": land_of(ext),
              "lat": loc.get("latitude"), "lon": loc.get("longitude")}
        it.update(extra)
        im = image_for(ext)
        if im:
            im["other"] = ext in OTHER_PARK
            it["img"] = im
        return it

    for ext, v in RIDES.items():
        items.append(base(ext, "ride", v))
    for ext, name in STATIONS.items():
        it = base(ext, "station", {"he": name, "desc": "תחנה של רכבת הקיטור שמקיפה את הפארק.", "rate": 1, "parent": "P1MA01"})
        items.append(it)
    for ext, v in FOOD.items():
        items.append(base(ext, "food", v))
    for ext, v in SHOWS.items():
        items.append(base(ext, "show", v))
    for key, v in PLACES.items():
        g = geo.get(key, {})
        it = {"k": key, "id": None, "type": v["type"], "lat": g.get("lat"), "lon": g.get("lon"), "park": "", "land": ""}
        it.update(v)
        im = image_for(key)
        if im:
            im["other"] = False
            it["img"] = im
        items.append(it)

    # sanity: every API attraction/restaurant/show is either covered or deliberately skipped
    covered = {i["k"] for i in items}
    missing = [c for c in children.values() if c["entityType"] in ("ATTRACTION", "RESTAURANT", "SHOW")
               and c["externalId"] not in covered and c["externalId"] not in SKIP_SHOWS
               and not c["name"].lower().startswith("reserved")]
    for m in missing:
        print("WARNING not covered:", m["externalId"], m["name"])

    if "--credits" in sys.argv:
        need = [i["img"]["file"] for i in items if i.get("img") and i["img"].get("file") and not i["img"].get("by")]
        cr = credits(sorted(set(need)))
        for k, v in wiki.items():
            fn = realfile(v["thumb"])
            if fn in cr:
                v["by"], v["lic"] = cr[fn]
        json.dump(wiki, io.open(os.path.join(SRC, "wikiimg.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return main_after_credits()

    data = {"dest": DEST, "parks": {"DLP": "dae968d5-630d-4719-8b06-3d107e944401", "DAW": "ca888437-ebb4-4d50-aed2-d227f7096968"},
            "items": items, "tips": TIPS, "checklist": CHECKLIST, "itinerary": ITINERARY,
            "built": time.strftime("%Y-%m-%d")}
    out = os.path.join(os.path.dirname(HERE), "data.js")
    with io.open(out, "w", encoding="utf-8") as f:
        f.write("/* generated by tools/build_data.py - do not edit by hand */\n")
        f.write("window.DLP = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    n_img = sum(1 for i in items if i.get("img"))
    print(f"wrote data.js: {len(items)} items, {n_img} with images, {os.path.getsize(out)//1024} KB")


def main_after_credits():
    sys.argv = [a for a in sys.argv if a != "--credits"]
    main()


if __name__ == "__main__":
    main()
