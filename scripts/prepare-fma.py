"""Prepare reviewed FMA records and PDF image crops; never modifies sources or database."""
import hashlib,json
from pathlib import Path
import openpyxl,pdfplumber
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'migration-data/fma-2026'
OUT.mkdir(parents=True,exist_ok=True)
PDF=ROOT/'data/Terra_Nova_FMA_Products_2026.pdf'
XLS=ROOT/'data/Terra_Nova_FMA_Products_Order_Form.xlsx'
w=openpyxl.load_workbook(XLS,data_only=True)
s=w.active
# Independently ordered per-color packs, with assorted sizes, as confirmed by user.
colors={11:['Black','Charcoal','Sky Blue'],12:['Green','Sage','Sky Blue','Maroon','Ash','Grey','Charcoal','Black'],28:['Green','Sage','Sky Blue','Maroon','Ash','Grey','Charcoal','Black'],29:['Grey Mix','Charcoal Mix','Black','Ash','Navy','Chocolate','Green'],30:['Grey Mix','Charcoal Mix','Black','Ash','Navy','Chocolate'],31:['Navy','Black','Grey Mix','Ash Mix','Charcoal Mix','Chocolate'],32:['Ash','Navy','Black','Grey Mix','Charcoal Mix','Chocolate'],33:['Ash','Navy','Black','Grey Mix','Charcoal Mix','Chocolate'],34:['Black','Grey','Navy'],35:['Grey Melange','Black','Graphite Heather'],36:['Black','Charcoal','Grey','Navy Blue','Dusty Rose'],37:['Sky','Teal','Black','Navy Blue'],38:['Ash','Black','Blue'],39:['Black','Navy Blue','Sky Blue']}
# Photo-only crop rectangles, normalized against PDF page width and height.
regions={2:(.02,.18,.98,.86),3:(.02,.32,.80,.57),4:(.02,.29,.81,.66),5:(.03,.44,.67,.80),6:(.01,.20,.99,.79),7:(.02,.30,.98,.65),8:(.02,.35,.98,.61),9:(.02,.22,.98,.71),10:(.02,.40,.98,.77),11:(.03,.30,.49,.74),12:(.02,.22,.60,.67),14:(.02,.22,.98,.55),15:(.02,.28,.81,.65),16:(.05,.49,.95,.70),17:(.02,.53,.98,.73),18:(.02,.53,.98,.73),19:(.02,.53,.98,.73),20:(.02,.53,.98,.73),21:(.03,.55,.72,.80),22:(.04,.34,.80,.65),23:(.02,.33,.82,.59),24:(.02,.31,.80,.55),25:(.02,.32,.81,.58),26:(.02,.32,.81,.59),27:(.04,.28,.51,.83)}
records=[]
with pdfplumber.open(PDF) as pdf:
 for r in range(10,41):
  vals=[s.cell(r,c).value for c in range(1,15)]
  slide,category,name,style,sku,upc,dealer,retail,margin,pack,*_=vals
  page=int(slide)+1
  name=name.strip();style=style.strip();sku=str(sku);upc=str(upc or '')
  if r==10:sku='6872709'
  if r==16:upc='809565048508'
  if r==19:sku='6462760'
  if r==20:sku='6462759'
  if r==21:sku='6462235';name='Duncan 3-PC Quilt Set - King';style='Duncan / King'
  if r==12:name='Slazenger Cargo Shorts'
  if r==28:name="Slazenger Men's Joggers";style='60% Cotton / 40% Poly Fleece'
  if r==29:sku='6872219';dealer=19.43;retail=29.99
  if r==31:name="Slazenger Men's Fleece Cargo Joggers";style='Style 8012SLM'
  if r==33:style='Style 8014SLM'
  if r in (29,30,31,32,33):name += ' - '+style.replace('Style ','')
  if r in (11,37,38,39):name=name.split(' -')[0]
  cost={19:19.95,20:20.95,22:21,23:21,24:21,25:21,26:21}.get(r)
  skus=[sku]
  if r==14:
   skus=['6873145','6873146','6873148','6873147','6873149','6873150','6873152','6873153','6873144','6873151'];sku=' / '.join(skus);pack=12
  for color in colors.get(r,['']):
   key=f'row-{r}'+('-'+color.lower().replace(' ','-') if color else '')
   rect=regions.get(page)
   if page==13:
    k=r-22;rect=(.035+k*.19,.245,.205+k*.19,.44)
   if r==19:rect=(.03,.30,.49,.51)
   if r==20:rect=(.03,.53,.49,.74)
   if color:
    index=colors[r].index(color); x0,y0,x1,y1=rect
    columns=4 if r in (12,28) else len(colors[r]); rows=2 if r in (12,28) else 1
    dx=(x1-x0)/columns; dy=(y1-y0)/rows
    rect=(x0+(index%columns)*dx,y0+(index//columns)*dy,x0+(index%columns+1)*dx,y0+(index//columns+1)*dy)
   p=pdf.pages[page-1]
   box=tuple(v*(p.width if i%2==0 else p.height) for i,v in enumerate(rect))
   im=p.crop(box).to_image(resolution=140).original.convert('RGB')
   im.thumbnail((1100,1100))
   file=OUT/f'{key}.jpg';im.save(file,quality=88)
   description=str(vals[13] or '').strip()
   if color:description=f'{color}; assorted sizes. '+description
   if r==14:description='One ordering pack contains 12 three-pair gift packs, including Barnyard, Princess, Truck and Monsters. Minimum 4 ordering packs (48 gift packs). CT identifiers: '+', '.join(skus)
   unit='sets' if 19<=r<=26 else ('gift packs' if r==14 else 'items')
   records.append(dict(key=key,name=name+(f' - {color}' if color else ''),category=category,style=style,sku=sku,barcode=upc,cost=cost,dealerPrice=dealer,srp=retail,orderUnit='pack' if color or r==14 else 'case',unitsPerOrder=pack,unitLabel=unit,minimumOrder=4 if r==14 else 1,description=description,imageFile=file.name,imageSha256=hashlib.sha256(file.read_bytes()).hexdigest(),source=dict(pdfPage=page,excelRow=r,color=color,crop=rect,ctSkus=skus,excelValues=vals,decision='User-confirmed PDF corrections; Excel case quantities')))
 # Each Northern Trek style group is one independently ordered 36-item pack.
 sweater_styles=['7271MNT','7273MNT','7270MNT','7266MNT','7267MNT','7272MNT','7268MNT','7274MNT','7269MNT','7264MNT']
 base=next(p for p in records if p['key']=='row-10')
 records.remove(base)
 for index,style_code in enumerate(sweater_styles):
  if index < 9:
   x0,x1=[(.015,.31),(.32,.68),(.69,.985)][index%3]
   y0,y1=[(.185,.375),(.375,.565),(.565,.73)][index//3]
  else:x0,y0,x1,y1=.015,.735,.41,.93
  rect=(x0,y0,x1,y1)
  key='row-10' if index==0 else 'row-10-style-'+style_code.lower()
  p=pdf.pages[1]
  box=(x0*p.width,y0*p.height,x1*p.width,y1*p.height)
  im=p.crop(box).to_image(resolution=140).original.convert('RGB');im.thumbnail((1100,1100))
  file=OUT/f'{key}.jpg';im.save(file,quality=88)
  item=json.loads(json.dumps(base))
  item.update(key=key,name="Northern Trek Men's Sweaters - "+style_code,style=style_code,orderUnit='pack',unitsPerOrder=36,description='Assorted colours and sizes within style '+style_code+'. One pack contains 36 items.',imageFile=file.name,imageSha256=hashlib.sha256(file.read_bytes()).hexdigest())
  item['source'].update(crop=rect,styleGroup=style_code,decision='User confirmed each of the 10 Northern Trek style groups is a separate 36-item pack')
  records.append(item)
 # Canadian Tire logo, extracted from the supplied soccer page header.
 p=pdf.pages[2];p.crop((p.width*.81,p.height*.008,p.width*.985,p.height*.115)).to_image(resolution=160).original.save(ROOT/'public/images/canadian-tire.png')
manifest=dict(catalogKey='fma-2026',company='Canadian Tire',sources={PDF.name:hashlib.sha256(PDF.read_bytes()).hexdigest(),XLS.name:hashlib.sha256(XLS.read_bytes()).hexdigest()},products=records)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'products':len(records),'sourceRows':len(set(p['source']['excelRow'] for p in records)),'imageBytes':sum((OUT/p['imageFile']).stat().st_size for p in records)},indent=2))
