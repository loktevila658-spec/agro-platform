'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
const baseStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#edf1e9' } }],
};
/** Base renderer only. Domain owners supply authorized layers in their own WP. */
export function GisMap() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let map: Map | undefined;
    let cancelled = false;
    setStatus('loading');
    void import('maplibre-gl').then(({ Map, NavigationControl, ScaleControl }) => {
      if (cancelled || !host.current) return;
      map = new Map({ container: host.current, style: baseStyle, center: [0, 0], zoom: 1, attributionControl: false });
      map.addControl(new NavigationControl({ visualizePitch: false }), 'top-right');
      map.addControl(new ScaleControl({ unit: 'metric' }));
      map.once('load', () => { if (!cancelled) setStatus('ready'); });
      map.on('error', () => { if (!cancelled) setStatus('error'); });
    }).catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; map?.remove(); };
  }, [attempt]);
  return <section className="gis-map-frame" aria-label="Карта" aria-busy={status === 'loading'}>
    <div ref={host} className="gis-map-canvas" />
    <div className="gis-map-message" role={status === 'error' ? 'alert' : 'status'}>
      {status === 'loading' && 'Загрузка карты…'}
      {status === 'ready' && 'Нет подключённых слоёв. Границы появятся после их проверки и публикации.'}
      {status === 'error' && <>Не удалось отобразить карту. Проверьте поддержку WebGL. <button onClick={() => setAttempt(value => value + 1)}>Повторить</button></>}
    </div>
  </section>;
}
