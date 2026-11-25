import fs from 'node:fs/promises';
import { zipSync, strToU8 } from '../node_modules/fflate/esm/index.mjs';

const source = '.tmp/Documentation_Egress_10class.html';
const output = 'Документация_Egress_регламент_10_клас.docx';
let html = await fs.readFile(source, 'utf8');
const headings = [
  ['1. Представяне на проекта', '4.1. Описание на софтуерния продукт'],
  ['2. Цел и задачи', '4.1.2 Цел и задачи'],
  ['3. Описание на софтуерния продукт', '4.1.3 Описание на софтуерния продукт'],
  ['4. Описание на програмата и използваните технологии', '4.2 Описание на програмата и използваните технологии'],
  ['5. Алгоритми и основни части от програмата', '4.3 Алгоритми и основни части от програмата'],
  ['6. Резултати и пример за работа', '4.4 Резултати и пример за работа'],
  ['7. Заключение и възможности за развитие', '4.5 Заключение и възможности за развитие'],
  ['8. Използвани източници', '4.6 Използвани източници'],
  ['9. Приложения и речник', '4.7 Приложения и речник'],
  ['2.1. Цел', '4.1.2.1 Цел'], ['2.2. Основни задачи', '4.1.2.2 Основни задачи'],
  ['2.3. Предназначение и потребители', '4.1.2.3 Предназначение и потребители'],
  ['3.1. Входни данни', '4.1.3.1 Входни данни'], ['3.2. Основни функции', '4.1.3.2 Основни функции'],
  ['3.3. Работа с приложението', '4.1.3.3 Работа с приложението'],
  ['3.4. Потребителски интерфейс и използваемост', '4.1.3.4 Потребителски интерфейс и използваемост'],
  ['4.1. Среда и технологии', '4.2.1 Среда и технологии'],
  ['4.2. Платформа, файлове и съхранение', '4.2.2 Платформа, файлове и съхранение'],
  ['4.3. Структура на проекта', '4.2.3 Структура на проекта'],
  ['5.1. Представяне на сградата', '4.3.1 Представяне на сградата'],
  ['5.2. Намиране на маршрут', '4.3.2 Намиране на маршрут'],
  ['5.3. Движение на хората', '4.3.3 Движение на хората'],
  ['5.4. Модели на бедствията', '4.3.4 Модели на бедствията'],
  ['5.5. Псевдокод на едно пускане', '4.3.5 Псевдокод на едно пускане'],
  ['6.1. Какво показва програмата', '4.4.1 Какво показва програмата'],
  ['6.2. Работа с демонстрационния проект', '4.4.2 Работа с демонстрационния проект'],
  ['6.3. Примерен входен материал', '4.4.3 Примерен входен материал'],
  ['6.4. Интерпретация и ограничения на резултатите', '4.4.4 Интерпретация и ограничения на резултатите'],
];
for (const [a, b] of headings) html = html.replaceAll(a, b);

const escapeXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decode = s => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const run = (text, bold = false) => `<w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const para = (text, style = 'Normal', align = '') => `<w:p><w:pPr>${style !== 'Normal' ? `<w:pStyle w:val="${style}"/>` : ''}${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${run(text)}</w:p>`;
const cover = [
  para('УЧЕНИЧЕСКИ ПРОЕКТ ПО ИНФОРМАЦИОННИ ТЕХНОЛОГИИ', 'Normal', 'center'),
  para('EGRESS', 'Title', 'center'),
  para('Уеб приложение за симулиране на евакуация при бедствия', 'Subtitle', 'center'),
  para('Документация на проект за X клас', 'Heading1', 'center'),
  para('Училище: __________________________________________________', 'Normal', 'center'),
  para('Изготвил/и: ______________________________________________', 'Normal', 'center'),
  para('Клас: X клас        Ръководител: __________________________', 'Normal', 'center'),
  para('2026 г.', 'Normal', 'center'),
  '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
].join('');

function makeTable(inner) {
  const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
  const cellsByRow = rows.map(row => [...row.matchAll(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi)]);
  const columns = Math.max(1, ...cellsByRow.map(row => row.length));
  const colWidth = Math.floor(9000 / columns);
  const trXml = cellsByRow.map(cells => `<w:tr>${cells.map(c => `<w:tc><w:tcPr><w:tcW w:w="${colWidth}" w:type="dxa"/>${c[1].toLowerCase() === 'th' ? '<w:shd w:fill="E7EEF4"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:after="60" w:line="300" w:lineRule="auto"/></w:pPr>${run(decode(c[2]), c[1].toLowerCase() === 'th')}</w:p></w:tc>`).join('')}</w:tr>`).join('');
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${colWidth}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="8795A1"/><w:left w:val="single" w:sz="4" w:color="8795A1"/><w:bottom w:val="single" w:sz="4" w:color="8795A1"/><w:right w:val="single" w:sz="4" w:color="8795A1"/><w:insideH w:val="single" w:sz="4" w:color="8795A1"/><w:insideV w:val="single" w:sz="4" w:color="8795A1"/></w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:start w:w="100" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${trXml}</w:tbl>`;
}

function imageParagraph() {
  const cx = 5486400, cy = Math.round(cx * 1400 / 2000);
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Примерна евакуационна схема"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="evakuatsionna-shema-primer.jpg"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const start = html.indexOf('<h1>Тема на проекта</h1>');
const end = html.indexOf('</body>', start);
const contentHtml = html.slice(start, end);
const blocks = [...contentHtml.matchAll(/<(h1|h2|h3|p|table|pre|ol|ul)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi)];
let content = '';
for (const m of blocks) {
  const tag = m[1].toLowerCase(), inner = m[2];
  if (tag === 'h1') content += para(decode(inner), 'Heading1');
  else if (tag === 'h2') content += para(decode(inner), 'Heading2');
  else if (tag === 'h3') content += para(decode(inner), 'Heading3');
  else if (tag === 'table') content += makeTable(inner);
  else if (tag === 'ol' || tag === 'ul') {
    const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
    items.forEach((item, i) => content += para(`${tag === 'ol' ? `${i + 1}.` : '•'} ${decode(item[1])}`));
  } else if (tag === 'pre') content += `<w:p><w:pPr><w:shd w:fill="F1F4F6"/><w:spacing w:before="80" w:after="120"/></w:pPr>${run(decode(inner))}</w:p>`;
  else if (tag === 'p' && inner.includes('<img')) content += imageParagraph();
  else {
    const text = decode(inner);
    if (text) content += para(text, 'Normal', /text-align:center/i.test(m[0]) ? 'center' : '');
  }
}

const sectPr = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1417" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
const documentXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>',
  cover, content, sectPr, '</w:body></w:document>',
].join('');
const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="bg-BG"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="24364B"/><w:sz w:val="36"/></w:rPr><w:pPr><w:jc w:val="center"/><w:spacing w:before="600" w:after="300"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="315C79"/><w:sz w:val="28"/></w:rPr><w:pPr><w:jc w:val="center"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120" w:line="360" w:lineRule="auto"/></w:pPr><w:rPr><w:b/><w:color w:val="24364B"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="90"/></w:pPr><w:rPr><w:b/><w:color w:val="315C79"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>';
const jpg = await fs.readFile('api/test/evakuatsionna-shema-primer.jpg');
const files = {
  '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': strToU8(documentXml),
  'word/styles.xml': strToU8(styles),
  'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/evakuatsionna-shema-primer.jpg"/></Relationships>'),
  'word/media/evakuatsionna-shema-primer.jpg': jpg,
};
await fs.writeFile(output, zipSync(files, { level: 6 }));
console.log(JSON.stringify({ output, bytes: (await fs.stat(output)).size, documentStarts: (documentXml.match(/<w:document\b/g) ?? []).length, blocks: blocks.length }));
