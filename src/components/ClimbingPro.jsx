import React, { useRef } from 'react';

// Color definitions matching Garmin Climb Pro slope grades
function getGradeColor(grade) {
  if (grade <= 0) return '#64748b';  // Slate Gray (Flat / Downhill)
  if (grade <= 3) return '#10b981';  // Green (0% - 3%, Easy)
  if (grade <= 6) return '#eab308';  // Yellow (3% - 6%, Moderate)
  if (grade <= 9) return '#f97316';  // Orange (6% - 9%, Steep)
  if (grade <= 12) return '#ef4444'; // Red (9% - 12%, Very Steep)
  return '#a78bfa';                  // Purple (> 12%, Extreme)
}

function getGradeLabel(grade) {
  if (grade <= 0) return 'Llano/Bajada';
  if (grade <= 3) return 'Fácil';
  if (grade <= 6) return 'Moderado';
  if (grade <= 9) return 'Empinado';
  if (grade <= 12) return 'Muy Duro';
  return 'Extremo';
}

export default function ClimbingPro({ climb, points, hoverPoint, onClose, isLocked, onHoverPoint }) {
  if (!climb || !points || points.length === 0) return null;

  const climbPoints = points.slice(climb.startIndex, climb.endIndex + 1);
  if (climbPoints.length === 0) return null;

  const totalDist = climb.endKm - climb.startKm || 0.1;
  const minEle = Math.min(...climbPoints.map(p => p.ele));
  const maxEle = Math.max(...climbPoints.map(p => p.ele));
  const eleRange = maxEle - minEle || 10;

  // SVG configuration
  const width = 360;
  const height = 140;
  const paddingX = 15;
  const paddingY = 15;

  const getCoords = (pt) => {
    const x = paddingX + ((pt.distance - climb.startKm) / totalDist) * (width - 2 * paddingX);
    const y = height - paddingY - ((pt.ele - minEle) / eleRange) * (height - 2 * paddingY);
    return { x, y };
  };

  const coords = climbPoints.map(getCoords);
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height - paddingY} L ${coords[0].x} ${height - paddingY} Z`;

  // Hover detection inside this climb
  const hoverIdx = hoverPoint ? hoverPoint.index : -1;
  const isHoveringOnClimb = hoverIdx >= climb.startIndex && hoverIdx <= climb.endIndex;

  let hoverCoords = null;
  let distRemaining = climb.lengthKm;
  let eleRemaining = climb.eleGain;
  let currentSlope = climb.avgGrade;

  if (isHoveringOnClimb && hoverPoint) {
    hoverCoords = getCoords(hoverPoint);
    distRemaining = Math.max(0, climb.endKm - hoverPoint.distance);
    const endPt = climbPoints[climbPoints.length - 1];
    eleRemaining = Math.max(0, endPt.ele - hoverPoint.ele);
    currentSlope = hoverPoint.grade;
  }

  // Generate dynamic gradient stops for SVG stroke/fill
  const stops = climbPoints.map((pt, idx) => {
    const offset = ((pt.distance - climb.startKm) / totalDist) * 100;
    const color = getGradeColor(pt.grade);
    return (
      <stop key={idx} offset={`${offset}%`} stopColor={color} />
    );
  });

  const gradientId = `climb-grad-${climb.startIndex}`;

  const svgRef = useRef(null);

  const handleMouseMove = (e) => {
    if (!onHoverPoint || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;
    
    const clampedX = Math.max(paddingX, Math.min(width - paddingX, svgX));
    const pct = (clampedX - paddingX) / (width - 2 * paddingX);
    const hoverDistance = climb.startKm + pct * totalDist;
    
    let closestPt = null;
    let minD = Infinity;
    for (const pt of climbPoints) {
      const d = Math.abs(pt.distance - hoverDistance);
      if (d < minD) {
        minD = d;
        closestPt = pt;
      }
    }
    
    if (closestPt) {
      onHoverPoint({
        lat: closestPt.lat,
        lon: closestPt.lon,
        distance: closestPt.distance,
        index: closestPt.index,
        grade: closestPt.grade,
        ele: closestPt.ele
      });
    }
  };

  const handleMouseLeave = () => {
    if (onHoverPoint) {
      onHoverPoint(null);
    }
  };

  return (
    <div className="glass-card climb-pro-widget" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      padding: '20px',
      background: 'var(--climb-pro-bg)',
      border: '1px solid var(--climb-pro-border)',
      boxShadow: 'var(--shadow-lg)'
    }}>
      {/* Widget Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>⛰️</span>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
            Climb Pro: {climb.name}
          </h3>
          {isLocked && (
            <span style={{ fontSize: '10px', background: 'var(--strava-orange)', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Fijado
            </span>
          )}
        </div>
        <button 
          onClick={onClose} 
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'var(--transition)'
          }}
          className="modal-close"
          title="Volver a la lista de puertos"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Stats Header Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>Distancia</div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {climb.lengthKm.toFixed(2)} <span style={{ fontSize: '9px', fontWeight: 500 }}>km</span>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>Desnivel</div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            +{climb.eleGain} <span style={{ fontSize: '9px', fontWeight: 500 }}>m</span>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px', borderRadius: '8px', border: '1px solid var(--card-border)', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '2px' }}>Pend. Media</div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--strava-orange)', fontFamily: 'var(--font-display)' }}>
            {climb.avgGrade}%
          </div>
        </div>
      </div>

      {/* SVG Climb Profile Graph */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: '120px', position: 'relative' }}>
        <svg 
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`} 
          width="100%" 
          height="100%"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              {stops}
            </linearGradient>
          </defs>

          {/* Fill under elevation curve */}
          <path 
            d={areaPath} 
            fill={`url(#${gradientId})`} 
            fillOpacity="0.12" 
          />

          {/* Stroke elevation line */}
          <path 
            d={linePath} 
            fill="none" 
            stroke={`url(#${gradientId})`} 
            strokeWidth="3.5" 
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Axis lines */}
          <line 
            x1={paddingX} 
            y1={height - paddingY} 
            x2={width - paddingX} 
            y2={height - paddingY} 
            stroke="var(--card-border)" 
            strokeWidth="1" 
          />

          {/* Labels for Elev. range */}
          <text x={paddingX} y={paddingY + 6} fill="var(--text-muted)" fontSize="8" fontWeight="600">{maxEle.toFixed(0)}m</text>
          <text x={paddingX} y={height - paddingY - 4} fill="var(--text-muted)" fontSize="8" fontWeight="600">{minEle.toFixed(0)}m</text>

          {/* Labels for Dist. range */}
          <text x={paddingX} y={height - 2} fill="var(--text-muted)" fontSize="8" fontWeight="600">0 km</text>
          <text x={width - paddingX} y={height - 2} fill="var(--text-muted)" fontSize="8" fontWeight="600" textAnchor="end">{climb.lengthKm.toFixed(1)} km</text>

          {/* Hover indicator cursor */}
          {hoverCoords && (
            <>
              <line 
                x1={hoverCoords.x} 
                y1={paddingY} 
                x2={hoverCoords.x} 
                y2={height - paddingY} 
                stroke="var(--strava-orange)" 
                strokeWidth="1.5" 
                strokeDasharray="3,3" 
              />
              <circle 
                cx={hoverCoords.x} 
                cy={hoverCoords.y} 
                r="6" 
                fill={getGradeColor(currentSlope)} 
                stroke="var(--text-primary)" 
                strokeWidth="1.5" 
                style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}
              />
            </>
          )}
        </svg>
      </div>

      {/* Dynamic Hover Metrics Banner */}
      <div style={{
        marginTop: '14px',
        padding: '10px 12px',
        borderRadius: '10px',
        background: isHoveringOnClimb ? 'rgba(252, 97, 0, 0.08)' : 'rgba(255, 255, 255, 0.01)',
        border: isHoveringOnClimb ? '1px solid rgba(252, 97, 0, 0.2)' : '1px solid var(--card-border)',
        minHeight: '52px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        transition: 'var(--transition)'
      }}>
        {isHoveringOnClimb ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Restante</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {distRemaining.toFixed(2)} km <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>•</span> +{Math.round(eleRemaining)} m
              </span>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Pendiente</span>
              <span style={{ fontSize: '13px', fontWeight: 800, color: getGradeColor(currentSlope) }}>
                {currentSlope}% <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text-muted)' }}>({getGradeLabel(currentSlope)})</span>
              </span>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500, padding: '4px' }}>
            {isLocked 
              ? 'Mueve el cursor por la gráfica o el mapa para ver métricas de subida.' 
              : 'Coloca el cursor o haz clic en una subida para fijar la telemetría.'}
          </div>
        )}
      </div>
    </div>
  );
}
