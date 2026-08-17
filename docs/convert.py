"""GeoJSON départements → tracés SVG 500×500 pour le harnais de captures."""

import json
import math

with open("departements.geojson", encoding="utf-8") as f:
    data = json.load(f)

COS = math.cos(math.radians(46.2))  # correction équirectangulaire

# Bornes globales (métropole + Corse) en coordonnées projetées.
xs, ys = [], []
for feat in data["features"]:
    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        for ring in poly:
            for lon, lat in ring:
                xs.append(lon * COS)
                ys.append(lat)

min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)
span = max(max_x - min_x, max_y - min_y)

# La vraie vignette place la France un peu bas-droite, l'encart en haut-gauche.
MARGIN, SIZE = 22, 500
scale = (SIZE - 2 * MARGIN) / span
OFF_X = MARGIN + 14
OFF_Y = MARGIN + 26


def project(lon, lat):
    x = OFF_X + (lon * COS - min_x) * scale
    y = OFF_Y + (max_y - lat) * scale
    return round(x), round(y)


paths = {}
total_pts = 0
for feat in data["features"]:
    code = feat["properties"]["code"]
    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    parts = []
    for poly in polys:
        for ring in poly:
            pts = []
            for lon, lat in ring:
                p = project(lon, lat)
                if not pts or p != pts[-1]:
                    pts.append(p)
            if len(pts) < 3:
                continue
            total_pts += len(pts)
            d = f"M{pts[0][0]},{pts[0][1]}" + "".join(f"L{x},{y}" for x, y in pts[1:]) + "Z"
            parts.append(d)
    paths[code] = "".join(parts)

# La petite couronne (75, 92, 93, 94) reprojetée seule, pour l'encart :
# ajustée dans une boîte 100 × 90, le harnais la met à l'échelle du cadre.
IDF = {"75", "92", "93", "94"}
ixs, iys = [], []
for feat in data["features"]:
    if feat["properties"]["code"] not in IDF:
        continue
    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        for ring in poly:
            for lon, lat in ring:
                ixs.append(lon * COS)
                iys.append(lat)

i_min_x, i_max_x = min(ixs), max(ixs)
i_min_y, i_max_y = min(iys), max(iys)
i_scale = min(100 / (i_max_x - i_min_x), 90 / (i_max_y - i_min_y))

idf_paths = {}
for feat in data["features"]:
    code = feat["properties"]["code"]
    if code not in IDF:
        continue
    geom = feat["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    parts = []
    for poly in polys:
        for ring in poly:
            pts = []
            for lon, lat in ring:
                x = round((lon * COS - i_min_x) * i_scale, 1)
                y = round((i_max_y - lat) * i_scale, 1)
                if not pts or (x, y) != pts[-1]:
                    pts.append((x, y))
            if len(pts) < 3:
                continue
            d = f"M{pts[0][0]},{pts[0][1]}" + "".join(f"L{x},{y}" for x, y in pts[1:]) + "Z"
            parts.append(d)
    idf_paths[code] = "".join(parts)

out = (
    "const DEPT_PATHS = " + json.dumps(paths, separators=(",", ":")) + ";\n"
    "const IDF_PATHS = " + json.dumps(idf_paths, separators=(",", ":")) + ";\n"
)
with open("france-depts.js", "w", encoding="utf-8") as f:
    f.write(out)

print(f"{len(paths)} départements, {total_pts} points, {len(out)} octets")
