const maxBytes = 50 * 1024 * 1024;
const text = value => String(value ?? '').trim();
const field = (object, snake, camel) => object[snake] ?? object[camel];

export async function importNest(file) {
  if (!/\.nest$/i.test(file.name)) throw new Error('请选择 .nest 文件');
  if (file.size > maxBytes) throw new Error('单个 Nest 文件不能超过 50 MiB');
  let nest;
  try {
    nest = JSON.parse(await file.text());
  } catch {
    throw new Error('文件不是有效的 Nest JSON');
  }
  if (!nest?.profile || !Array.isArray(nest.parts) || !nest.parts.length ||
      nest.parts.some(part => !part || typeof part !== 'object')) {
    throw new Error('Nest 缺少型材或零件数据');
  }
  const groups = new Map();
  for (const part of nest.parts) {
    const shipNo = text(field(part, 'project_number', 'projectNumber')) || '未识别船号';
    const blockNo = text(field(part, 'segment_number', 'segmentNumber')) || '未识别分段号';
    groups.set(JSON.stringify([shipNo, blockNo]), { shipNo, blockNo });
  }
  const serialNo = text(field(nest, 'serial_number', 'serialNumber')) || file.name.slice(0, -5);
  const dimension = text(nest.profile.dimension) || '未识别型材';
  let drawingData = nest;
  let unfoldedSvg;
  let drawingError;
  let drawnBounds = [];
  try {
    const response = await fetch('/preview/nest-drawing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nest),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || '请通过 preview.py 启动本地预览');
    const { buildSvg, drawingBounds, drawingFromNest } = await import('/preview/drawing-core.mjs');
    const drawing = drawingFromNest(result);
    const svg = buildSvg(drawing);
    drawnBounds = drawing.parts.map((_, index) => drawingBounds(drawing, index));
    unfoldedSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    drawingData = result;
  } catch (error) {
    drawingError = error.message;
  }
  const profile = drawingData.profile;
  const rawLength = Number(field(profile, 'raw_length', 'rawLength')) || 0;
  const usedLength = Number(field(profile, 'used_length', 'usedLength')) || 0;
  const flangeHeight = (Number(field(profile, 'web_height', 'webHeight')) || 0) +
    (Number(field(profile, 'flange_width', 'flangeWidth')) || 0);
  const drawnIndexes = new Map(drawingData.parts.flatMap((part, index) => part.id ? [[part.id, index]] : []));
  return [...groups.values()].map(({ shipNo, blockNo }) => {
    const id = 'import:' + JSON.stringify([shipNo, blockNo, serialNo, dimension]);
    return {
      id, serialNo, nestType: 'NEST', craftParseStatus: drawingError ? 3 : 2, planStatus: 0,
      nestDto: {
        serialNo, shipNo, blockNo, quality: nest.quality, importedNest: true, unfoldedSvg, drawingError,
        profile: { dimension, rawLength, usedLength, flangeHeight, restLength: Math.max(0, rawLength - usedLength) },
        parts: nest.parts.map((part, index) => {
          const serialNo = text(field(part, 'serial_number', 'serialNumber'));
          const candidate = drawingData.parts[index];
          const drawnIndex = drawnIndexes.get(part.id) ??
            (candidate && text(field(candidate, 'serial_number', 'serialNumber')) === serialNo ? index : undefined);
          const bounds = drawnBounds[drawnIndex];
          return {
            id: id + '#' + index,
            index: index + 1,
            serialNo,
            blockName: text(field(part, 'segment_number', 'segmentNumber')) || blockNo,
            start: bounds?.minX,
            end: bounds?.maxX,
            length: Number(part.length) || 0,
            quantity: part.quantity ?? 1,
            workingLocation: part.workingLocation ?? part.working_lacation,
            macros: [],
          };
        }),
      },
    };
  });
}
