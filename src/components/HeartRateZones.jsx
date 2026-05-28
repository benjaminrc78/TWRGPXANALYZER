import React from 'react';

// Format seconds to HH:MM:SS or MM:SS
function formatZoneTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

export default function HeartRateZones({ points = [], stats = {}, config }) {
  const z1Max = config?.hrZones?.z1Max ?? 124;
  const z2Max = config?.hrZones?.z2Max ?? 145;
  const z3Max = config?.hrZones?.z3Max ?? 158;
  const z4Max = config?.hrZones?.z4Max ?? 170;
  // Check if there are valid HR points
  const hasHr = points.some(p => p.hr && p.hr > 0);

  if (!hasHr) {
    return (
      <div className="glass-card">
        <h3 className="hr-zones-title" style={{ marginBottom: '16px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          Zonas de Pulso
        </h3>
        <div className="zone-no-hr-message">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
          <p>No se encontraron datos de Ritmo Cardíaco (HR) en este archivo GPX.</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '300px' }}>
            Asegúrate de registrar tus entrenamientos usando una banda de pecho o reloj con sensor de pulso activo.
          </p>
        </div>
      </div>
    );
  }

  // Calculate times in zones based on personalized cardio zones (Z1 <125, Z2 125-145, Z3 146-158, Z4 159-170, Z5 >170)
  const zones = [
    { name: 'Z1 Recuperación', range: `< ${z1Max + 1} ppm`, colorClass: 'zone-1-bg', color: 'var(--zone-1)', desc: 'Recuperación activa y calentamiento.' },
    { name: 'Z2 Resistencia', range: `${z1Max + 1} - ${z2Max} ppm`, colorClass: 'zone-2-bg', color: 'var(--zone-2)', desc: 'Base aeróbica, quema de grasas y fondo.' },
    { name: 'Z3 Tempo', range: `${z2Max + 1} - ${z3Max} ppm`, colorClass: 'zone-3-bg', color: 'var(--zone-3)', desc: 'Ritmo alegre, potencia aeróbica media.' },
    { name: 'Z4 Umbral', range: `${z3Max + 1} - ${z4Max} ppm`, colorClass: 'zone-4-bg', color: 'var(--zone-4)', desc: 'Umbral de lactato, alta fatiga, velocidad.' },
    { name: 'Z5 Anaeróbico', range: `> ${z4Max} ppm`, colorClass: 'zone-5-bg', color: 'var(--zone-5)', desc: 'Capacidad anaeróbica pura, sprint, VO2 Max.' }
  ];

  const zoneTimes = [0, 0, 0, 0, 0];
  let totalHrSeconds = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (curr.hr && curr.hr > 0 && prev.time && curr.time) {
      const dTime = (new Date(curr.time).getTime() - new Date(prev.time).getTime()) / 1000;
      // Filter out huge device-pause time jumps
      if (dTime > 0 && dTime < 60) {
        const hr = curr.hr;
        if (hr <= z1Max) {
          zoneTimes[0] += dTime;
        } else if (hr <= z2Max) {
          zoneTimes[1] += dTime;
        } else if (hr <= z3Max) {
          zoneTimes[2] += dTime;
        } else if (hr <= z4Max) {
          zoneTimes[3] += dTime;
        } else {
          zoneTimes[4] += dTime;
        }
        totalHrSeconds += dTime;
      }
    }
  }

  // Fallback: If time calculation gives 0 (e.g., missing timestamps), attribute 1s per point
  if (totalHrSeconds === 0) {
    points.forEach(pt => {
      if (pt.hr && pt.hr > 0) {
        const hr = pt.hr;
        if (hr <= z1Max) {
          zoneTimes[0]++;
        } else if (hr <= z2Max) {
          zoneTimes[1]++;
        } else if (hr <= z3Max) {
          zoneTimes[2]++;
        } else if (hr <= z4Max) {
          zoneTimes[3]++;
        } else {
          zoneTimes[4]++;
        }
        totalHrSeconds++;
      }
    });
  }

  // Get index of dominant zone
  let maxZoneIdx = 0;
  let maxZoneVal = 0;
  zoneTimes.forEach((time, idx) => {
    if (time > maxZoneVal) {
      maxZoneVal = time;
      maxZoneIdx = idx;
    }
  });

  // Dynamic analysis text
  const analysisTexts = [
    'Entrenamiento de Recuperación Activa. Excelente rodaje suave ideal para desintoxicar las piernas, promover el flujo sanguíneo y asimilar cargas de días duros previas sin generar fatiga adicional.',
    'Entrenamiento de Resistencia de Base (Zona de Fondo). Este es el motor del ciclista. Rodar en esta zona mejora drásticamente la capilarización muscular, la eficiencia mitocondrial y optimiza la quema de grasas como combustible principal. ¡Gran trabajo de base!',
    'Entrenamiento de Tempo Aeróbico. Un ritmo alegre y retador que mejora tu potencia aeróbica media. Enseña a tu cuerpo a reciclar el lactato a velocidades moderadas, preparándote para mantener ritmos rápidos en grupeta.',
    'Entrenamiento de Umbral de Lactato (Sweet Spot). Rodaje exigente que requiere mucha concentración mental. Trabajar aquí incrementa de manera óptima tu potencia al umbral funcional (FTP), elevando tu velocidad de crucero antes de acumular ácido láctico en las piernas.',
    'Sesión de Alta Intensidad (Capacidad Anaeróbica / VO2 Max). Entrenamiento sumamente extenuante. Pasar tiempo en esta zona estimula el volumen máximo de oxígeno que tu corazón y pulmones pueden procesar. Aumenta tu explosividad para repechos cortos, sprints y demarrajes.'
  ];

  const trainingTips = [
    'Utiliza esta zona al día siguiente de entrenamientos intensos. Mantén una cadencia alegre (90+ rpm) para activar el flujo sanguíneo y acelerar la recuperación sin sobrecargar las fibras.',
    'Para mejorar tu resistencia fundamental, acumula sesiones largas (2 a 4 horas) de forma constante en esta zona. La disciplina aquí te permitirá rodar mucho más rápido a menor pulso a largo plazo.',
    'Limita estas sesiones a 1 o 2 veces por semana. Realiza intervalos continuos de 20-30 min en esta zona para entrenar a tu cuerpo a tolerar la acidez a ritmos de crucero alegres.',
    'Para elevar tu umbral funcional (FTP), realiza series estructuradas de 2x15 min o 3x10 min en esta zona, descansando 5 min entre ellas. Esta zona consume mucho glucógeno; cuida tu recarga post-entreno.',
    'Haz microintervalos explosivos (ej. 30s a tope / 30s recuperación suave) o repechos cortos de 2-3 min. Limítalo a 1 vez por semana, llegando muy descansado para rendir al máximo.'
  ];

  // Route Difficulty Score (0-100) based on distance and climbing
  const dist = stats.distanceKm || 0;
  const ele = stats.elevationGainM || 0;
  const difficultyScore = dist > 0 ? Math.min(100, Math.round((dist * 1.1 + ele * 0.12) / 1.3)) : 0;

  // Benjamin's Fitness Rating (0-100) based on Power (Watts) vs HR delta (average HR above resting)
  // Assuming a typical resting HR of 60 bpm for a 47-year-old cyclist
  const avgHr = stats.avgHr || 150;
  const avgWatts = stats.avgWatts || 170;
  const hrDelta = Math.max(30, avgHr - 60);
  const efficiency = hrDelta > 0 ? avgWatts / hrDelta : 0;
  
  // Map typical aerobic efficiency (1.2 to 2.4 W/bpm delta) to a 0-100 score
  let fitnessScore = Math.round((efficiency - 0.8) * 35 + 50);
  if (fitnessScore < 10) fitnessScore = 10;
  if (fitnessScore > 100) fitnessScore = 100;

  // Determine fitness category
  let fitnessCategory = 'Forma de Transición';
  let fitnessColor = 'var(--text-muted)';
  let fitnessDesc = 'Margen de mejora. Ideal para rodar suave en Z2 y consolidar tu motor aeróbico.';

  if (fitnessScore >= 88) {
    fitnessCategory = 'Excelente Forma (Avanzado / Élite)';
    fitnessColor = 'var(--zone-2)';
    fitnessDesc = '¡Estado excepcional! Tu ratio de vatios por pulsación es digno de un ciclista muy competitivo.';
  } else if (fitnessScore >= 74) {
    fitnessCategory = 'Buena Forma (Intermedio-Alto)';
    fitnessColor = 'var(--zone-1)';
    fitnessDesc = 'Forma física notable. Tienes un corazón eficiente y asimilas muy bien el ritmo de vatios.';
  } else if (fitnessScore >= 50) {
    fitnessCategory = 'Forma Aceptable (Intermedio)';
    fitnessColor = 'var(--zone-3)';
    fitnessDesc = 'Condición física moderada. En buen camino, tu base responde bien pero hay margen de optimización.';
  }

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', maxHeight: '450px' }}>
      <div className="hr-zones-header" style={{ marginBottom: '4px' }}>
        <h3 className="hr-zones-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
          Tus Zonas de Pulso
        </h3>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Peso: {config?.weight ?? 77} kg</span>
      </div>

      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '4px' }}>
        <div className="hr-zones-list">
          {zones.map((zone, idx) => {
            const time = zoneTimes[idx];
            const percent = totalHrSeconds > 0 ? (time / totalHrSeconds) * 100 : 0;

            return (
              <div className="zone-row" key={zone.name}>
                <div className="zone-header-row">
                  <div className="zone-name-box">
                    <div className={`zone-dot ${zone.colorClass}`} />
                    <span>{zone.name}</span>
                    <span className="zone-limits">{zone.range}</span>
                  </div>
                  <div className="zone-values">
                    <span className="zone-percent">{percent.toFixed(1)}%</span>
                    <span className="zone-duration">{formatZoneTime(time)}</span>
                  </div>
                </div>
                <div className="zone-progress-bg">
                  <div 
                    className={`zone-progress-fill ${zone.colorClass}`} 
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="zone-analysis-card" style={{ margin: 0 }}>
          <strong>Enfoque Fisiológico Dominante:</strong>
          <p style={{ marginTop: '4px', marginBottom: '8px', lineHeight: '1.4' }}>{analysisTexts[maxZoneIdx]}</p>
          <strong style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'block', paddingTop: '8px', marginTop: '4px' }}>
            💡 Consejo de Mejora Profesional:
          </strong>
          <p style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--strava-orange)', lineHeight: '1.4' }}>{trainingTips[maxZoneIdx]}</p>
        </div>

        {/* BENJAMIN'S DIFFICULTY & FITNESS SCORE MODULE */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Análisis de Nivel y Esfuerzo
          </h4>

          {/* Difficulty Score */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Dificultad de la Ruta:</span>
              <span style={{ fontWeight: 800, color: 'var(--strava-orange)' }}>{difficultyScore} / 100</span>
            </div>
            <div className="zone-progress-bg" style={{ height: '6px' }}>
              <div 
                className="zone-progress-fill" 
                style={{ 
                  width: `${difficultyScore}%`, 
                  backgroundColor: 'var(--strava-orange)',
                  boxShadow: '0 0 8px var(--strava-glow)' 
                }} 
              />
            </div>
          </div>

          {/* Fitness / Performance Rating */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Tu Puntuación de Forma:</span>
              <span style={{ fontWeight: 800, color: fitnessColor }}>{fitnessScore} / 100</span>
            </div>
            <div className="zone-progress-bg" style={{ height: '6px' }}>
              <div 
                className="zone-progress-fill" 
                style={{ 
                  width: `${fitnessScore}%`, 
                  backgroundColor: fitnessColor,
                  boxShadow: `0 0 8px ${fitnessColor}` 
                }} 
              />
            </div>
            <div style={{ marginTop: '8px', padding: '10px', background: 'rgba(0, 0, 0, 0.15)', borderRadius: '8px', fontSize: '10px', lineHeight: '1.4' }}>
              <strong style={{ color: fitnessColor, display: 'block', fontSize: '11px', marginBottom: '2px' }}>
                Estado: {fitnessCategory}
              </strong>
              <span style={{ color: 'var(--text-secondary)' }}>{fitnessDesc}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
