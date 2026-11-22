// Build a millimetre-scaled orthographic preview from the current parsed model.
export function partPreviewDrawing(part, project, curves) {
  const vertices = project?.workpiece?.mesh?.vertices ?? [];
  const length = Number(part.length) || 1;
  const axes = vertices.length ? {
    ...vertices.reduce((bounds, point) => ({
      minX: Math.min(bounds.minX, point.x || 0), maxX: Math.max(bounds.maxX, point.x || 0),
      minY: Math.min(bounds.minY, point.y || 0), maxY: Math.max(bounds.maxY, point.y || 0),
      minZ: Math.min(bounds.minZ, point.z || 0), maxZ: Math.max(bounds.maxZ, point.z || 0),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity }),
  } : { minX: 0, maxX: length, minY: 0, maxY: Number(part.profile?.webHeight) || 180, minZ: 0, maxZ: 0 };
  const axis = axes.maxY - axes.minY >= axes.maxZ - axes.minZ ? 'y' : 'z';
  const low = axis === 'y' ? axes.minY : axes.minZ;
  const high = axis === 'y' ? axes.maxY : axes.maxZ;
  const width = axes.maxX - axes.minX || length;
  const height = high - low || 180;
  const paths = [];
  if (curves) {
    curves.updateMatrixWorld(true);
    curves.traverse(node => {
      if (!node.isLine) return;
      const positions = node.geometry?.getAttribute('position');
      if (!positions?.count) return;
      const matrix = node.matrixWorld.elements;
      const points = [];
      for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
        const worldX = (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * 1000;
        const row = axis === 'y' ? 1 : 2;
        const cross = (matrix[row] * x + matrix[row + 4] * y + matrix[row + 8] * z + matrix[row + 12]) * 1000;
        points.push((index ? 'L' : 'M') + (worldX - axes.minX) + ',' + (high - cross));
      }
      paths.push('<path d="' + points.join(' ') + '"/>');
    });
  }
  const name = String(part.serialNumber || part.name || part.id || '').replace(/[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<text x="' + width / 2 + '" y="' + -width / 88 + '" text-anchor="middle" font-size="' + width / 88 + '" fill="#304b60">' + name + '</text>' +
    '<rect width="' + width + '" height="' + height + '" fill="#edf5fc" stroke="#8e9da9" vector-effect="non-scaling-stroke"/>' +
    '<g fill="none" stroke="#1769a5" stroke-width="1.5" vector-effect="non-scaling-stroke">' + paths.join('') + '</g></svg>';
  return {
    serialNo: part.serialNumber || part.name || part.id,
    unfoldedSvg: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    profile: { rawLength: width, flangeHeight: height, restLength: 0 },
    parts: [{ id: part.id, index: 1, start: 0, end: width, length: width }],
    projectionOnly: true,
    drawingNotice: vertices.length ? '2D 正投影' : '尺寸示意 · 尚无解析轮廓',
  };
}
