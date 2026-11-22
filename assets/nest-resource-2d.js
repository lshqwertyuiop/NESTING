const sheetWidth = 1000;
const sheetHeight = 300;
const drawingLeft = 60;
const drawingWidth = 880;
// Set to true to restore the blue dotted background.
const showDottedBackground = false;
const stockY = 138;
const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const mm = value => `${number.format(value)} mm`;
const measurementIcons = {
  distance: 'M4 8h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z M7 8v3 M12 8v4 M17 8v3',
  angle: 'M3 16a9 9 0 0 1 18 0v2H3z M8.5 16a3.5 3.5 0 0 1 7 0 M12 7v2 M5.6 9.6 7 11 M18.4 9.6 17 11',
};
const drawingElements = new Set(['g', 'rect', 'line', 'path', 'text']);
const drawingAttributes = new Set([
  'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linejoin',
  'stroke-linecap', 'font-size', 'font-family', 'text-anchor',
]);

function readDrawingElement(element) {
  if (!drawingElements.has(element.localName)) return null;
  const attrs = Object.fromEntries([...element.attributes]
    .filter(({ name, value }) => drawingAttributes.has(name) && !/url\s*\(/i.test(value))
    .map(({ name, value }) => [name, value]));
  if (attrs.stroke && attrs.stroke !== 'none') attrs['vector-effect'] = 'non-scaling-stroke';
  const children = element.localName === 'text'
    ? element.textContent
    : [...element.children].map(readDrawingElement).filter(Boolean);
  return { tag: element.localName, attrs, children };
}

export function createNestResourceView(h, ref, computed, watch, AntButton, resolveComponent) {
  return {
    props: ['nest', 'mode', 'allow3d'],
    emits: ['mode'],
    setup(props, { emit }) {
      const svg = ref();
      const zoom = ref(1);
      const origin = ref({ x: 0, y: props.nest.projectionOnly ? stockY - 45 : 0 });
      const sourceDrawing = ref();
      const sourceError = ref(false);
      const measureMode = ref('');
      const measurePoints = ref([]);
      let drag;
      let blockClick = false;

      const layout = computed(() => {
        const { profile, parts } = props.nest;
        let offset = profile.edgeDistance ?? 0;
        const items = [...parts].sort((a, b) => a.index - b.index).map(part => {
          const start = part.start ?? offset;
          const end = part.end ?? start + part.length;
          offset = end + (profile.partClearance ?? 0);
          return { ...part, start, end };
        });
        return { profile, items, restStart: profile.rawLength - profile.restLength };
      });
      const drawingHeight = computed(() => {
        const height = layout.value.profile.flangeHeight * drawingWidth / layout.value.profile.rawLength;
        return props.nest.projectionOnly ? height + 100 : Math.max(sheetHeight, stockY + height + 95);
      });

      function fit() {
        zoom.value = 1;
        origin.value = { x: 0, y: props.nest.projectionOnly ? stockY - 45 : 0 };
      }

      watch(() => props.nest.serialNo, () => {
        fit();
        setMeasure('');
      });
      watch(() => props.nest.unfoldedSvg, async (url, _previous, onCleanup) => {
        sourceDrawing.value = undefined;
        sourceError.value = false;
        if (!url) return;
        const controller = new AbortController();
        onCleanup(() => controller.abort());
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('SVG unavailable');
          const root = new DOMParser().parseFromString(await response.text(), 'image/svg+xml').documentElement;
          if (root.localName !== 'svg') throw new Error('Invalid SVG');
          if (!controller.signal.aborted) {
            sourceDrawing.value = [...root.children]
              .filter(element => element.localName !== 'text'
                || !/^母材\s+.*·\s*腹板\s+.*\+\s*面板\s+/u.test(element.textContent.trim()))
              .map(readDrawingElement).filter(Boolean);
          }
        } catch {
          if (!controller.signal.aborted) sourceError.value = true;
        }
      }, { immediate: true });

      function drawingPoint(event) {
        return new DOMPoint(event.clientX, event.clientY)
          .matrixTransform(svg.value.getScreenCTM().inverse());
      }

      function setMeasure(mode) {
        measureMode.value = mode;
        measurePoints.value = [];
      }

      const measureCount = computed(() => measureMode.value === 'angle' ? 3 : 2);
      const snapPoints = computed(() => {
        const { profile, items, restStart } = layout.value;
        const ratio = drawingWidth / profile.rawLength;
        const map = (x, y) => ({ x: drawingLeft + x * ratio, y: stockY + y * ratio });
        if (!props.nest.unfoldedSvg) {
          const offsets = [0, profile.rawLength, restStart, ...items.flatMap(part => [part.start, part.end])];
          return offsets.flatMap(x => [map(x, 0), map(x, profile.flangeHeight)]);
        }
        const points = [];
        function collect({ tag, attrs, children }) {
          if (tag === 'path') {
            for (const match of attrs.d?.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/g) ?? []) {
              points.push(map(Number(match[1]), Number(match[2])));
            }
          } else if (tag === 'line') {
            points.push(map(Number(attrs.x1), Number(attrs.y1)), map(Number(attrs.x2), Number(attrs.y2)));
          } else if (tag === 'rect') {
            const x = Number(attrs.x), y = Number(attrs.y);
            const right = x + Number(attrs.width), bottom = y + Number(attrs.height);
            points.push(map(x, y), map(right, y), map(x, bottom), map(right, bottom));
          }
          if (Array.isArray(children)) children.forEach(collect);
        }
        sourceDrawing.value?.forEach(collect);
        return points;
      });

      function measureAt(event) {
        if (!measureMode.value || blockClick) return;
        const point = drawingPoint(event);
        const scale = svg.value.getScreenCTM().a;
        let nearest = point;
        let threshold = 8 / scale;
        for (const candidate of snapPoints.value) {
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          if (distance < threshold) {
            threshold = distance;
            nearest = candidate;
          }
        }
        const points = measurePoints.value;
        if (points.length === measureCount.value) {
          measurePoints.value = [nearest];
          return;
        }
        const last = points.at(-1);
        if (!last || Math.hypot(last.x - nearest.x, last.y - nearest.y) > 0.001) {
          measurePoints.value = [...points, nearest];
        }
      }

      const measureStatus = computed(() => {
        const points = measurePoints.value;
        if (measureMode.value === 'distance') {
          if (points.length < 2) return points.length ? '测距 · 请选择终点' : '测距 · 请选择起点';
          const [start, end] = points;
          const distance = Math.hypot(end.x - start.x, end.y - start.y) * layout.value.profile.rawLength / drawingWidth;
          return `距离 ${mm(distance)}`;
        }
        if (points.length < 3) return ['测角 · 请选择起点', '测角 · 请选择顶点', '测角 · 请选择终点'][points.length];
        const [start, vertex, end] = points;
        const ax = start.x - vertex.x, ay = start.y - vertex.y;
        const bx = end.x - vertex.x, by = end.y - vertex.y;
        const angle = Math.atan2(Math.abs(ax * by - ay * bx), ax * bx + ay * by) * 180 / Math.PI;
        return `角度 ${number.format(angle)}°`;
      });

      function scaleBy(factor, anchor) {
        const current = zoom.value;
        const next = Math.max(1, Math.min(12, current * factor));
        if (next === 1) return fit();
        const { x, y } = origin.value;
        const point = anchor ?? { x: x + sheetWidth / (2 * current), y: y + drawingHeight.value / (2 * current) };
        origin.value = {
          x: point.x - (point.x - x) * current / next,
          y: point.y - (point.y - y) * current / next,
        };
        zoom.value = next;
      }

      function startPan(event) {
        blockClick = false;
        if (event.button !== 0 || zoom.value === 1) return;
        drag = {
          x: event.clientX, y: event.clientY, origin: origin.value,
          scale: svg.value.getScreenCTM().a,
        };
      }

      function pan(event) {
        if (!drag) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!blockClick && Math.hypot(dx, dy) < 4) return;
        blockClick = true;
        svg.value.setPointerCapture(event.pointerId);
        origin.value = { x: drag.origin.x - dx / drag.scale, y: drag.origin.y - dy / drag.scale };
      }

      function stopPan() { drag = undefined; }

      const line = (x1, y1, x2, y2, className) => h('line', { x1, y1, x2, y2, class: className });
      const label = (x, y, value, className) => h('text', { x, y, class: className }, value);
      const button = (title, action, attrs) => h('button', { type: 'button', onClick: action, ...attrs }, title);
      const toolbarButton = (title, action, attrs, icon) => h(AntButton, {
        size: 'small',
        type: icon ? 'text' : 'default',
        class: icon ? 'nest2d-measure-button' : undefined,
        onClick: action,
        ...attrs,
      }, icon ? {
        icon: () => h('svg', {
          width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
          'aria-hidden': 'true', focusable: 'false',
        }, [h('path', { d: measurementIcons[icon], transform: icon === 'distance' ? 'rotate(-30 12 12)' : undefined })]),
      } : { default: () => title });

      function partDimension(left, width, bottom, length, edge) {
        const right = left + width;
        const dimensionY = bottom + 22;
        const labelEdge = width < 80 ? edge : undefined;
        const labelX = labelEdge === 'left' ? left : labelEdge === 'right' ? right : left + width / 2;
        return [
          line(left, dimensionY, right, dimensionY, 'nest2d-dimension'),
          line(left, dimensionY - 4, left, dimensionY + 4, 'nest2d-dimension'),
          line(right, dimensionY - 4, right, dimensionY + 4, 'nest2d-dimension'),
          label(labelX, bottom + 15, mm(length), ['nest2d-length', labelEdge && `nest2d-length--${labelEdge}`]),
        ];
      }

      function stockDimension(left, right, bottom, length, prefix = '母材总长 ') {
        const y = bottom + 59;
        return [
          line(left, bottom + 31, left, y + 6, 'nest2d-extension'),
          line(right, bottom + 31, right, y + 6, 'nest2d-extension'),
          line(left, y, right, y, 'nest2d-dimension'),
          h('path', { d: `M ${left + 8} ${y - 4} L ${left} ${y} L ${left + 8} ${y + 4} M ${right - 8} ${y - 4} L ${right} ${y} L ${right - 8} ${y + 4}`, class: 'nest2d-dimension' }),
          label((left + right) / 2, y + 22, prefix + mm(length), 'nest2d-total'),
        ];
      }

      function measurementMarks() {
        const points = measurePoints.value;
        return h('g', { class: 'nest2d-measure-marks', 'aria-hidden': 'true' }, [
          ...points.slice(1).map((point, index) => line(points[index].x, points[index].y, point.x, point.y, 'nest2d-measure-line')),
          ...points.map(point => h('circle', { cx: point.x, cy: point.y, r: 4 / zoom.value })),
        ]);
      }

      function unfoldedDrawing(items) {
        // Scale the unfolded millimetre coordinates to the preview sheet.
        const { rawLength, flangeHeight, restLength } = layout.value.profile;
        const ratio = drawingWidth / rawLength;
        const x = value => drawingLeft + value * ratio;
        const y = value => stockY + value * ratio;
        if (!sourceDrawing.value) {
          return [label(sheetWidth / 2, stockY, sourceError.value ? '展开图加载失败' : '正在加载展开图')];
        }
        const renderElement = ({ tag, attrs, children }) => h(tag, attrs,
          Array.isArray(children) ? children.map(renderElement) : children);
        const gaps = [];
        function addGap(start, end, edge) {
          const length = end - start;
          // Omit gaps that would round to zero at the displayed precision.
          if (length >= 0.005) gaps.push(...partDimension(x(start), length * ratio, y(flangeHeight), length, edge));
          if (edge && restLength > 0 && Math.abs(length - restLength) < 0.005) {
            const mid = x((start + end) / 2);
            gaps.push(
              line(mid, stockY - 2, mid, stockY - 20, 'nest2d-extension'),
              label(mid, stockY - 31, '余料', 'nest2d-part-name'),
            );
          }
        }
        if (items.length) {
          const ordered = [...items].sort((a, b) => a.start - b.start);
          let occupiedEnd = 0;
          for (const part of ordered) {
            addGap(occupiedEnd, part.start, occupiedEnd === 0 ? 'left' : undefined);
            occupiedEnd = Math.max(occupiedEnd, part.end);
          }
          addGap(occupiedEnd, rawLength, 'right');
        }
        return [
          h('g', { class: 'nest2d-source', transform: `translate(${drawingLeft} ${stockY}) scale(${ratio})` },
            sourceDrawing.value.map(renderElement)),
          ...items.map(part => {
            const left = x(part.start);
            const width = (part.end - part.start) * ratio;
            return h('g', { key: part.id }, partDimension(left, width, y(flangeHeight), part.length));
          }),
          ...gaps,
          ...(!props.nest.projectionOnly ? stockDimension(x(0), x(rawLength), y(flangeHeight), rawLength, '') : []),
        ];
      }

      function drawing() {
        const { profile, items, restStart } = layout.value;
        const ratio = drawingWidth / profile.rawLength;
        const x = length => drawingLeft + length * ratio;
        const height = profile.flangeHeight * ratio;
        const bottom = stockY + height;
        const right = x(profile.rawLength);
        const hasRest = profile.restLength > 0;
        const restX = x(restStart);
        const restMid = (restX + right) / 2;

        const geometry = props.nest.unfoldedSvg ? unfoldedDrawing(items) : [
          h('defs', null, [h('pattern', {
            id: 'nest-resource-offcut', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(35)',
          }, [line(0, 0, 0, 6, 'nest2d-hatch')])]),
          line(drawingLeft - 12, stockY + height / 2, right + 12, stockY + height / 2, 'nest2d-axis'),
          h('rect', { x: drawingLeft, y: stockY, width: drawingWidth, height, class: 'nest2d-stock' }),
          ...items.map((part, index) => {
            const left = x(part.start);
            const width = part.length * ratio;
            const mid = left + width / 2;
            return h('g', { key: part.id, class: 'nest2d-part' }, [
              h('rect', { x: left, y: stockY, width, height, class: index % 2 ? 'alternate' : '' }),
              line(mid, stockY - 2, mid, stockY - 20, 'nest2d-extension'),
              label(mid, stockY - 31, part.serialNo, 'nest2d-part-name'),
              ...partDimension(left, width, bottom, part.length),
            ]);
          }),
          ...(hasRest ? [
            h('rect', { x: restX, y: stockY, width: right - restX, height, class: 'nest2d-offcut' }),
            h('path', { d: `M ${restMid} ${stockY} V 79 H ${right - 17}`, class: 'nest2d-extension' }),
            label(right - 20, 70, `余料 ${mm(profile.restLength)}`, 'nest2d-rest-label'),
          ] : []),
          ...stockDimension(drawingLeft, right, bottom, profile.rawLength),
        ];
        return h('svg', {
          ref: svg,
          class: { 'is-measuring': !!measureMode.value },
          viewBox: `${origin.value.x} ${origin.value.y} ${sheetWidth / zoom.value} ${drawingHeight.value / zoom.value}`,
          'aria-label': '等比例型材套料图',
          onClick: measureAt,
          onWheel: event => {
            event.preventDefault();
            scaleBy(event.deltaY < 0 ? 1.2 : 1 / 1.2, drawingPoint(event));
          },
          onPointerdown: startPan, onPointermove: pan, onPointerup: stopPan,
          onPointercancel: stopPan, onPointerleave: stopPan,
        }, [...geometry, measurementMarks()]);
      }

      return () => {
        const is2d = props.mode === '2d';
        const { drawingError, importedNest, unfoldedSvg } = props.nest;
        const toggleMeasure = mode => setMeasure(measureMode.value === mode ? '' : mode);
        const RadioGroup = resolveComponent('a-radio-group');
        const RadioButton = resolveComponent('a-radio-button');
        const compact = !!props.nest.projectionOnly;
        const measurementTools = is2d && !drawingError && h('div', { class: 'nest2d-tools nest2d-measure-tools', role: 'group', 'aria-label': '测量工具' }, [
              h('div', { class: 'nest2d-measure-buttons' }, [
                toolbarButton('测距', () => toggleMeasure('distance'), {
                  title: '测距', 'aria-label': '测量距离', 'aria-pressed': measureMode.value === 'distance',
                }, 'distance'),
                toolbarButton('测角', () => toggleMeasure('angle'), {
                  title: '测角', 'aria-label': '测量角度', 'aria-pressed': measureMode.value === 'angle',
                }, 'angle'),
              ]),
              measureMode.value && toolbarButton('清除', () => { measurePoints.value = []; }, { 'aria-label': '清除测量', disabled: !measurePoints.value.length }),
            ]);
        return h('section', {
          class: ['nest2d', { 'nest2d--3d': !is2d, 'nest2d--part': compact }], 'aria-label': '套料视窗',
          onKeydown: event => { if (event.key === 'Escape') setMeasure(''); },
        }, [
          h('header', { class: 'nest2d-toolbar' }, [
            h(RadioGroup, {
              class: 'nest2d-switch',
              value: props.mode,
              'aria-label': '视图模式',
              'onUpdate:value': mode => {
                if (mode === '3d') setMeasure('');
                emit('mode', mode);
              },
            }, { default: () => [
              h(RadioButton, { value: '2d' }, { default: () => '2D视图' }),
              h(RadioButton, {
                value: '3d',
                disabled: !props.allow3d && !!(importedNest || unfoldedSvg),
                title: !props.allow3d && (importedNest || unfoldedSvg) ? '此记录仅支持 2D 展开图' : undefined,
              }, { default: () => '3D视图' }),
            ] }),
            !compact && measurementTools,
            is2d && importedNest && unfoldedSvg && button('下载 SVG', () => {
              const link = document.createElement('a');
              link.href = unfoldedSvg;
              link.download = props.nest.serialNo + '-unfolded.svg';
              link.click();
            }),
          ]),
          is2d && h('div', { class: ['nest2d-stage', { 'nest2d-stage--dotted': showDottedBackground }] }, [
            drawingError
              ? h('div', { class: 'nest2d-drawing-error', role: 'alert' }, [
                h('strong', null, '展开图生成失败'),
                h('div', null, drawingError),
              ])
              : drawing(),
            !drawingError && (measureMode.value || (!compact && props.nest.drawingNotice)) && h('div', { class: 'nest2d-status', 'aria-live': 'polite' },
              measureMode.value ? measureStatus.value : props.nest.drawingNotice),
          ]),
          is2d && !drawingError && h('footer', { class: 'nest2d-footer' }, [
            h('div', { class: 'nest2d-tools', role: 'group', 'aria-label': '缩放控制' }, [
              button('−', () => scaleBy(1 / 1.25), { 'aria-label': '缩小', disabled: zoom.value === 1 }),
              button('＋', () => scaleBy(1.25), { 'aria-label': '放大', disabled: zoom.value === 12 }),
              button('适配', fit, { 'aria-label': '适配全图' }),
            ]),
            compact && measurementTools,
            h('span', null, `${Math.round(zoom.value * 100)}%`),
          ]),
        ]);
      };
    },
  };
}
