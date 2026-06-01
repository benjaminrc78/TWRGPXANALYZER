import React from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine, ReferenceDot } from 'recharts';

export default function ActivityCharts({ points = [], onHoverPoint, activeClimb = null, hoverPoint = null, hasPowerMeter = false, hasCadenceSensor = false }) {
  const safePoints = points || [];

  // Check if there is heart rate data
  const hasHr = safePoints.some(p => p.hr && p.hr > 0);

  // Downsample data for rendering performance in Recharts
  const chartPoints = React.useMemo(() => {
    const maxChartPoints = 800;
    const downsampleStep = Math.ceil(safePoints.length / maxChartPoints) || 1;
    const result = [];
    
    for (let i = 0; i < safePoints.length; i += downsampleStep) {
      result.push(safePoints[i]);
    }
    // Make sure the last point is always included to show final distance
    if (safePoints.length > 0 && result.length > 0 && result[result.length - 1].index !== safePoints[safePoints.length - 1].index) {
      result.push(safePoints[safePoints.length - 1]);
    }
    return result;
  }, [safePoints]);

  // Find the point closest to hoverPoint
  const hoveredData = React.useMemo(() => {
    if (!hoverPoint) return null;
    let closest = null;
    let minDist = Infinity;
    for (const p of chartPoints) {
      const diff = Math.abs(p.distance - hoverPoint.distance);
      if (diff < minDist) {
        minDist = diff;
        closest = p;
      }
    }
    return closest;
  }, [hoverPoint, chartPoints]);

  // Recharts mouse event handlers to synchronize Leaflet map
  const handleMouseMove = (e) => {
    if (e && e.activeTooltipIndex !== undefined && onHoverPoint) {
      const activePoint = chartPoints[e.activeTooltipIndex];
      if (activePoint) {
        onHoverPoint({ 
          lat: activePoint.lat, 
          lon: activePoint.lon, 
          distance: activePoint.distance, 
          index: activePoint.index 
        });
      }
    }
  };

  const handleMouseLeave = () => {
    if (onHoverPoint) {
      onHoverPoint(null);
    }
  };

  // Custom Tooltip component for Recharts
  const CustomTooltip = ({ active, payload, label, unit }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-chart-tooltip">
          <div className="tooltip-title">Progreso: {label} km</div>
          {payload.map((item, idx) => (
            <div className="tooltip-item" key={idx}>
              <span className="tooltip-lbl">{item.name}:</span>
              <span className="tooltip-val" style={{ color: item.color }}>
                {item.value} {unit}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Generate CSS linear-gradient string representing the heart rate zone at each point of the route
  const totalDistance = points.length > 0 ? points[points.length - 1].distance : 1;
  const sampleCount = Math.min(120, points.length);
  const step = Math.floor(points.length / sampleCount) || 1;
  const gradientStops = [];

  for (let i = 0; i < points.length; i += step) {
    const pt = points[i];
    const pct = totalDistance > 0 ? (pt.distance / totalDistance) * 100 : 0;
    
    let color = 'rgba(255, 255, 255, 0.05)'; // default gray for no HR
    if (pt.hr && pt.hr > 0) {
      const hr = pt.hr;
      if (hr < 125) color = 'var(--zone-1)';
      else if (hr <= 145) color = 'var(--zone-2)';
      else if (hr <= 158) color = 'var(--zone-3)';
      else if (hr <= 170) color = 'var(--zone-4)';
      else color = 'var(--zone-5)';
    }
    gradientStops.push(`${color} ${pct.toFixed(1)}%`);
  }

  // Add final stop at 100%
  if (points.length > 0) {
    const lastPt = points[points.length - 1];
    let color = 'rgba(255, 255, 255, 0.05)';
    if (lastPt.hr && lastPt.hr > 0) {
      const hr = lastPt.hr;
      if (hr < 125) color = 'var(--zone-1)';
      else if (hr <= 145) color = 'var(--zone-2)';
      else if (hr <= 158) color = 'var(--zone-3)';
      else if (hr <= 170) color = 'var(--zone-4)';
      else color = 'var(--zone-5)';
    }
    gradientStops.push(`${color} 100%`);
  }

  const gradientCss = `linear-gradient(to right, ${gradientStops.join(', ')})`;

  return (
    <div className="glass-card charts-card">
      <div className="charts-header">
        <h3 className="charts-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          Análisis de Telemetría Sincronizado
        </h3>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Eje Horizontal: Distancia (km)</span>
      </div>

      {/* Telemetry HUD Panel when map/chart is hovered */}
      {hoveredData && (
        <div className="telemetry-hud">
          <div className="hud-item">
            <span className="hud-lbl">Distancia</span>
            <span className="hud-val" style={{ color: '#00d2ff' }}>{hoveredData.distance.toFixed(2)} km</span>
          </div>
          <div className="hud-item">
            <span className="hud-lbl">Altitud</span>
            <span className="hud-val" style={{ color: 'var(--strava-orange)' }}>{hoveredData.ele} m</span>
          </div>
          <div className="hud-item">
            <span className="hud-lbl">Pendiente</span>
            <span className="hud-val" style={{ color: hoveredData.grade >= 0 ? '#10b981' : '#ef4444' }}>
              {hoveredData.grade}%
            </span>
          </div>
          {hasHr && hoveredData.hr && (
            <div className="hud-item">
              <span className="hud-lbl">Pulso</span>
              <span className="hud-val" style={{ color: 'var(--zone-5)' }}>{hoveredData.hr} ppm</span>
            </div>
          )}
          <div className="hud-item">
            <span className="hud-lbl">Velocidad</span>
            <span className="hud-val" style={{ color: 'var(--zone-3)' }}>{hoveredData.speed} km/h</span>
          </div>
          <div className="hud-item">
            <span className="hud-lbl">Potencia</span>
            <span className="hud-val" style={{ color: '#eab308' }}>{hoveredData.watts} W</span>
          </div>
          <div className="hud-item">
            <span className="hud-lbl">Cadencia</span>
            <span className="hud-val" style={{ color: '#10b981' }}>{hoveredData.cadence} rpm</span>
          </div>
        </div>
      )}

      {/* Dynamic Cardio Zone Strip at the top of the charts */}
      {hasHr && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginLeft: '45px', marginRight: '10px', marginBottom: '4px' }}>
            <span>Inicio de ruta (0 km)</span>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Línea de Zonas de Pulso (Z1 - Z5)</span>
            <span>Fin de ruta ({totalDistance} km)</span>
          </div>
          <div 
            style={{ 
              marginLeft: '45px', 
              marginRight: '10px', 
              height: '8px', 
              borderRadius: '4px', 
              background: gradientCss, 
              boxShadow: '0 0 10px rgba(252, 97, 0, 0.15)' 
            }} 
            title="Línea de zonas cardíacas del recorrido" 
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* CHART 1: ELEVACIÓN (Altitud) */}
        <div className="chart-item-box">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', paddingLeft: '45px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between', width: '100%', paddingRight: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: 'rgba(252, 97, 0, 0.7)', borderRadius: '2px' }} />
              Perfil de Elevación (m)
            </div>
            {hoveredData && (
              <span style={{ fontSize: '11px', color: '#00d2ff', fontWeight: 700 }}>
                {hoveredData.ele} m
              </span>
            )}
          </div>
          <div style={{ width: '100%', height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartPoints}
                syncId="cyclingTelemetry"
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  <linearGradient id="eleGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="rgba(252, 97, 0, 0.4)" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="rgba(252, 97, 0, 0)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="distance" height={0} tick={false} tickLine={false} axisLine={false} />
                <YAxis 
                  domain={['dataMin - 10', 'dataMax + 10']} 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip unit="m" />} />
                
                {/* Active Climb Reference Area Highlight */}
                {activeClimb && (
                  <ReferenceArea 
                    x1={activeClimb.startKm} 
                    x2={activeClimb.endKm} 
                    fill="rgba(239, 68, 68, 0.15)" 
                    stroke="rgba(239, 68, 68, 0.4)" 
                    strokeDasharray="3 3"
                  />
                )}

                {/* Bidirectional hover marker */}
                {hoverPoint && hoveredData && (
                  <ReferenceLine 
                    x={hoveredData.distance} 
                    stroke="#00d2ff" 
                    strokeWidth={1.5} 
                    strokeDasharray="4 3" 
                    isFront={true}
                  />
                )}

                {hoverPoint && hoveredData && (
                  <ReferenceDot 
                    x={hoveredData.distance} 
                    y={hoveredData.ele} 
                    r={5} 
                    fill="#00d2ff" 
                    stroke="#ffffff" 
                    strokeWidth={1.5} 
                    isFront={true} 
                  />
                )}

                <Area type="monotone" dataKey="ele" name="Elevación" stroke="var(--strava-orange)" strokeWidth={1.5} fillOpacity={1} fill="url(#eleGrad)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 2: FRECUENCIA CARDÍACA */}
        {hasHr && (
          <div className="chart-item-box">
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', paddingLeft: '45px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between', width: '100%', paddingRight: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', background: 'var(--zone-5)', borderRadius: '2px' }} />
                Frecuencia Cardíaca (ppm)
              </div>
              {hoveredData && hoveredData.hr && (
                <span style={{ fontSize: '11px', color: '#00d2ff', fontWeight: 700 }}>
                  {hoveredData.hr} ppm
                </span>
              )}
            </div>
            <div style={{ width: '100%', height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartPoints}
                  syncId="cyclingTelemetry"
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis dataKey="distance" height={0} tick={false} tickLine={false} axisLine={false} />
                  <YAxis 
                    domain={[50, 'dataMax + 5']} 
                    stroke="var(--text-muted)" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip content={<CustomTooltip unit="ppm" />} />

                  {/* Active Climb Reference Area Highlight */}
                  {activeClimb && (
                    <ReferenceArea 
                      x1={activeClimb.startKm} 
                      x2={activeClimb.endKm} 
                      fill="rgba(239, 68, 68, 0.15)" 
                      stroke="rgba(239, 68, 68, 0.4)" 
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Bidirectional hover marker */}
                  {hoverPoint && hoveredData && (
                    <ReferenceLine 
                      x={hoveredData.distance} 
                      stroke="#00d2ff" 
                      strokeWidth={1.5} 
                      strokeDasharray="4 3" 
                      isFront={true}
                    />
                  )}

                  {hoverPoint && hoveredData && hoveredData.hr && (
                    <ReferenceDot 
                      x={hoveredData.distance} 
                      y={hoveredData.hr} 
                      r={5} 
                      fill="#00d2ff" 
                      stroke="#ffffff" 
                      strokeWidth={1.5} 
                      isFront={true} 
                    />
                  )}

                  <Line type="monotone" dataKey="hr" name="Frecuencia Cardíaca" stroke="var(--zone-5)" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} connectNulls={true} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* CHART 3: VELOCIDAD */}
        <div className="chart-item-box">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', paddingLeft: '45px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between', width: '100%', paddingRight: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: 'var(--zone-3)', borderRadius: '2px' }} />
              Velocidad (km/h)
            </div>
            {hoveredData && (
              <span style={{ fontSize: '11px', color: '#00d2ff', fontWeight: 700 }}>
                {hoveredData.speed} km/h
              </span>
            )}
          </div>
          <div style={{ width: '100%', height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartPoints}
                syncId="cyclingTelemetry"
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="distance" height={0} tick={false} tickLine={false} axisLine={false} />
                <YAxis 
                  domain={[0, 'dataMax + 5']} 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip unit="km/h" />} />

                {/* Active Climb Reference Area Highlight */}
                {activeClimb && (
                  <ReferenceArea 
                    x1={activeClimb.startKm} 
                    x2={activeClimb.endKm} 
                    fill="rgba(239, 68, 68, 0.15)" 
                    stroke="rgba(239, 68, 68, 0.4)" 
                    strokeDasharray="3 3"
                  />
                )}

                {/* Bidirectional hover marker */}
                {hoverPoint && hoveredData && (
                  <ReferenceLine 
                    x={hoveredData.distance} 
                    stroke="#00d2ff" 
                    strokeWidth={1.5} 
                    strokeDasharray="4 3" 
                    isFront={true}
                  />
                )}

                {hoverPoint && hoveredData && (
                  <ReferenceDot 
                    x={hoveredData.distance} 
                    y={hoveredData.speed} 
                    r={5} 
                    fill="#00d2ff" 
                    stroke="#ffffff" 
                    strokeWidth={1.5} 
                    isFront={true} 
                  />
                )}

                <Line type="monotone" dataKey="speed" name="Velocidad" stroke="var(--zone-3)" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 4: POTENCIA */}
        <div className="chart-item-box">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', paddingLeft: '45px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between', width: '100%', paddingRight: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: '#eab308', borderRadius: '2px' }} />
              {hasPowerMeter ? 'Potencia de Potenciómetro (W)' : 'Potencia Estimada (W)'}
            </div>
            {hoveredData && (
              <span style={{ fontSize: '11px', color: '#00d2ff', fontWeight: 700 }}>
                {hoveredData.watts} W
              </span>
            )}
          </div>
          <div style={{ width: '100%', height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartPoints}
                syncId="cyclingTelemetry"
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="distance" height={0} tick={false} tickLine={false} axisLine={false} />
                <YAxis 
                  domain={[0, 'dataMax + 50']} 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip unit="W" />} />

                {/* Active Climb Reference Area Highlight */}
                {activeClimb && (
                  <ReferenceArea 
                    x1={activeClimb.startKm} 
                    x2={activeClimb.endKm} 
                    fill="rgba(239, 68, 68, 0.15)" 
                    stroke="rgba(239, 68, 68, 0.4)" 
                    strokeDasharray="3 3"
                  />
                )}

                {/* Bidirectional hover marker */}
                {hoverPoint && hoveredData && (
                  <ReferenceLine 
                    x={hoveredData.distance} 
                    stroke="#00d2ff" 
                    strokeWidth={1.5} 
                    strokeDasharray="4 3" 
                    isFront={true}
                  />
                )}

                {hoverPoint && hoveredData && (
                  <ReferenceDot 
                    x={hoveredData.distance} 
                    y={hoveredData.watts} 
                    r={5} 
                    fill="#00d2ff" 
                    stroke="#ffffff" 
                    strokeWidth={1.5} 
                    isFront={true} 
                  />
                )}

                <Line type="monotone" dataKey="watts" name="Potencia" stroke="#eab308" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CHART 5: CADENCIA */}
        <div className="chart-item-box">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', paddingLeft: '45px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between', width: '100%', paddingRight: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', background: '#10b981', borderRadius: '2px' }} />
              {hasCadenceSensor ? 'Cadencia de Sensor (rpm)' : 'Cadencia Estimada (rpm)'}
            </div>
            {hoveredData && (
              <span style={{ fontSize: '11px', color: '#00d2ff', fontWeight: 700 }}>
                {hoveredData.cadence} rpm
              </span>
            )}
          </div>
          <div style={{ width: '100%', height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartPoints}
                syncId="cyclingTelemetry"
                margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis 
                  dataKey="distance" 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickLine={false} 
                  dy={10}
                  hide={false}
                />
                <YAxis 
                  domain={[0, 120]} 
                  stroke="var(--text-muted)" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  width={40}
                />
                <Tooltip content={<CustomTooltip unit="rpm" />} />

                {/* Active Climb Reference Area Highlight */}
                {activeClimb && (
                  <ReferenceArea 
                    x1={activeClimb.startKm} 
                    x2={activeClimb.endKm} 
                    fill="rgba(239, 68, 68, 0.15)" 
                    stroke="rgba(239, 68, 68, 0.4)" 
                    strokeDasharray="3 3"
                  />
                )}

                {/* Bidirectional hover marker */}
                {hoverPoint && hoveredData && (
                  <ReferenceLine 
                    x={hoveredData.distance} 
                    stroke="#00d2ff" 
                    strokeWidth={1.5} 
                    strokeDasharray="4 3" 
                    isFront={true}
                  />
                )}

                {hoverPoint && hoveredData && (
                  <ReferenceDot 
                    x={hoveredData.distance} 
                    y={hoveredData.cadence} 
                    r={5} 
                    fill="#00d2ff" 
                    stroke="#ffffff" 
                    strokeWidth={1.5} 
                    isFront={true} 
                  />
                )}

                <Line type="monotone" dataKey="cadence" name="Cadencia" stroke="#10b981" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

