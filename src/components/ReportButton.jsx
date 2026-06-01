import React from 'react';
import { jsPDF } from 'jspdf';
import './ReportButton.css';

// Format date into Spanish friendly format
function formatDate(dateString) {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('es-ES', options);
}

// Format seconds into readable "Xh Ym Zs"
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);

  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  return `${m}m ${s}s`;
}

// Helper to draw a beautiful vector line/area chart directly into jsPDF
function drawVectorChart(pdf, x, y, width, height, points, valKey, label, strokeColor, isArea = false, fillColor = null, unit = '') {
  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(45, 55, 72);
  pdf.text(label, x, y - 3);

  // Background and borders of the chart container
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(226, 232, 240); // slate-200
  pdf.setLineWidth(0.35);
  pdf.rect(x, y, width, height, 'FD');

  if (!points || points.length === 0) return;

  // 1. Downsample points to keep the PDF lightweight and render quickly (max 150 points is perfect for A4 resolution)
  const maxSamples = 150;
  const step = Math.ceil(points.length / maxSamples) || 1;
  const sampledPoints = [];
  for (let i = 0; i < points.length; i += step) {
    sampledPoints.push(points[i]);
  }
  // Make sure the last point is always included
  if (points.length > 0 && sampledPoints[sampledPoints.length - 1].index !== points[points.length - 1].index) {
    sampledPoints.push(points[points.length - 1]);
  }

  // 2. Find min/max values for Y scaling
  const values = sampledPoints.map(p => p[valKey] || 0);
  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  if (minVal === maxVal) {
    minVal -= 1;
    maxVal += 1;
  }

  // Add 10% padding to top/bottom of Y axis for aesthetic breathing room
  const range = maxVal - minVal;
  const yMin = valKey === 'watts' || valKey === 'speed' ? Math.max(0, minVal - range * 0.05) : minVal - range * 0.05;
  const yMax = maxVal + range * 0.08;
  const yRange = yMax - yMin || 1;

  const xMin = sampledPoints[0].distance;
  const xMax = sampledPoints[sampledPoints.length - 1].distance;
  const xRange = xMax - xMin || 1;

  // 3. Gridlines (3 horizontal grid lines)
  pdf.setDrawColor(241, 245, 249); // slate-100 gridlines
  pdf.setLineWidth(0.2);
  const gridRows = 3;
  for (let i = 1; i < gridRows; i++) {
    const gy = y + (height / gridRows) * i;
    pdf.line(x, gy, x + width, gy);
  }

  // 4. Map data points to PDF coordinates
  const pdfCoords = sampledPoints.map(p => {
    const dist = p.distance;
    const val = p[valKey] || 0;
    const cx = x + ((dist - xMin) / xRange) * width;
    const cy = y + height - ((val - yMin) / yRange) * height;
    return { x: cx, y: cy };
  });

  // 5. Draw area fill under the curve if requested
  if (isArea && fillColor && pdfCoords.length > 1) {
    const polyPoints = [];
    // Start at bottom-left corner of the chart box
    polyPoints.push({ x: pdfCoords[0].x, y: y + height });
    pdfCoords.forEach(p => polyPoints.push(p));
    // End at bottom-right corner of the chart box
    polyPoints.push({ x: pdfCoords[pdfCoords.length - 1].x, y: y + height });

    pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    if (polyPoints.length > 0) {
      pdf.moveTo(polyPoints[0].x, polyPoints[0].y);
      for (let i = 1; i < polyPoints.length; i++) {
        pdf.lineTo(polyPoints[i].x, polyPoints[i].y);
      }
      pdf.close();
      pdf.fill();
    }
  }

  // 6. Draw chart path (the line itself)
  pdf.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2]);
  pdf.setLineWidth(0.45);
  for (let i = 1; i < pdfCoords.length; i++) {
    const p1 = pdfCoords[i - 1];
    const p2 = pdfCoords[i];
    pdf.line(p1.x, p1.y, p2.x, p2.y);
  }

  // 7. Y Axis labels (Max, Min, and Mid value)
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.setTextColor(113, 128, 150); // cool gray

  pdf.text(`${Math.round(yMax)} ${unit}`, x + 2, y + 4);
  pdf.text(`${Math.round(yMin)} ${unit}`, x + 2, y + height - 1.5);
  pdf.text(`${Math.round(yMin + yRange / 2)} ${unit}`, x + 2, y + height / 2 + 1.5);

  // 8. X Axis distance indicators
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6);
  pdf.text(`${xMin.toFixed(1)} km`, x, y + height + 3);
  pdf.text(`${xMax.toFixed(1)} km`, x + width - 10, y + height + 3);
}

/**
 * Botón que genera un informe PDF técnico, profesional y vectorizado en modo claro.
 * No utiliza capturas de pantalla, garantizando máxima nitidez de texto y tablas.
 */
export default function ReportButton({ activity, config }) {
  const handleGeneratePdf = () => {
    if (!activity) {
      alert('Selecciona una actividad para generar el informe PDF.');
      return;
    }

    try {
      const points = activity.points || [];
      const stats = activity.stats || {};
      const climbs = activity.climbs || [];

      const name = config?.name || 'Deportista';
      const age = config?.age || 47;
      const weight = config?.weight || 77;
      const z1Max = config?.hrZones?.z1Max || 124;
      const z2Max = config?.hrZones?.z2Max || 145;
      const z3Max = config?.hrZones?.z3Max || 158;
      const z4Max = config?.hrZones?.z4Max || 170;

      // Calculate times in zones based on personalized cardio zones
      const zoneTimes = [0, 0, 0, 0, 0];
      let totalHrSeconds = 0;

      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];

        if (curr.hr && curr.hr > 0 && prev.time && curr.time) {
          const dTime = (new Date(curr.time).getTime() - new Date(prev.time).getTime()) / 1000;
          if (dTime > 0 && dTime < 60) {
            const hr = curr.hr;
            if (hr <= z1Max) zoneTimes[0] += dTime;
            else if (hr <= z2Max) zoneTimes[1] += dTime;
            else if (hr <= z3Max) zoneTimes[2] += dTime;
            else if (hr <= z4Max) zoneTimes[3] += dTime;
            else zoneTimes[4] += dTime;
            totalHrSeconds += dTime;
          }
        }
      }

      // Fallback: attribute 1s per point if time calculation gives 0
      if (totalHrSeconds === 0) {
        points.forEach(pt => {
          if (pt.hr && pt.hr > 0) {
            const hr = pt.hr;
            if (hr <= z1Max) zoneTimes[0]++;
            else if (hr <= z2Max) zoneTimes[1]++;
            else if (hr <= z3Max) zoneTimes[2]++;
            else if (hr <= z4Max) zoneTimes[3]++;
            else zoneTimes[4]++;
            totalHrSeconds++;
          }
        });
      }

      // Determine dominant zone
      let maxZoneIdx = 0;
      let maxZoneVal = 0;
      zoneTimes.forEach((time, idx) => {
        if (time > maxZoneVal) {
          maxZoneVal = time;
          maxZoneIdx = idx;
        }
      });

      const analysisTexts = [
        'Entrenamiento de Recuperación Activa. Excelente rodaje suave ideal para desintoxicar las piernas, promover el flujo sanguíneo y asimilar cargas de entrenamientos previos sin fatiga adicional.',
        'Entrenamiento de Resistencia de Base (Fondo). Este es el motor del ciclista. Rodar en esta zona mejora la capilarización muscular, la eficiencia mitocondrial y optimiza la quema de grasas como combustible principal.',
        'Entrenamiento de Tempo Aeróbico. Un ritmo alegre y exigente que mejora tu potencia aeróbica media. Enseña a tu cuerpo a reciclar el lactato a velocidades moderadas, preparándote para ritmos rápidos.',
        'Entrenamiento de Umbral de Lactato (Sweet Spot). Rodaje demandante que requiere concentración. Trabajar aquí incrementa de manera óptima tu potencia al umbral funcional (FTP), elevando tu velocidad de crucero.',
        'Sesión de Alta Intensidad (Capacidad Anaeróbica / VO2 Max). Entrenamiento sumamente extenuante. Pasar tiempo en esta zona estimula el volumen máximo de oxígeno que tu corazón y pulmones pueden procesar.'
      ];

      const trainingTips = [
        'Utiliza esta zona al día siguiente de entrenamientos intensos. Mantén una cadencia alegre (90+ rpm) para activar el flujo sanguíneo y acelerar la recuperación sin sobrecargar las fibras.',
        'Para mejorar tu resistencia fundamental, acumula sesiones largas (2 a 4 horas) de forma constante en esta zona. La disciplina aquí te permitirá rodar mucho más rápido a menor pulso a largo plazo.',
        'Limita estas sesiones a 1 o 2 veces por semana. Realiza intervalos continuos de 20-30 min en esta zona para entrenar a tu cuerpo a tolerar la acidez a ritmos de crucero alegres.',
        'Para elevar tu umbral funcional (FTP), realiza series estructuradas de 2x15 min o 3x10 min en esta zona, descansando 5 min entre ellas. Esta zona consume mucho glucógeno; cuida tu recarga post-entreno.',
        'Haz microintervalos explosivos (ej. 30s a tope / 30s recuperación suave) o repechos cortos de 2-3 min. Limítalo a 1 vez por semana, llegando muy descansado para rendir al máximo.'
      ];

      // Setup jsPDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const totalPages = 3;

      // Draw header helper
      const drawHeader = (pageNum) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(22);
        pdf.setTextColor(252, 97, 0); // Strava orange
        pdf.text('GIRO GPX', 20, 20);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(113, 128, 150);
        pdf.text('INFORME TÉCNICO DE RENDIMIENTO', 20, 26);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(113, 128, 150);
        pdf.text(`Página ${pageNum} de ${totalPages}`, 190, 20, { align: 'right' });

        // Divider
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.5);
        pdf.line(20, 30, 190, 30);
      };

      // Draw footer helper
      const drawFooter = () => {
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.5);
        pdf.line(20, 280, 190, 280);

        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7.5);
        pdf.setTextColor(160, 174, 192);
        pdf.text('Giro GPX Dashboard • Generado automáticamente mediante telemetría GPX • Confidencial', 20, 286);
      };

      // Helper to draw telemetry grid card
      const drawCard = (x, y, w, h, label, val, unit = '') => {
        pdf.setFillColor(248, 250, 252); // light slate background
        pdf.setDrawColor(226, 232, 240); // borders
        pdf.setLineWidth(0.4);
        pdf.rect(x, y, w, h, 'FD');

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(113, 128, 150);
        pdf.text(label, x + 5, y + 6);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(45, 55, 72);
        pdf.text(val, x + 5, y + 13);

        if (unit) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(113, 128, 150);
          const valWidth = pdf.getTextWidth(val);
          pdf.text(unit, x + 5 + valWidth + 1.5, y + 13);
        }
      };

      // --- PAGE 1: RESUMEN DE RENDIMIENTO ---
      drawHeader(1);

      // Route name & date
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(45, 55, 72);
      pdf.text(activity.name, 20, 42);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(113, 128, 150);
      pdf.text(`Fecha de la ruta: ${formatDate(activity.date)}   •   Ciclista: ${name} (${age} años, ${weight} kg)   •   Tipo: Ciclismo 🚴`, 20, 47);

      // Telemetry Cards Grid
      const colW = 82;
      const cardH = 17;
      
      // Row 1
      drawCard(20, 55, colW, cardH, 'DISTANCIA TOTAL', stats.distanceKm ? String(stats.distanceKm) : '0.00', 'km');
      drawCard(108, 55, colW, cardH, 'TIEMPO EN MOVIMIENTO', formatDuration(stats.movingTimeSec || 0));

      // Row 2
      drawCard(20, 76, colW, cardH, 'VELOCIDAD MEDIA / MÁXIMA', `${stats.avgSpeedKmh || 0} / ${stats.maxSpeedKmh || 0}`, 'km/h');
      drawCard(108, 76, colW, cardH, 'ALTIMETRÍA (+DESNIVEL / -DESNIVEL)', `+${stats.elevationGainM || 0} / -${stats.elevationLossM || 0}`, 'm');

      // Row 3
      drawCard(20, 97, colW, cardH, 'FRECUENCIA CARDÍACA (MED / MÁX)', stats.avgHr ? `${stats.avgHr} / ${stats.maxHr || 0}` : 'Sin datos', stats.avgHr ? 'ppm' : '');
      drawCard(108, 97, colW, cardH, 'CALORÍAS CONSUMIDAS', stats.calories ? String(stats.calories) : '0', 'kcal');

      // Row 4
      const powerLabel = stats.hasPowerMeter ? 'POTENCIA DE POTENCIÓMETRO (MED / MÁX)' : 'POTENCIA ESTIMADA (MED / MÁX)';
      drawCard(20, 118, colW, cardH, powerLabel, `${stats.avgWatts || 0} / ${stats.maxWatts || 0}`, 'W');
      drawCard(108, 118, colW, cardH, 'DIFICULTAD DE LA RUTA', stats.difficultyScore ? `${stats.difficultyScore} / 100` : '0 / 100');

      // Row 5
      drawCard(20, 139, colW, cardH, 'PUNTUACIÓN DE FORMA FÍSICA', stats.fitnessScore ? `${stats.fitnessScore} / 100` : 'Sin datos');
      const cadLabel = stats.hasCadenceSensor ? 'CADENCIA DE SENSOR (MED / MÁX)' : 'CADENCIA ESTIMADA (MED / MÁX)';
      drawCard(108, 139, colW, cardH, cadLabel, `${stats.avgCad || 0} / ${stats.maxCad || 0}`, 'rpm');

      // Heart Rate Zones Table Header
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(252, 97, 0);
      pdf.text('DISTRIBUCIÓN DE ZONAS CARDÍACAS (ppm)', 20, 172);

      // Table Header Row (Left Column - Table)
      pdf.setFillColor(241, 245, 249);
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.rect(20, 178, 95, 8, 'FD'); // table width reduced from 170 to 95

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(71, 85, 105);
      pdf.text('Zona (Rango)', 22, 183.2);
      pdf.text('%', 78, 183.2);
      pdf.text('Tiempo', 94, 183.2);

      // HR zones metadata with combined names
      const zones = [
        { name: 'Z1 Recuperación Activa', fullName: `Z1 (< ${z1Max + 1} ppm)`, range: `< ${z1Max + 1} ppm` },
        { name: 'Z2 Resistencia Aeróbica', fullName: `Z2 (${z1Max + 1}-${z2Max} ppm)`, range: `${z1Max + 1} - ${z2Max} ppm` },
        { name: 'Z3 Tempo Aeróbico', fullName: `Z3 (${z2Max + 1}-${z3Max} ppm)`, range: `${z2Max + 1} - ${z3Max} ppm` },
        { name: 'Z4 Umbral de Lactato', fullName: `Z4 (${z3Max + 1}-${z4Max} ppm)`, range: `${z3Max + 1} - ${z4Max} ppm` },
        { name: 'Z5 Capacidad Anaeróbica', fullName: `Z5 (> ${z4Max} ppm)`, range: `> ${z4Max} ppm` }
      ];

      // Draw HR zone table rows (Left Column)
      let curY = 186;
      zones.forEach((zone, idx) => {
        pdf.setDrawColor(241, 245, 249);
        pdf.line(20, curY, 115, curY);

        const time = zoneTimes[idx];
        const percent = totalHrSeconds > 0 ? (time / totalHrSeconds) * 100 : 0;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(71, 85, 105);
        pdf.text(zone.fullName, 22, curY + 5.5);
        pdf.text(`${percent.toFixed(1)}%`, 78, curY + 5.5);
        pdf.text(formatDuration(time), 94, curY + 5.5);

        curY += 8;
      });

      // --- RIGHT COLUMN: VISUAL ZONE CHART ---
      // Container box
      pdf.setFillColor(250, 250, 250);
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.rect(125, 178, 65, 48, 'FD');

      // Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      pdf.text('Distribución Visual', 129, 183.2);

      // Divider line under title
      pdf.setDrawColor(226, 232, 240);
      pdf.line(125, 186, 190, 186);

      // Colors for the bars (RGB) matching custom theme
      const zoneColors = [
        [59, 130, 246],  // Z1: Blue
        [16, 185, 129], // Z2: Green
        [234, 179, 8],  // Z3: Yellow
        [249, 115, 22],  // Z4: Orange
        [239, 68, 68]   // Z5: Red
      ];

      // Draw horizontal bars
      zones.forEach((zone, idx) => {
        const by = 186 + 2.5 + idx * 7.5;
        const color = zoneColors[idx];
        const time = zoneTimes[idx];
        const percent = totalHrSeconds > 0 ? (time / totalHrSeconds) * 100 : 0;

        // Color box indicator
        pdf.setFillColor(color[0], color[1], color[2]);
        pdf.rect(129, by, 3, 3, 'F');

        // Zone label
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(71, 85, 105);
        pdf.text(`Z${idx + 1}`, 134, by + 2.6);

        // Progress bar background
        pdf.setFillColor(241, 245, 249);
        pdf.rect(140, by, 34, 3, 'F');

        // Progress bar fill
        pdf.setFillColor(color[0], color[1], color[2]);
        const fillWidth = (percent / 100) * 34;
        if (fillWidth > 0) {
          pdf.rect(140, by, fillWidth, 3, 'F');
        }

        // Percentage text next to bar
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(113, 128, 150);
        pdf.text(`${percent.toFixed(1)}%`, 176, by + 2.5);
      });

      drawFooter();

      // --- PAGE 2: GRÁFICAS DE TELEMETRÍA ---
      pdf.addPage();
      drawHeader(2);

      // Page Title
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(252, 97, 0);
      pdf.text('PERFILES DE TELEMETRÍA (ANÁLISIS GRÁFICO)', 20, 42);

      // Determine available charts to render dynamically
      const chartsToDraw = [];
      
      // 1. Elevation Profile (always available)
      chartsToDraw.push({
        key: 'ele',
        label: 'Perfil de Elevación (m)',
        color: [252, 97, 0], // Strava Orange
        isArea: true,
        fillColor: [255, 240, 230], // Light orange tint
        unit: 'm'
      });

      // 2. Heart Rate Line Chart (if data exists)
      const hasHrData = points.some(p => p.hr && p.hr > 0);
      if (hasHrData) {
        chartsToDraw.push({
          key: 'hr',
          label: 'Frecuencia Cardíaca (ppm)',
          color: [239, 68, 68], // Red/Crimson
          isArea: false,
          unit: 'ppm'
        });
      }

      // 3. Speed Line Chart (always available)
      chartsToDraw.push({
        key: 'speed',
        label: 'Perfil de Velocidad (km/h)',
        color: [59, 130, 246], // Blue
        isArea: false,
        unit: 'km/h'
      });

      // 4. Power Line Chart (always available)
      chartsToDraw.push({
        key: 'watts',
        label: stats.hasPowerMeter ? 'Perfil de Potencia de Potenciómetro (W)' : 'Perfil de Potencia Estimada (W)',
        color: [234, 179, 8], // Amber/Yellow
        isArea: false,
        unit: 'W'
      });

      // 5. Cadence Line Chart (always available)
      chartsToDraw.push({
        key: 'cadence',
        label: stats.hasCadenceSensor ? 'Perfil de Cadencia de Sensor (rpm)' : 'Perfil de Cadencia Estimada (rpm)',
        color: [16, 185, 129], // Emerald/Green
        isArea: false,
        unit: 'rpm'
      });

      // Layout calculations for dynamic height distribution
      const startY = 48;
      const totalAvailableHeight = 220; // 268 max print - 48 start = 220 mm
      const chartGap = 10;
      const chartHeight = (totalAvailableHeight - (chartGap * (chartsToDraw.length - 1))) / chartsToDraw.length;

      chartsToDraw.forEach((chart, index) => {
        const currentY = startY + index * (chartHeight + chartGap);
        drawVectorChart(
          pdf, 
          20, 
          currentY, 
          170, 
          chartHeight, 
          points, 
          chart.key, 
          chart.label, 
          chart.color, 
          chart.isArea, 
          chart.fillColor, 
          chart.unit
        );
      });

      drawFooter();

      // --- PAGE 3: ANÁLISIS DE PUERTOS Y CONCLUSIÓN ---
      pdf.addPage();
      drawHeader(3);

      // Climbs Section Header
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(252, 97, 0);
      pdf.text('PUERTOS Y REPECHOS DETECTADOS', 20, 42);

      // Table Header Row for Climbs
      pdf.setFillColor(241, 245, 249);
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.rect(20, 48, 170, 8, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(71, 85, 105);
      pdf.text('Nombre del Puerto / Repecho', 23, 53.5);
      pdf.text('Inicio', 75, 53.5);
      pdf.text('Longitud', 95, 53.5);
      pdf.text('Ganancia ele.', 120, 53.5);
      pdf.text('Med / Máx %', 150, 53.5);

      if (climbs.length > 0) {
        let climbY = 56;
        climbs.forEach((climb) => {
          pdf.setDrawColor(241, 245, 249);
          pdf.line(20, climbY, 190, climbY);

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(71, 85, 105);
          pdf.text(`⛰️ ${climb.name}`, 23, climbY + 6);
          pdf.text(`km ${climb.startKm}`, 75, climbY + 6);
          pdf.text(`${climb.lengthKm} km`, 95, climbY + 6);
          pdf.text(`+${climb.eleGain} m`, 120, climbY + 6);
          pdf.text(`${climb.avgGrade}% / ${climb.maxGrade}%`, 150, climbY + 6);

          climbY += 8;
        });
      } else {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(8.5);
        pdf.setTextColor(148, 163, 184);
        pdf.text('No se han detectado subidas notables (puertos o repechos) en este recorrido.', 23, 62);
      }

      // Physiological Analysis Block
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(252, 97, 0);
      pdf.text('ANÁLISIS FISIOLÓGICO Y RECOMENDACIÓN DE ENTRENAMIENTO', 20, 135);

      // Grey background card for recommendation
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.rect(20, 142, 170, 56, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(30, 41, 59);
      pdf.text('Enfoque Fisiológico Dominante:', 25, 150);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);
      
      // Multi-line split text for physiological analysis
      const analysisSplit = pdf.splitTextToSize(analysisTexts[maxZoneIdx], 160);
      pdf.text(analysisSplit, 25, 156);

      // Horizontal separator
      pdf.setDrawColor(226, 232, 240);
      pdf.line(25, 172, 185, 172);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5);
      pdf.setTextColor(252, 97, 0);
      pdf.text('Consejo de Mejora Profesional:', 25, 178);

      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.setTextColor(71, 85, 105);

      // Multi-line split text for training tips
      const tipSplit = pdf.splitTextToSize(trainingTips[maxZoneIdx], 160);
      pdf.text(tipSplit, 25, 184);

      // Custom Fitness Scoring Verdict
      if (stats.avgHr) {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(45, 55, 72);
        pdf.text('VERDICTO TÉCNICO DE FORMA', 20, 217);

        // Status bar background
        pdf.setFillColor(241, 245, 249);
        pdf.rect(20, 222, 170, 3, 'F');

        // Status bar progress indicator fill
        const barFillWidth = (stats.fitnessScore / 100) * 170;
        pdf.setFillColor(252, 97, 0);
        pdf.rect(20, 222, barFillWidth, 3, 'F');

        let fitnessCategory = 'Condición en Transición';
        let fitnessDesc = 'Margen de optimización. Ideal para acumular volumen suave en Z2 para consolidar el motor aeróbico.';

        if (stats.fitnessScore >= 88) {
          fitnessCategory = 'Excelente Forma (Avanzado / Élite)';
          fitnessDesc = '¡Estado excepcional! Ratio excepcional de vatios medios por pulsación cardíaca. Corazón altamente eficiente.';
        } else if (stats.fitnessScore >= 74) {
          fitnessCategory = 'Buena Forma (Intermedio-Alto)';
          fitnessDesc = 'Nivel notable de rendimiento. Adaptación cardiovascular fuerte a la demanda de potencia.';
        } else if (stats.fitnessScore >= 50) {
          fitnessCategory = 'Forma Aceptable (Intermedio)';
          fitnessDesc = 'Nivel cardiovascular moderado. Buena base de entrenamientos, pero con un amplio margen de mejora de FTP.';
        }

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(30, 41, 59);
        pdf.text(`Rendimiento Ciclista: ${fitnessCategory} (${stats.fitnessScore} / 100)`, 20, 231);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(fitnessDesc, 20, 236);
      }

      drawFooter();

      // Save PDF
      pdf.save(`${activity.name.replace(/\s+/g, '_')}_informe_tecnico.pdf`);
    } catch (err) {
      console.error('Error al generar PDF técnico:', err);
      alert('Hubo un error al generar el PDF técnico. Consulta la consola para ver los detalles.');
    }
  };

  return (
    <button className="pdf-button" onClick={handleGeneratePdf} title="Generar informe técnico PDF en modo claro">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
      <span>Generar PDF Técnico</span>
    </button>
  );
}
