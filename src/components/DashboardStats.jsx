import React from 'react';

// Format seconds into readable "Xh Ym Zs"
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

export default function DashboardStats({ stats = {} }) {
  const safeStats = stats || {};
  const {
    distanceKm = 0,
    movingTimeSec = 0,
    elevationGainM = 0,
    elevationLossM = 0,
    avgSpeedKmh = 0,
    maxSpeedKmh = 0,
    avgHr = null,
    maxHr = null,
    maxEle = 0,
    calories = 0,
    avgWatts = 0,
    maxWatts = 0,
    hasPowerMeter = false,
    avgCad = 0,
    maxCad = 0,
    hasCadenceSensor = false
  } = safeStats;

  return (
    <div className="telemetry-grid">
      {/* CARD 1: DISTANCIA */}
      <div className="telemetry-card">
        <div className="telemetry-icon-box tel-distance">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.9 2.9-2.9-2.9"/><path d="M12 12v6"/></svg>
        </div>
        <div className="telemetry-data">
          <div className="telemetry-val">{distanceKm} <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>km</span></div>
          <div className="telemetry-lbl">Distancia</div>
        </div>
      </div>

      {/* CARD 2: TIEMPO EN MOVIMIENTO */}
      <div className="telemetry-card">
        <div className="telemetry-icon-box tel-time">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div className="telemetry-data">
          <div className="telemetry-val" style={{ fontSize: '18px' }}>{formatDuration(movingTimeSec)}</div>
          <div className="telemetry-lbl">Tiempo en Mov.</div>
        </div>
      </div>

      {/* CARD 3: VELOCIDAD (Med / Máx) */}
      <div className="telemetry-card">
        <div className="telemetry-icon-box tel-speed">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
        </div>
        <div className="telemetry-data">
          <div className="telemetry-val" style={{ fontSize: '18px', display: 'flex', gap: '6px', alignItems: 'baseline' }}>
            <span style={{ fontWeight: 800 }}>{avgSpeedKmh}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>{maxSpeedKmh}</span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>km/h</span>
          </div>
          <div className="telemetry-lbl">Velocidad (Med / Máx)</div>
        </div>
      </div>

      {/* CARD 4: ALTIMETRÍA (Positivo / Negativo) */}
      <div className="telemetry-card">
        <div className="telemetry-icon-box tel-elevation">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4-4 4 4 4-4 6 6"/><path d="M3 8h18v1"/></svg>
        </div>
        <div className="telemetry-data">
          <div className="telemetry-val" style={{ fontSize: '18px', display: 'flex', gap: '6px', alignItems: 'baseline' }}>
            <span style={{ color: 'var(--strava-orange)', fontWeight: 800 }}>+{elevationGainM}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/</span>
            <span style={{ color: '#3b82f6', fontWeight: 800 }}>-{elevationLossM}</span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>m</span>
          </div>
          <div className="telemetry-lbl">Altimetría (+Desn / -Desn)</div>
        </div>
      </div>

      {/* CARD 5: CARDIO (Pulso Med/Máx & Calorías) */}
      {avgHr ? (
        <div className="telemetry-card">
          <div className="telemetry-icon-box tel-heart">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          </div>
          <div className="telemetry-data">
            <div className="telemetry-val" style={{ fontSize: '17px', display: 'flex', gap: '5px', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ color: '#ef4444', fontWeight: 800 }}>{avgHr}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>/</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}>{maxHr}</span>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginRight: '4px' }}>ppm</span>
              <span style={{ color: '#a78bfa', fontWeight: 700, fontSize: '13px' }}>{calories} kcal</span>
            </div>
            <div className="telemetry-lbl">Cardio (Med / Máx / Cal)</div>
          </div>
        </div>
      ) : (
        <div className="telemetry-card">
          <div className="telemetry-icon-box tel-elevation" style={{ background: 'rgba(163, 163, 163, 0.1)', color: '#a3a3a3' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4-4-4 4-4-4-6 6"/></svg>
          </div>
          <div className="telemetry-data">
            <div className="telemetry-val" style={{ fontSize: '18px', display: 'flex', gap: '6px', alignItems: 'baseline' }}>
              <span>{maxEle}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{calories} kcal</span>
            </div>
            <div className="telemetry-lbl">Alt. Máx / Calorías (Est.)</div>
          </div>
        </div>
      )}

      {/* CARD 6: RENDIMIENTO (Vatios Medios / Máximos Estimados) */}
      <div className="telemetry-card">
        <div className="telemetry-icon-box" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        </div>
        <div className="telemetry-data">
          <div className="telemetry-val" style={{ fontSize: '18px', display: 'flex', gap: '6px', alignItems: 'baseline' }}>
            <span style={{ color: '#eab308', fontWeight: 800 }}>{avgWatts}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>{maxWatts}</span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>W</span>
          </div>
          <div className="telemetry-lbl">{hasPowerMeter ? 'Potencia Med / Máx' : 'Potencia Med / Máx (Est.)'}</div>
        </div>
      </div>

      {/* CARD 7: CADENCIA (Pedaleo Med / Máx) */}
      <div className="telemetry-card">
        <div className="telemetry-icon-box" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
        </div>
        <div className="telemetry-data">
          <div className="telemetry-val" style={{ fontSize: '18px', display: 'flex', gap: '6px', alignItems: 'baseline' }}>
            <span style={{ color: '#10b981', fontWeight: 800 }}>{avgCad}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>{maxCad}</span>
            <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>rpm</span>
          </div>
          <div className="telemetry-lbl">{hasCadenceSensor ? 'Cadencia Med / Máx' : 'Cadencia Med / Máx (Est.)'}</div>
        </div>
      </div>
    </div>
  );
}

