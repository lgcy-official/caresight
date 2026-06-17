'use client';

import { useEffect, useRef, useState } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { CARTO_DARK_STYLE, GLOBE_INITIAL_CENTER, GLOBE_ZOOM, GLOBE_SPIN_SPEED } from '@/lib/constants';
import type { GeoLocation } from './location-search';
import type { Camera, RiskLevel } from '@/lib/types';

const RISK_COLOR: Record<RiskLevel, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
};

export interface CameraContextMenu {
  x: number;
  y: number;
  cameraIds: string[];
}

interface Props {
  cameras: Camera[];
  selectedCameraId: string | null;
  selectedLocation: GeoLocation | null;
  onMapClick?: (location: GeoLocation) => void;
  onCameraClick?: (cameraId: string) => void;
  onCameraContextMenu?: (menu: CameraContextMenu | null) => void;
}

interface CameraFeatureProperties {
  id: string;
  name: string;
  address: string;
  riskLevel: RiskLevel;
  color: string;
  incidents: number;
  lastIncident: string;
  selected: number;
}

function fallbackPosition(lat: number, lng: number) {
  return {
    left: `${((lng + 180) / 360) * 100}%`,
    top: `${((90 - lat) / 180) * 100}%`,
  };
}

function GlobeFallback({
  visible,
  cameras,
  selectedLocation,
}: {
  visible: boolean;
  cameras: Camera[];
  selectedLocation: GeoLocation | null;
}) {
  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 grid place-items-center bg-gray-950 transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="relative h-[min(68vw,68vh)] min-h-80 w-[min(68vw,68vh)] min-w-80 overflow-hidden rounded-full border border-cyan-200/10 bg-slate-950 shadow-[0_0_90px_rgba(34,211,238,0.14)]">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_34%_28%,rgba(56,189,248,0.34),rgba(8,47,73,0.58)_34%,rgba(2,6,23,0.96)_72%)]" />
        <div className="absolute inset-[8%] rounded-full border border-cyan-200/10" />
        <div className="absolute inset-[17%] rounded-full border border-cyan-200/10" />
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-cyan-200/10" />
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-cyan-200/10" />
        <div className="absolute left-[13%] top-[28%] h-[22%] w-[28%] rounded-[52%_48%_46%_54%] bg-emerald-400/20 blur-[1px]" />
        <div className="absolute right-[18%] top-[20%] h-[28%] w-[22%] rounded-[45%_55%_56%_44%] bg-emerald-300/16 blur-[1px]" />
        <div className="absolute bottom-[18%] left-[42%] h-[22%] w-[20%] rounded-[42%_58%_49%_51%] bg-emerald-400/14 blur-[1px]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_72%_72%,transparent_0,rgba(2,6,23,0.66)_58%,rgba(2,6,23,0.96)_100%)]" />

        {selectedLocation && (
          <span
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-blue-400 shadow-[0_0_18px_rgba(96,165,250,0.9)]"
            style={fallbackPosition(selectedLocation.lat, selectedLocation.lng)}
          />
        )}

        {cameras.map((camera) => (
          <span
            key={camera.id}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/60 shadow-[0_0_14px_currentColor]"
            style={{
              ...fallbackPosition(camera.lat, camera.lng),
              backgroundColor: RISK_COLOR[camera.riskLevel],
              color: RISK_COLOR[camera.riskLevel],
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function SurveillanceMap({ cameras, selectedCameraId, selectedLocation, onMapClick, onCameraClick, onCameraContextMenu }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const spinFrameRef = useRef<number | null>(null);
  const isSpinningRef = useRef(true);
  const hasFitBoundsRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onCameraClickRef = useRef(onCameraClick);
  onCameraClickRef.current = onCameraClick;
  const onCameraContextMenuRef = useRef(onCameraContextMenu);
  onCameraContextMenuRef.current = onCameraContextMenu;

  // Build GeoJSON from cameras
  function buildGeoJSON(cams: Camera[], selectedId: string | null): FeatureCollection<Point, CameraFeatureProperties> {
    return {
      type: 'FeatureCollection' as const,
      features: cams.map((cam) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [cam.lng, cam.lat] },
        properties: {
          id: cam.id,
          name: cam.name,
          address: cam.address ?? '',
          riskLevel: cam.riskLevel,
          color: RISK_COLOR[cam.riskLevel],
          incidents: cam.incidentsLast24h ?? 0,
          lastIncident: cam.lastIncident ?? '-',
          selected: cam.id === selectedId ? 1 : 0,
        },
      })),
    };
  }

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    import('maplibre-gl').then(({ default: maplibregl }) => {
      setMapFailed(false);
      const map = new maplibregl.Map({
        container: containerRef.current!,
        style: CARTO_DARK_STYLE,
        center: GLOBE_INITIAL_CENTER,
        zoom: GLOBE_ZOOM,
        attributionControl: false,
      });

      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

      // Stop spin on user interaction
      const stopSpin = () => {
        isSpinningRef.current = false;
        if (spinFrameRef.current !== null) {
          cancelAnimationFrame(spinFrameRef.current);
          spinFrameRef.current = null;
        }
      };
      map.on('mousedown', stopSpin);
      map.on('touchstart', stopSpin);
      map.on('wheel', stopSpin);

      map.on('load', () => {
        map.setProjection({ type: 'globe' });
        // Start globe spin animation
        function spin() {
          if (!isSpinningRef.current) return;
          const center = map.getCenter();
          let lng = center.lng + GLOBE_SPIN_SPEED;
          if (lng > 180) lng -= 360;
          map.setCenter([lng, center.lat]);
          spinFrameRef.current = requestAnimationFrame(spin);
        }
        spinFrameRef.current = requestAnimationFrame(spin);
        // Add camera source + layers
        map.addSource('cameras', {
          type: 'geojson',
          data: buildGeoJSON([], null),
        });

        // Glow halo for critical
        map.addLayer({
          id: 'cameras-halo',
          type: 'circle',
          source: 'cameras',
          filter: ['==', ['get', 'riskLevel'], 'critical'],
          paint: {
            'circle-radius': 18,
            'circle-color': '#ef4444',
            'circle-opacity': 0.15,
            'circle-blur': 1,
          },
        });

        // Main dots
        map.addLayer({
          id: 'cameras-dot',
          type: 'circle',
          source: 'cameras',
          paint: {
            'circle-radius': [
              'case', ['==', ['get', 'selected'], 1], 11, 7,
            ],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.95,
            'circle-stroke-width': [
              'case', ['==', ['get', 'selected'], 1], 2.5, 1,
            ],
            'circle-stroke-color': [
              'case', ['==', ['get', 'selected'], 1], '#ffffff', 'rgba(255,255,255,0.25)',
            ],
          },
        });

        // Click on camera dot — if multiple overlap, cycle through them
        let lastClickedIds: string[] = [];
        let lastClickIndex = 0;

        map.on('click', 'cameras-dot', (e) => {
          if (!onCameraClickRef.current) return;
          const r = 30;
          const allAtPoint = map.queryRenderedFeatures(
            [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]],
            { layers: ['cameras-dot'] }
          );
          const ids = [
            ...new Set(
              allAtPoint
                .map((feature) => (feature.properties as CameraFeatureProperties | null)?.id)
                .filter((id): id is string => Boolean(id))
            ),
          ];

          if (ids.length <= 1) {
            onCameraClickRef.current(ids[0]);
            lastClickedIds = [];
            return;
          }

          // Cycle through overlapping cameras on repeated clicks
          const sameGroup = ids.length === lastClickedIds.length && ids.every((id) => lastClickedIds.includes(id));
          if (sameGroup) {
            lastClickIndex = (lastClickIndex + 1) % ids.length;
          } else {
            lastClickedIds = ids;
            lastClickIndex = 0;
          }
          onCameraClickRef.current(ids[lastClickIndex]);
        });

        // Right-click on camera dot — show context menu for overlapping cameras
        map.on('contextmenu', 'cameras-dot', (e) => {
          e.preventDefault();
          if (!onCameraContextMenuRef.current) return;
          const r = 30;
          const allAtPoint = map.queryRenderedFeatures(
            [[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]],
            { layers: ['cameras-dot'] }
          );
          const ids = [
            ...new Set(
              allAtPoint
                .map((feature) => (feature.properties as CameraFeatureProperties | null)?.id)
                .filter((id): id is string => Boolean(id))
            ),
          ];
          if (ids.length === 0) return;
          onCameraContextMenuRef.current({
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
            cameraIds: ids,
          });
        });

        // Dismiss context menu on regular click anywhere
        map.on('click', () => {
          onCameraContextMenuRef.current?.(null);
        });

        // Popup on hover — show all overlapping cameras at the same point
        const popup = new maplibregl.Popup({ closeButton: false, offset: 12, maxWidth: '260px' });

        map.on('mouseenter', 'cameras-dot', (e) => {
          map.getCanvas().style.cursor = 'pointer';
          const features = e.features;
          if (!features || features.length === 0) return;

          const coords = (features[0].geometry as Point).coordinates as [number, number];

          // Find all cameras at this exact point (overlapping)
          const allAtPoint = map.queryRenderedFeatures(e.point, { layers: ['cameras-dot'] });

          const seen = new Set<string>();
          const entries = allAtPoint
            .filter((f) => {
              const id = (f.properties as CameraFeatureProperties | null)?.id;
              if (!id) return false;
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            })
            .map((f) => {
              const p = f.properties as CameraFeatureProperties;
              return `<div style="padding:3px 0;${seen.size > 1 ? 'border-bottom:1px solid #eee;' : ''}">
                <strong>${p.name}</strong><br/>
                <span style="color:${p.color};font-weight:700;font-size:10px;text-transform:uppercase">${p.riskLevel}</span>
                <span style="color:#555;font-size:11px;margin-left:6px">${p.address}</span>
              </div>`;
            });

          popup.setLngLat(coords)
            .setHTML(`<div style="font-size:12px;color:#111;min-width:140px">${entries.join('')}</div>`)
            .addTo(map);
        });

        map.on('mouseleave', 'cameras-dot', () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
        });

        // Map click — reverse geocode
        map.on('click', async (e) => {
          // Don't fire if clicked a camera dot
          const features = map.queryRenderedFeatures(e.point, { layers: ['cameras-dot'] });
          if (features.length > 0) return;
          if (!onMapClickRef.current) return;
          const { lng, lat } = e.lngLat;
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
            );
            const data = (await res.json()) as { display_name?: string };
            const name = data.display_name
              ? data.display_name.split(',').slice(0, 2).join(',').trim()
              : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            onMapClickRef.current({ lat, lng, name });
          } catch {
            onMapClickRef.current({ lat, lng, name: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
          }
        });

        setMapReady(true);
      });

      mapRef.current = map;
    }).catch(() => setMapFailed(true));

    return () => {
      if (spinFrameRef.current !== null) cancelAnimationFrame(spinFrameRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // Update GeoJSON data whenever cameras or selection changes — no DOM markers, no lag
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const source = map.getSource('cameras');
      if (source && 'setData' in source) {
        (source as GeoJSONSource).setData(buildGeoJSON(cameras, selectedCameraId));
      }

      // Auto-fit bounds on first camera batch so pins are visible
      if (cameras.length > 0 && !hasFitBoundsRef.current) {
        hasFitBoundsRef.current = true;
        // Stop globe spin
        isSpinningRef.current = false;
        if (spinFrameRef.current !== null) {
          cancelAnimationFrame(spinFrameRef.current);
          spinFrameRef.current = null;
        }
        const [firstCamera, ...restCameras] = cameras;
        const bounds: [[number, number], [number, number]] = [
          [firstCamera.lng, firstCamera.lat],
          [firstCamera.lng, firstCamera.lat],
        ];
        restCameras.forEach((camera) => {
          bounds[0][0] = Math.min(bounds[0][0], camera.lng);
          bounds[0][1] = Math.min(bounds[0][1], camera.lat);
          bounds[1][0] = Math.max(bounds[1][0], camera.lng);
          bounds[1][1] = Math.max(bounds[1][1], camera.lat);
        });
        map.fitBounds(bounds, { padding: 60, maxZoom: 15 });
      }
    };
    if (map.loaded()) update();
    else map.on('load', update);
  }, [cameras, selectedCameraId]);

  // Fly to selected location — stop globe spin first
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedLocation) return;
    // Stop spinning
    isSpinningRef.current = false;
    if (spinFrameRef.current !== null) {
      cancelAnimationFrame(spinFrameRef.current);
      spinFrameRef.current = null;
    }
    map.flyTo({ center: [selectedLocation.lng, selectedLocation.lat], zoom: 14, speed: 1.6 });
  }, [selectedLocation, mapReady]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-950">
      <style>{`
        .maplibregl-popup-content {
          border-radius: 8px !important;
          padding: 10px 12px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
        }
        .maplibregl-ctrl-attrib { background: rgba(0,0,0,0.5) !important; color: #555 !important; font-size: 10px !important; }
        .maplibregl-ctrl-attrib a { color: #444 !important; }
        .maplibregl-ctrl-group { background: rgba(10,10,10,0.85) !important; border: 1px solid rgba(255,255,255,0.08) !important; }
        .maplibregl-ctrl-group button { background: transparent !important; color: #888 !important; }
        .maplibregl-ctrl-group button:hover { background: rgba(255,255,255,0.05) !important; }
      `}</style>
      <GlobeFallback visible={!mapReady || mapFailed} cameras={cameras} selectedLocation={selectedLocation} />
      <div
        ref={containerRef}
        className={`absolute inset-0 transition-opacity duration-500 ${mapReady && !mapFailed ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
