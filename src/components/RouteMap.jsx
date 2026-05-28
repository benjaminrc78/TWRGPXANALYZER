import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';

export default function RouteMap({ points = [], hoverPoint = null, activeClimb = null, onHoverPoint }) {
  const [mapMode, setMapMode] = useState('dark'); // 'dark' | 'terrain' | 'satellite' | 'hybrid'
  const [isExpanded, setIsExpanded] = useState(false);

  const mapContainerRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const tileLayerRef = useRef(null);
  const polylineRef = useRef(null);
  const climbPolylineRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const hoverMarkerRef = useRef(null);

  // 1. Initialize map container once on mount, and clean it up on unmount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    });

    setMapInstance(map);

    return () => {
      map.remove();
    };
  }, []);

  // 2. Handle dynamic tile layer swapping
  useEffect(() => {
    if (!mapInstance) return;

    if (tileLayerRef.current) {
      mapInstance.removeLayer(tileLayerRef.current);
    }

    let url = '';
    let attribution = '';
    let options = {
      maxZoom: 20
    };

    if (mapMode === 'dark') {
      url = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
      attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
    } else if (mapMode === 'satellite') {
      url = 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
      attribution = '&copy; Google Maps';
      options.subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    } else if (mapMode === 'hybrid') {
      url = 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}';
      attribution = '&copy; Google Maps';
      options.subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    } else if (mapMode === 'terrain') {
      url = 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}';
      attribution = '&copy; Google Maps';
      options.subdomains = ['mt0', 'mt1', 'mt2', 'mt3'];
    }

    options.attribution = attribution;

    tileLayerRef.current = L.tileLayer(url, options).addTo(mapInstance);
  }, [mapInstance, mapMode]);

  // 3. Handle Map size invalidation and bounds refitting on expansion toggle
  useEffect(() => {
    if (!mapInstance) return;

    const timer = setTimeout(() => {
      mapInstance.invalidateSize({ animate: true });
      
      // Re-fit bounds to active climb or entire route
      if (activeClimb && climbPolylineRef.current) {
        mapInstance.fitBounds(climbPolylineRef.current.getBounds(), {
          padding: [40, 40],
          maxZoom: 16,
          animate: true,
          duration: 0.5
        });
      } else if (polylineRef.current) {
        mapInstance.fitBounds(polylineRef.current.getBounds(), {
          padding: [20, 20],
          animate: true,
          duration: 0.5
        });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [mapInstance, isExpanded, activeClimb, points]);

  // 4. Handle ESC key to exit expanded view
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // 5. Draw path polyline, markers and attach event listeners
  useEffect(() => {
    if (!mapInstance || points.length === 0) return;

    // Clear existing layers if any
    if (polylineRef.current) mapInstance.removeLayer(polylineRef.current);
    if (startMarkerRef.current) mapInstance.removeLayer(startMarkerRef.current);
    if (endMarkerRef.current) mapInstance.removeLayer(endMarkerRef.current);
    if (hoverMarkerRef.current) mapInstance.removeLayer(hoverMarkerRef.current);

    // Extract coordinates
    const latLngs = points.map(pt => [pt.lat, pt.lon]);

    // Create and add polyline for track
    polylineRef.current = L.polyline(latLngs, {
      color: '#fc6100',
      weight: 4,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(mapInstance);

    // Fit map bounds to track
    mapInstance.fitBounds(polylineRef.current.getBounds(), { padding: [20, 20] });

    // Add Start (green) & End (red) markers
    const startPt = latLngs[0];
    const endPt = latLngs[latLngs.length - 1];

    startMarkerRef.current = L.circleMarker(startPt, {
      radius: 6,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(mapInstance).bindPopup('<b>Inicio de ruta</b>');

    endMarkerRef.current = L.circleMarker(endPt, {
      radius: 6,
      fillColor: '#ef4444',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1
    }).addTo(mapInstance).bindPopup('<b>Fin de ruta</b>');

    // Create hidden hover marker
    hoverMarkerRef.current = L.circleMarker([0, 0], {
      radius: 7,
      fillColor: '#00d2ff',
      color: '#ffffff',
      weight: 2.5,
      fillOpacity: 1,
      className: 'map-pulse-marker'
    });

    // Add mousemove handler to map for bidirectional synchronization
    mapInstance.off('mousemove');
    mapInstance.off('mouseout');
    
    mapInstance.on('mousemove', (e) => {
      if (points.length === 0) return;
      const latlng = e.latlng;
      let minD = Infinity;
      let closestPt = null;
      
      for (const pt of points) {
        const d = Math.pow(pt.lat - latlng.lat, 2) + Math.pow(pt.lon - latlng.lng, 2);
        if (d < minD) {
          minD = d;
          closestPt = pt;
        }
      }
      
      // Threshold: mouse must be relatively close to the track (~350m)
      if (minD < 0.0001 && closestPt && onHoverPoint) {
        onHoverPoint({ 
          lat: closestPt.lat, 
          lon: closestPt.lon, 
          distance: closestPt.distance, 
          index: closestPt.index 
        });
      } else if (minD >= 0.0001) {
        if (onHoverPoint) onHoverPoint(null);
      }
    });

    mapInstance.on('mouseout', () => {
      if (onHoverPoint) {
        onHoverPoint(null);
      }
    });

    return () => {
      if (mapInstance) {
        mapInstance.off('mousemove');
        mapInstance.off('mouseout');
      }
    };
  }, [mapInstance, points, onHoverPoint]);

  // 6. Synchronized hover marker update
  useEffect(() => {
    const marker = hoverMarkerRef.current;

    if (!mapInstance || !marker) return;

    if (hoverPoint && hoverPoint.lat && hoverPoint.lon) {
      marker.setLatLng([hoverPoint.lat, hoverPoint.lon]);
      if (!mapInstance.hasLayer(marker)) {
        marker.addTo(mapInstance);
      }
    } else {
      if (mapInstance.hasLayer(marker)) {
        mapInstance.removeLayer(marker);
      }
    }
  }, [mapInstance, hoverPoint]);

  // 7. Synchronized climb highlight and smooth auto-zooming camera
  useEffect(() => {
    if (!mapInstance || points.length === 0) return;

    // Clear previous climb line if any
    if (climbPolylineRef.current) {
      mapInstance.removeLayer(climbPolylineRef.current);
      climbPolylineRef.current = null;
    }

    if (activeClimb) {
      const climbPoints = points.slice(activeClimb.startIndex, activeClimb.endIndex + 1);
      const climbLatLngs = climbPoints.map(pt => [pt.lat, pt.lon]);

      // Draw thick glowing crimson line for the climb segment
      climbPolylineRef.current = L.polyline(climbLatLngs, {
        color: '#ef4444',
        weight: 6,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(mapInstance);

      // Fit map view to climb with custom bounds padding and animations
      mapInstance.fitBounds(climbPolylineRef.current.getBounds(), {
        padding: [40, 40],
        maxZoom: 16,
        animate: true,
        duration: 0.8
      });
    } else {
      // Zoom back out to the entire route
      if (polylineRef.current) {
        mapInstance.fitBounds(polylineRef.current.getBounds(), {
          padding: [20, 20],
          animate: true,
          duration: 0.8
        });
      }
    }
  }, [mapInstance, activeClimb, points]);

  return (
    <div className={`glass-card map-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="map-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 className="map-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
            Mapa de la Ruta
          </h3>
          <span className="map-instruction-text" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Mueve el cursor sobre las gráficas para localizar puntos
          </span>
        </div>

        <div className="map-controls-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="map-modes-segmented">
            <button 
              className={`map-mode-btn ${mapMode === 'dark' ? 'active' : ''}`} 
              onClick={() => setMapMode('dark')}
              title="Mapa oscuro cyberpunk"
            >
              Oscuro
            </button>
            <button 
              className={`map-mode-btn ${mapMode === 'terrain' ? 'active' : ''}`} 
              onClick={() => setMapMode('terrain')}
              title="Mapa físico de relieve"
            >
              Relieve
            </button>
            <button 
              className={`map-mode-btn ${mapMode === 'satellite' ? 'active' : ''}`} 
              onClick={() => setMapMode('satellite')}
              title="Imagen satélite"
            >
              Satélite
            </button>
            <button 
              className={`map-mode-btn ${mapMode === 'hybrid' ? 'active' : ''}`} 
              onClick={() => setMapMode('hybrid')}
              title="Satélite con nombres y carreteras"
            >
              Híbrido
            </button>
          </div>

          <button 
            className="map-action-btn" 
            onClick={() => setIsExpanded(!isExpanded)} 
            title={isExpanded ? "Reducir tamaño del mapa (Esc)" : "Ampliar mapa a pantalla completa"}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--card-border)',
              borderRadius: '8px',
              padding: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'var(--transition)'
            }}
          >
            {isExpanded ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="10" y1="14" x2="3" y2="21"/></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            )}
          </button>
        </div>
      </div>
      <div ref={mapContainerRef} className="leaflet-map-wrapper" />
    </div>
  );
}
