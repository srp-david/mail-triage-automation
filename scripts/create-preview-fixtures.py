"""Generate small synthetic OOXML fixtures; never read customer documents."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

OUT = Path(__file__).resolve().parents[1] / '.runtime' / 'preview-fixtures'
OUT.mkdir(parents=True, exist_ok=True)
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'

def rels(items):
    return '<Relationships xmlns="' + REL + '">' + ''.join(
        f'<Relationship Id="{rid}" Type="{OFFICE}{kind}" Target="{target}"/>'
        for rid, kind, target in items) + '</Relationships>'

def write(ext, parts, types):
    content_types = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    content_types += ''.join(f'<Override PartName="/{name}" ContentType="application/vnd.openxmlformats-officedocument.{kind}+xml"/>' for name, kind in types)
    parts['[Content_Types].xml'] = content_types + '</Types>'
    with ZipFile(OUT / ('sample.' + ext), 'w', ZIP_DEFLATED) as archive:
        for name, xml in parts.items():
            archive.writestr(name, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + xml)

write('docx', {
    '_rels/.rels': rels([('rId1', 'officeDocument', 'word/document.xml')]),
    'word/document.xml': '''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
    <w:p><w:r><w:rPr><w:b/><w:sz w:val="36"/></w:rPr><w:t>DOCX Preview Sample</w:t></w:r></w:p>
    <w:p><w:r><w:t>합성 문서 · 고객 정보 없음</w:t></w:r></w:p>
    <w:tbl><w:tblPr><w:tblW w:w="6000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>Quantity 42</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Second document page</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
    </w:body></w:document>''',
}, [('word/document.xml', 'wordprocessingml.document.main')])

ppt = {
    '_rels/.rels': rels([('rId1', 'officeDocument', 'ppt/presentation.xml')]),
    'ppt/presentation.xml': '''<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>''',
    'ppt/_rels/presentation.xml.rels': rels([('rId1', 'slide', 'slides/slide1.xml'), ('rId2', 'slide', 'slides/slide2.xml')]),
}
for number, title in [(1, 'PPTX Preview Sample'), (2, 'Second Slide 42')]:
    ppt[f'ppt/slides/slide{number}.xml'] = f'''<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="8100000" cy="2000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3200"><a:solidFill><a:srgbClr val="173B3C"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>{title}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'''
write('pptx', ppt, [('ppt/presentation.xml', 'presentationml.presentation.main')] + [(f'ppt/slides/slide{i}.xml', 'presentationml.slide') for i in [1, 2]])

xlsx = {
    '_rels/.rels': rels([('rId1', 'officeDocument', 'xl/workbook.xml')]),
    'xl/workbook.xml': '''<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Details" sheetId="2" r:id="rId2"/></sheets></workbook>''',
    'xl/_rels/workbook.xml.rels': rels([('rId1', 'worksheet', 'worksheets/sheet1.xml'), ('rId2', 'worksheet', 'worksheets/sheet2.xml')]),
}
for i, text in [(1, 'XLSX Preview Sample'), (2, 'Second sheet data')]:
    xlsx[f'xl/worksheets/sheet{i}.xml'] = f'''<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:B3"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="32" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>{text}</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Quantity</t></is></c><c r="B2"><v>42</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>합성 검증 자료</t></is></c></row></sheetData></worksheet>'''
write('xlsx', xlsx, [('xl/workbook.xml', 'spreadsheetml.sheet.main')] + [(f'xl/worksheets/sheet{i}.xml', 'spreadsheetml.worksheet') for i in [1, 2]])
print('Synthetic DOCX/PPTX/XLSX fixtures written to .runtime/preview-fixtures')
