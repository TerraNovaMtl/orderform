"""Render intact source pages and stable product-key hit areas, without database writes."""
import json,sys
from pathlib import Path
import pdfplumber
ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT/'migration-data/fma-2026/manifest.json').read_text())
out = ROOT/'public/images/fma-pages'
out.mkdir(parents=True, exist_ok=True)
pages = []
selected_pages = next((set(map(int, arg.split('=',1)[1].split(','))) for arg in sys.argv if arg.startswith('--pages=')), None)
# Full item and colour-label hit areas, reviewed against the intact pages.
color_areas = {3:(.02,.32,.80,.595),4:(.02,.29,.85,.66),15:(.02,.26,.85,.66),16:(.02,.545,.98,.765),17:(.02,.545,.98,.77),18:(.02,.55,.98,.78),19:(.02,.54,.98,.765),20:(.02,.53,.98,.76),21:(.03,.55,.72,.78),22:(.04,.32,.80,.66),23:(.02,.29,.84,.59),24:(.02,.30,.84,.595),25:(.02,.30,.86,.60),26:(.02,.30,.86,.61)}
def hit_area(product):
    return [0,0,1,1]
with pdfplumber.open(ROOT/'data/Terra_Nova_FMA_Products_2026.pdf') as pdf:
    for number, page in enumerate(pdf.pages, 1):
        filename = f'page-{number:02d}.png'
        if (not (out/filename).exists() or ('--map-only' not in sys.argv and (selected_pages is None or number in selected_pages))):
            page.to_image(resolution=300, antialias=True).original.convert('RGB').save(out/filename, optimize=True)
        regions = [dict(key=p['key'], color=p['source']['color'], bounds=hit_area(p)) for p in manifest['products'] if p['source']['pdfPage']==number]
        pages.append(dict(number=number, image=f'/images/fma-pages/{filename}', width=page.width, height=page.height, regions=regions))
(ROOT/'src/lib/fma-pages.json').write_text(json.dumps(pages, indent=2)+'\n')
print(f'Rendered {len(pages)} intact pages; {sum(len(p["regions"]) for p in pages)} product regions')
