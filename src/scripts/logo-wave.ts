(function () {
  const SEGMENTS = 20;
  const AMPLITUDE = 90;
  const FREQ = 1;
  const SPEED = 4;

  type Pt = { x: number; y: number };

  function lerp(a: Pt, b: Pt, t: number): Pt {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function subdivide(p1: Pt, p2: Pt) {
    const pts: Pt[] = [];
    for (let i = 0; i <= SEGMENTS; i++) pts.push(lerp(p1, p2, i / SEGMENTS));
    return pts;
  }

  function waveY(x: number, time: number) {
    const norm = x / 2160;
    return Math.sin(norm * FREQ * Math.PI * 2 - time * SPEED) * AMPLITUDE * norm;
  }

  function applyWave(pts: Pt[], time: number, env: number) {
    return pts.map(p => ({ x: p.x, y: p.y + waveY(p.x, time) * env }));
  }

  function curvePath(pts: Pt[]) {
    let d = `${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 2] || pts[i - 1];
      const p1 = pts[i - 1];
      const p2 = pts[i];
      const p3 = pts[i + 1] || pts[i];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function render(topEl: SVGPathElement, botEl: SVGPathElement, time: number, envelope: number) {
    const topEdge = applyWave(subdivide({x:0,y:0}, {x:2160,y:0}), time, envelope);
    const topHyp = applyWave(subdivide({x:2160,y:0}, {x:0,y:699}), time, envelope);
    const botHyp = applyWave(subdivide({x:0,y:699}, {x:2160,y:1398}), time, envelope);
    const botEdge = applyWave(subdivide({x:2160,y:1398}, {x:0,y:1398}), time, envelope);

    const topCurve = [...topEdge, ...topHyp.slice(1)];
    const botCurve = [...botHyp, ...botEdge.slice(1)];

    topEl.setAttribute('d', `M0,699 L${curvePath(topCurve)} Z`);
    botEl.setAttribute('d', `M${curvePath(botCurve)} L0,1398 Z`);
  }

  document.querySelectorAll<SVGSVGElement>('.wave-logo').forEach(svg => {
    if (svg.dataset.waveInit) return;
    svg.dataset.waveInit = '1';

    const topEl = svg.querySelector<SVGPathElement>('.wave-top')!;
    const botEl = svg.querySelector<SVGPathElement>('.wave-bottom')!;
    if (!topEl || !botEl) return;

    let animId: number | null = null;
    let globalTime = 0;
    let lastTs = 0;
    let env = 0;
    let hovering = false;

    render(topEl, botEl, 0, 0);

    function animate(ts: number) {
      const dt = lastTs ? (ts - lastTs) / 1000 : 0;
      lastTs = ts;
      globalTime += dt;

      if (hovering) {
        env += (1 - env) * Math.min(1, dt * 3);
      } else {
        env *= Math.pow(0.05, dt);
      }

      if (!hovering && env < 0.005) {
        env = 0;
        render(topEl, botEl, 0, 0);
        animId = null;
        lastTs = 0;
        return;
      }

      render(topEl, botEl, globalTime, env);
      animId = requestAnimationFrame(animate);
    }

    const hoverTarget = svg.closest('a') || svg.closest('.footer__name') || svg;

    hoverTarget.addEventListener('mouseenter', () => {
      hovering = true;
      if (!animId) {
        lastTs = 0;
        animId = requestAnimationFrame(animate);
      }
    });

    hoverTarget.addEventListener('mouseleave', () => {
      hovering = false;
    });
  });
})();
