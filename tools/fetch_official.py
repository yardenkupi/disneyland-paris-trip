# -*- coding: utf-8 -*-
"""Collect the official hero image + activity id of every attraction / restaurant / show / hotel page
on disneylandparis.com -> tools/src/official.json.  Images are NOT downloaded (the app hot-links them
from media.disneylandparis.com, © Disney); we only store the URL, the page URL and the ids found."""
import io, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
CJ = os.path.join(SRC, ".cookies.txt")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
BASE = "https://www.disneylandparis.com"


def get(url):
    r = subprocess.run(["curl", "-sS", "--ssl-no-revoke", "--compressed", "-L", "-m", "60", "-A", UA,
                        "-H", "Accept-Language: en-GB", "-c", CJ, "-b", CJ, url], capture_output=True)
    return r.stdout.decode("utf-8", "replace")


GENERIC = {"disney", "disneyland", "paris", "park", "adventure", "world", "the", "and", "ref", "app", "restaurant", "attraction"}


def fallback_image(html, final_url):
    """Pages without og:image (the '-ref'/'-app' template): pick the media image whose file name
    matches the page slug, skipping backgrounds, separators, logos and banners."""
    slug = final_url.rstrip("/").rsplit("/", 1)[-1]
    toks = [t for t in re.split(r"[-_]", slug) if len(t) >= 4 and t not in GENERIC]
    best, best_sc = None, 0
    for u in dict.fromkeys(re.findall(r'https://media\.disneylandparis\.com/[^"\\ ]+?\.(?:jpg|jpeg|png|webp)', html)):
        name = u.rsplit("/", 1)[-1].lower()
        if any(b in name for b in ("_bg_", "separator", "logo", "icon", "_5-1_", "_5-2_", "banner", "picto")):
            continue
        sc = sum(1 for t in toks if t in name) + (0.5 if "16-9" in name else 0)
        if sc > best_sc:
            best, best_sc = u, sc
    return best if best_sc >= 1 else None


def fix_missing():
    out_path = os.path.join(SRC, "official.json")
    out = json.load(io.open(out_path, encoding="utf-8"))
    for u, v in out.items():
        if v.get("img"):
            continue
        r = subprocess.run(["curl", "-sS", "--ssl-no-revoke", "--compressed", "-L", "-m", "60", "-A", UA, "-H", "Accept-Language: en-GB",
                            "-c", CJ, "-b", CJ, "-w", "\n__FINAL__%{url_effective}", BASE + u], capture_output=True)
        html = r.stdout.decode("utf-8", "replace")
        final = html.rsplit("__FINAL__", 1)[-1].strip()
        v["img"] = fallback_image(html, final)
        v["final"] = final
        if not v.get("own"):
            m = re.search(r'\\"id\\":\\"(P[12][A-Za-z0-9]+)\\"', html)
            v["own"] = m.group(1) if m else None
        print(u, "->", v.get("own"), (v["img"] or "NONE")[-70:], flush=True)
        time.sleep(0.6)
    json.dump(out, io.open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def main():
    if "--fix" in sys.argv:
        return fix_missing()
    urls = set()
    for section in ("attractions", "dining", "entertainment", "hotels"):
        html = get(f"{BASE}/en-gb/{section}/")
        for m in re.findall(r'/en-gb/' + section + r'/[a-z0-9-]+(?:/[a-z0-9-]+)?', html):
            if m.rstrip("/").endswith(("/map", "/leisure-activities")) or m.count("/") < 3:
                continue
            urls.add(m)
        time.sleep(0.5)
    out_path = os.path.join(SRC, "official.json")
    out = json.load(io.open(out_path, encoding="utf-8")) if os.path.exists(out_path) else {}
    for i, u in enumerate(sorted(urls)):
        if u in out:
            continue
        html = get(BASE + u)
        img = re.search(r'property="og:image" content="([^"]+)"', html)
        title = re.search(r'property="og:title" content="([^"]+)"', html) or re.search(r'<title>([^<]+)', html)
        ids = re.findall(r'\\"id\\":\\"([A-Za-z0-9]+)\\"', html)
        # the page's own id sits right next to its hero image / admission fields
        own = re.search(r'\\"admissionRequired\\":(?:true|false)[^{}]{0,200}?\\"id\\":\\"([A-Za-z0-9]+)\\"', html) \
            or re.search(r'\\"id\\":\\"([A-Za-z0-9]+)\\",\\"shortDescription', html)
        out[u] = {"img": img.group(1) if img else None, "title": title.group(1).strip() if title else "",
                  "own": own.group(1) if own else None, "ids": sorted(set(ids))[:40]}
        print(i, u, "->", out[u]["own"], (out[u]["img"] or "NO IMG")[-60:], flush=True)
        json.dump(out, io.open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(0.6)
    print("pages:", len(out), "with image:", sum(1 for v in out.values() if v["img"]))


if __name__ == "__main__":
    main()
