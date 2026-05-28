import React, { useState, useEffect } from 'react';
import DashboardStats from './components/DashboardStats';
import RouteMap from './components/RouteMap';
import ActivityCharts from './components/ActivityCharts';
import HeartRateZones from './components/HeartRateZones';
import ReportButton from './components/ReportButton';
import versionData from './version.json';

// Format date into Spanish friendly format
function formatDate(dateString) {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const options = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('es-ES', options);
}

// Keytel Calorie Estimation Model based on HR, age (47), weight (77kg), and gender (male)
function calculateCalories(points = [], age = 47, weight = 77, stats = {}) {
  const hasHr = points.some(p => p.hr && p.hr > 0);
  if (hasHr) {
    let calories = 0;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (curr.hr && curr.hr > 0 && prev.time && curr.time) {
        const dTime = (new Date(curr.time).getTime() - new Date(prev.time).getTime()) / 1000;
        // Filter out extreme gaps
        if (dTime > 0 && dTime < 60) {
          const hr = curr.hr;
          const mins = dTime / 60;
          // Male formula: kcal/min = (0.6309 * HR + 0.1988 * Weight - 0.2017 * Age - 55.0969) / 4.184
          const kcalPerMin = (0.6309 * hr + 0.1988 * weight - 0.2017 * age - 55.0969) / 4.184;
          if (kcalPerMin > 0) {
            calories += kcalPerMin * mins;
          }
        }
      }
    }
    return Math.round(calories);
  } else {
    // MET-based approximation: calories = MET * weight (kg) * time (hours)
    const avgSpeed = stats.avgSpeedKmh || 18;
    let met = 4;
    if (avgSpeed < 15) met = 4;
    else if (avgSpeed < 19) met = 6;
    else if (avgSpeed < 22) met = 8;
    else if (avgSpeed < 26) met = 10;
    else met = 12;

    const movingTimeHours = (stats.movingTimeSec || 3600) / 3600;
    return Math.round(met * weight * movingTimeHours);
  }
}

// Physical Power Estimation Model (Watts) for 77kg rider + 10kg bike
function calculatePower(points = [], weight = 77) {
  const hasPowerMeter = points.some(p => p.watts !== null && p.watts > 0);
  
  if (hasPowerMeter) {
    let wattsSum = 0;
    let maxWatts = 0;
    let validWattsCount = 0;

    points.forEach(p => {
      if (p.watts === null || isNaN(p.watts)) {
        p.watts = 0;
      }
      wattsSum += p.watts;
      validWattsCount++;
      if (p.watts > maxWatts) {
        maxWatts = p.watts;
      }
    });

    const avgWatts = validWattsCount > 0 ? Math.round(wattsSum / validWattsCount) : 0;
    return {
      avgWatts,
      maxWatts: Math.round(maxWatts),
      hasPowerMeter: true
    };
  }

  const mass = weight + 10; // 77 kg rider + 10 kg bike & gear = 87 kg
  const g = 9.81;
  let wattsSum = 0;
  let maxWatts = 0;
  let validWattsCount = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (prev.time && curr.time) {
      const dTime = (new Date(curr.time).getTime() - new Date(prev.time).getTime()) / 1000;
      if (dTime > 0 && dTime < 60) {
        const dDist = (curr.distance - prev.distance) * 1000; // meters
        const v = dDist / dTime; // speed m/s
        
        if (v > 0.5) { // rider is moving
          const grade = (curr.ele - prev.ele) / dDist; // grade fraction
          const pGravity = mass * g * v * grade;
          const pDrag = 0.5 * 0.32 * 1.2 * Math.pow(v, 3);
          const pRolling = 0.004 * mass * g * v;
          
          let pTotal = pGravity + pDrag + pRolling;
          pTotal = pTotal / 0.97; // drivetrain efficiency (~97%)
          
          if (pTotal < 0) pTotal = 0;
          if (pTotal > 1000) pTotal = 1000;
          
          curr.watts = Math.round(pTotal);
          wattsSum += pTotal;
          validWattsCount++;
          if (pTotal > maxWatts) {
            maxWatts = pTotal;
          }
        } else {
          curr.watts = 0;
          wattsSum += 0;
          validWattsCount++;
        }
      }
    }
  }

  if (points.length > 0) {
    points[0].watts = 0;
  }

  const avgWatts = validWattsCount > 0 ? Math.round(wattsSum / validWattsCount) : 0;
  return {
    avgWatts,
    maxWatts: Math.round(maxWatts),
    hasPowerMeter: false
  };
}

// Helper to convert coordinate distance (Haversine Formula) in browser
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Rolling average for smoothing elevation
function smoothSeries(data, windowSize = 5) {
  const smoothed = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length - 1, i + Math.floor(windowSize / 2));
    for (let j = start; j <= end; j++) {
      sum += data[j];
      count++;
    }
    smoothed.push(sum / count);
  }
  return smoothed;
}

// Parse GPX XML content directly in the browser using native DOMParser
function parseGPXDataClient(xmlContent, filename) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
  
  const gpxEl = xmlDoc.getElementsByTagName('gpx')[0];
  if (!gpxEl) {
    throw new Error('Formato GPX no válido o archivo dañado.');
  }

  const trkNameEl = xmlDoc.getElementsByTagName('name')[0];
  const name = trkNameEl ? trkNameEl.textContent : filename.replace('.gpx', '');
  
  const trkTypeEl = xmlDoc.getElementsByTagName('type')[0];
  const type = trkTypeEl ? trkTypeEl.textContent : 'cycling';

  const trkpts = xmlDoc.getElementsByTagName('trkpt');
  if (trkpts.length === 0) {
    throw new Error('No se encontraron puntos de track en el GPX.');
  }

  const points = [];
  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = parseFloat(pt.getAttribute('lat'));
    const lon = parseFloat(pt.getAttribute('lon'));
    
    const eleEl = pt.getElementsByTagName('ele')[0];
    const ele = eleEl ? parseFloat(eleEl.textContent) : 0;
    
    const timeEl = pt.getElementsByTagName('time')[0];
    const time = timeEl ? new Date(timeEl.textContent) : null;

    let hr = null;
    const hrEl = pt.getElementsByTagName('hr')[0] || pt.getElementsByTagName('gpxtpx:hr')[0] || pt.getElementsByTagName('ns3:hr')[0];
    if (hrEl) {
      hr = parseInt(hrEl.textContent, 10);
    } else {
      const extensions = pt.getElementsByTagName('extensions')[0];
      if (extensions) {
        const anyHr = extensions.getElementsByTagName('hr')[0] || extensions.getElementsByTagName('gpxtpx:hr')[0] || extensions.getElementsByTagName('ns3:hr')[0];
        if (anyHr) {
          hr = parseInt(anyHr.textContent, 10);
        }
      }
    }

    let watts = null;
    const powerEl = pt.getElementsByTagName('power')[0] || pt.getElementsByTagName('watts')[0] || pt.getElementsByTagName('gpxtpx:watts')[0];
    if (powerEl) {
      watts = parseInt(powerEl.textContent, 10);
    } else {
      const extensions = pt.getElementsByTagName('extensions')[0];
      if (extensions) {
        const anyPower = extensions.getElementsByTagName('power')[0] || extensions.getElementsByTagName('watts')[0] || extensions.getElementsByTagName('gpxtpx:watts')[0];
        if (anyPower) {
          watts = parseInt(anyPower.textContent, 10);
        }
      }
    }

    let cadence = null;
    const cadEl = pt.getElementsByTagName('cad')[0] || pt.getElementsByTagName('gpxtpx:cad')[0] || pt.getElementsByTagName('ns3:cad')[0] || pt.getElementsByTagName('cadence')[0];
    if (cadEl) {
      cadence = parseInt(cadEl.textContent, 10);
    } else {
      const extensions = pt.getElementsByTagName('extensions')[0];
      if (extensions) {
        const anyCad = extensions.getElementsByTagName('cad')[0] || extensions.getElementsByTagName('gpxtpx:cad')[0] || extensions.getElementsByTagName('ns3:cad')[0] || extensions.getElementsByTagName('cadence')[0];
        if (anyCad) {
          cadence = parseInt(anyCad.textContent, 10);
        }
      }
    }

    points.push({
      index: i,
      lat,
      lon,
      ele,
      time,
      hr: hr !== null && !isNaN(hr) ? hr : null,
      watts: watts !== null && !isNaN(watts) ? watts : null,
      cadence: cadence !== null && !isNaN(cadence) ? cadence : null,
    });
  }

  const startTime = points[0].time;
  const endTime = points[points.length - 1].time;
  const totalDuration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : 0;

  const rawElevations = points.map(p => p.ele);
  const smoothedElevations = smoothSeries(rawElevations, 7);

  const hasCadenceSensor = points.some(p => p.cadence !== null && p.cadence > 0);

  let cumulativeDistance = 0;
  let cumulativeAscent = 0;
  let cumulativeDescent = 0;
  let movingTime = 0;
  let hrSum = 0;
  let hrCount = 0;
  let maxHrVal = 0;

  const pointsWithTelemetry = [points[0]];
  points[0].distance = 0;
  points[0].speed = 0;
  points[0].grade = 0;
  points[0].cadence = points[0].cadence || 0;

  if (points[0].hr && points[0].hr > 0) {
    hrSum += points[0].hr;
    hrCount++;
    maxHrVal = points[0].hr;
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    const dDist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    cumulativeDistance += dDist;

    let dTime = 0;
    if (prev.time && curr.time) {
      dTime = (curr.time.getTime() - prev.time.getTime()) / 1000;
    }

    const dEle = smoothedElevations[i] - smoothedElevations[i - 1];
    if (dEle > 0) {
      cumulativeAscent += dEle;
    } else {
      cumulativeDescent += Math.abs(dEle);
    }

    if (curr.hr && curr.hr > 0) {
      hrSum += curr.hr;
      hrCount++;
      if (curr.hr > maxHrVal) maxHrVal = curr.hr;
    }

    let speed = 0;
    if (dTime > 0) {
      speed = (dDist / dTime) * 3600;
    }

    if (speed > 90) speed = prev.speed || 0;
    if (speed > 1.8 && dTime < 60) {
      movingTime += dTime;
    }

    let grade = 0;
    if (dDist > 0) {
      grade = (dEle / (dDist * 1000)) * 100;
    }
    if (grade > 35) grade = 35;
    if (grade < -35) grade = -35;

    curr.distance = parseFloat(cumulativeDistance.toFixed(3));
    curr.speed = parseFloat(speed.toFixed(1));
    curr.grade = parseFloat(grade.toFixed(1));
    curr.ele = parseFloat(smoothedElevations[i].toFixed(1));

    // Resolve cadence if estimated is needed
    if (!hasCadenceSensor) {
      let estCad = 0;
      if (curr.speed > 2.5) {
        const gradeVal = curr.grade || 0;
        let slopeEffect = 0;
        if (gradeVal > 1.5) {
          slopeEffect = (gradeVal - 1.5) * 1.5;
        } else if (gradeVal < -1.5) {
          slopeEffect = (gradeVal + 1.5) * 0.8;
        }
        
        let baseCad = 84;
        estCad = baseCad - slopeEffect;
        
        // Add realistic, smooth micro-fluctuations (sin/cos based on index)
        const noise = Math.sin(i / 8) * 3 + Math.cos(i / 17) * 1.5;
        estCad += noise;
        
        estCad = Math.max(55, Math.min(102, Math.round(estCad)));
        
        // Coasting on steep downhills
        if (gradeVal < -4 && curr.speed > 35) {
          if ((i % 40) < 12) {
            estCad = 0;
          }
        }
      } else {
        estCad = 0;
      }
      curr.cadence = estCad;
    } else {
      curr.cadence = curr.cadence !== null ? curr.cadence : 0;
    }

    pointsWithTelemetry.push(curr);
  }

  const speeds = pointsWithTelemetry.map(p => p.speed);
  const smoothedSpeeds = smoothSeries(speeds, 11);
  pointsWithTelemetry.forEach((p, idx) => {
    p.speed = parseFloat(smoothedSpeeds[idx].toFixed(1));
  });

  const avgSpeed = movingTime > 0 ? (cumulativeDistance / movingTime) * 3600 : 0;
  const maxSpeed = Math.max(...pointsWithTelemetry.map(p => p.speed));
  const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : null;

  const climbs = [];
  let climbStartIdx = null;

  for (let i = 1; i < pointsWithTelemetry.length; i++) {
    const pt = pointsWithTelemetry[i];
    if (pt.grade > 1.5) {
      if (climbStartIdx === null) {
        climbStartIdx = i - 1;
      }
    } else if (pt.grade < 0) {
      if (climbStartIdx !== null) {
        const startPt = pointsWithTelemetry[climbStartIdx];
        const endPt = pointsWithTelemetry[i - 1];
        const distDiff = endPt.distance - startPt.distance;
        const eleDiff = endPt.ele - startPt.ele;
        const avgGrade = distDiff > 0 ? (eleDiff / (distDiff * 1000)) * 100 : 0;

        if (distDiff >= 0.4 && eleDiff >= 15 && avgGrade >= 2.5) {
          climbs.push({
            name: `Puerto ${climbs.length + 1}`,
            startKm: parseFloat(startPt.distance.toFixed(1)),
            endKm: parseFloat(endPt.distance.toFixed(1)),
            lengthKm: parseFloat(distDiff.toFixed(2)),
            eleGain: Math.round(eleDiff),
            avgGrade: parseFloat(avgGrade.toFixed(1)),
            maxGrade: parseFloat(Math.max(...pointsWithTelemetry.slice(climbStartIdx, i).map(p => p.grade)).toFixed(1)),
            startIndex: climbStartIdx,
            endIndex: i - 1
          });
        }
        climbStartIdx = null;
      }
    }
  }

  if (climbStartIdx !== null) {
    const startPt = pointsWithTelemetry[climbStartIdx];
    const endPt = pointsWithTelemetry[pointsWithTelemetry.length - 1];
    const distDiff = endPt.distance - startPt.distance;
    const eleDiff = endPt.ele - startPt.ele;
    const avgGrade = distDiff > 0 ? (eleDiff / (distDiff * 1000)) * 100 : 0;

    if (distDiff >= 0.4 && eleDiff >= 15 && avgGrade >= 2.5) {
      climbs.push({
        name: `Puerto ${climbs.length + 1}`,
        startKm: parseFloat(startPt.distance.toFixed(1)),
        endKm: parseFloat(endPt.distance.toFixed(1)),
        lengthKm: parseFloat(distDiff.toFixed(2)),
        eleGain: Math.round(eleDiff),
        avgGrade: parseFloat(avgGrade.toFixed(1)),
        maxGrade: parseFloat(Math.max(...pointsWithTelemetry.slice(climbStartIdx, pointsWithTelemetry.length).map(p => p.grade)).toFixed(1)),
        startIndex: climbStartIdx,
        endIndex: pointsWithTelemetry.length - 1
      });
    }
  }

  const hasPowerMeter = points.some(p => p.watts !== null && p.watts > 0);

  let cadSum = 0;
  let cadCount = 0;
  let maxCad = 0;

  pointsWithTelemetry.forEach(p => {
    if (p.cadence && p.cadence > 0) {
      cadSum += p.cadence;
      cadCount++;
      if (p.cadence > maxCad) {
        maxCad = p.cadence;
      }
    }
  });

  const avgCad = cadCount > 0 ? Math.round(cadSum / cadCount) : 0;

  return {
    filename,
    name,
    type,
    date: startTime ? startTime.toISOString() : new Date().toISOString(),
    stats: {
      distanceKm: parseFloat(cumulativeDistance.toFixed(2)),
      totalDurationSec: Math.round(totalDuration),
      movingTimeSec: Math.round(movingTime || totalDuration),
      elevationGainM: Math.round(cumulativeAscent),
      elevationLossM: Math.round(cumulativeDescent),
      avgSpeedKmh: parseFloat(avgSpeed.toFixed(1)),
      maxSpeedKmh: parseFloat(maxSpeed.toFixed(1)),
      avgHr: avgHr,
      maxHr: hrCount > 0 ? maxHrVal : null,
      minEle: Math.round(Math.min(...rawElevations)),
      maxEle: Math.round(Math.max(...rawElevations)),
      hasPowerMeter: hasPowerMeter,
      avgCad: avgCad,
      maxCad: maxCad,
      hasCadenceSensor: hasCadenceSensor,
    },
    climbs,
    points: pointsWithTelemetry,
  };
}

export default function App() {
  const [activities, setActivities] = useState([]);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedFilename, setSelectedFilename] = useState('');
  const [maxHr, setMaxHr] = useState(190);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [activeClimb, setActiveClimb] = useState(null);
  
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('giro_gpx_user_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing user config', e);
      }
    }
    const defaults = {
      name: 'Benjamín',
      age: 47,
      weight: 77,
      hrZones: {
        z1Max: 124,
        z2Max: 145,
        z3Max: 158,
        z4Max: 170
      }
    };
    localStorage.setItem('giro_gpx_user_config', JSON.stringify(defaults));
    return defaults;
  });

  const [tempName, setTempName] = useState('');
  const [tempAge, setTempAge] = useState('');
  const [tempWeight, setTempWeight] = useState('');
  const [tempZ1Max, setTempZ1Max] = useState('');
  const [tempZ2Max, setTempZ2Max] = useState('');
  const [tempZ3Max, setTempZ3Max] = useState('');
  const [tempZ4Max, setTempZ4Max] = useState('');
  const [valError, setValError] = useState('');

  useEffect(() => {
    if (isConfigOpen) {
      setTempName(config.name);
      setTempAge(config.age);
      setTempWeight(config.weight);
      setTempZ1Max(config.hrZones.z1Max);
      setTempZ2Max(config.hrZones.z2Max);
      setTempZ3Max(config.hrZones.z3Max);
      setTempZ4Max(config.hrZones.z4Max);
      setValError('');
    }
  }, [isConfigOpen, config]);

  const handleSaveConfig = () => {
    if (!tempName.trim()) {
      setValError('El nombre no puede estar vacío.');
      return;
    }
    const ageNum = parseInt(tempAge, 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      setValError('La edad debe ser mayor que cero.');
      return;
    }
    const weightNum = parseFloat(tempWeight);
    if (isNaN(weightNum) || weightNum <= 0) {
      setValError('El peso debe ser mayor que cero.');
      return;
    }
    const z1 = parseInt(tempZ1Max, 10);
    const z2 = parseInt(tempZ2Max, 10);
    const z3 = parseInt(tempZ3Max, 10);
    const z4 = parseInt(tempZ4Max, 10);

    if (isNaN(z1) || z1 <= 0) {
      setValError('Z1 Máx debe ser un número mayor que cero.');
      return;
    }
    if (isNaN(z2) || z2 <= z1) {
      setValError('Z2 Máx debe ser mayor que Z1 Máx.');
      return;
    }
    if (isNaN(z3) || z3 <= z2) {
      setValError('Z3 Máx debe ser mayor que Z2 Máx.');
      return;
    }
    if (isNaN(z4) || z4 <= z3) {
      setValError('Z4 Máx debe ser mayor que Z3 Máx.');
      return;
    }

    const newConfig = {
      name: tempName.trim(),
      age: ageNum,
      weight: weightNum,
      hrZones: {
        z1Max: z1,
        z2Max: z2,
        z3Max: z3,
        z4Max: z4
      }
    };
    localStorage.setItem('giro_gpx_user_config', JSON.stringify(newConfig));
    setConfig(newConfig);
    setIsConfigOpen(false);
  };

  // Load activities list in local standalone fallback mode
  const enableLocalMode = () => {
    setIsLocalMode(true);
    const saved = localStorage.getItem('giro_gpx_activities');
    if (saved) {
      try {
        const list = JSON.parse(saved);
        setActivities(list);
        if (list.length > 0) {
          loadLocalActivity(list[0].filename, list);
        }
      } catch (e) {
        console.error('Error parsing local storage activities', e);
        setActivities([]);
      }
    } else {
      setActivities([]);
    }
  };

  const loadLocalActivity = (filename, list = activities) => {
    const fullKey = `giro_gpx_detail_${filename}`;
    const savedDetail = localStorage.getItem(fullKey);
    if (savedDetail) {
      try {
        const data = JSON.parse(savedDetail);
        
        data.points = data.points.map(p => ({
          ...p,
          hr: p.hr && p.hr > 0 ? p.hr : null
        }));
        
        const calories = calculateCalories(data.points, config.age, config.weight, data.stats);
        data.stats.calories = calories;
        
        const power = calculatePower(data.points, config.weight);
        data.stats.avgWatts = power.avgWatts;
        data.stats.maxWatts = power.maxWatts;
        data.stats.hasPowerMeter = power.hasPowerMeter;

        const dist = data.stats.distanceKm || 0;
        const ele = data.stats.elevationGainM || 0;
        const difficultyScore = dist > 0 ? Math.min(100, Math.round((dist * 1.1 + ele * 0.12) / 1.3)) : 0;
        data.stats.difficultyScore = difficultyScore;

        const avgHr = data.stats.avgHr || 150;
        const avgWatts = data.stats.avgWatts || 170;
        const hrDelta = Math.max(30, avgHr - 60);
        const efficiency = hrDelta > 0 ? avgWatts / hrDelta : 0;
        let fitnessScore = Math.round((efficiency - 0.8) * 35 + 50);
        if (fitnessScore < 10) fitnessScore = 10;
        if (fitnessScore > 100) fitnessScore = 100;
        data.stats.fitnessScore = fitnessScore;

        setSelectedFilename(filename);
        setSelectedActivity(data);
      } catch (e) {
        console.error('Error loading local activity details', e);
      }
    } else {
      const found = list.find(a => a.filename === filename);
      if (found) {
        setSelectedFilename(filename);
        setSelectedActivity(found);
      }
    }
  };

  // Fetch all activities from backend (with offline auto-fallback)
  const fetchActivities = async (selectFilenameDefault = null) => {
    setListLoading(true);
    try {
      const response = await fetch('/api/activities');
      if (response.ok) {
        const data = await response.json();
        setActivities(data);
        setIsLocalMode(false);
        
        if (data.length > 0) {
          const toSelect = selectFilenameDefault || data[0].filename;
          setSelectedFilename(toSelect);
        } else {
          setSelectedActivity(null);
          setSelectedFilename('');
        }
      } else {
        enableLocalMode();
      }
    } catch (err) {
      console.warn('Backend API not available. Switching to Local Standalone Mode:', err);
      enableLocalMode();
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  // Fetch or load detailed activity points
  useEffect(() => {
    if (!selectedFilename) return;

    if (isLocalMode) {
      loadLocalActivity(selectedFilename);
      return;
    }

    const fetchDetail = async () => {
      setDetailLoading(true);
      setActiveClimb(null);
      try {
        const response = await fetch(`/api/activities/${encodeURIComponent(selectedFilename)}`);
        if (response.ok) {
          const data = await response.json();
          
          data.points = data.points.map(p => ({
            ...p,
            hr: p.hr && p.hr > 0 ? p.hr : null
          }));
          
          const calories = calculateCalories(data.points, config.age, config.weight, data.stats);
          data.stats.calories = calories;
          
          const power = calculatePower(data.points, config.weight);
          data.stats.avgWatts = power.avgWatts;
          data.stats.maxWatts = power.maxWatts;
          data.stats.hasPowerMeter = power.hasPowerMeter;
          
          // 4. Calculate route difficulty score (0-100)
          const dist = data.stats.distanceKm || 0;
          const ele = data.stats.elevationGainM || 0;
          const difficultyScore = dist > 0 ? Math.min(100, Math.round((dist * 1.1 + ele * 0.12) / 1.3)) : 0;
          data.stats.difficultyScore = difficultyScore;

          // 5. Calculate cyclist fitness score (0-100)
          const avgHr = data.stats.avgHr || 150;
          const avgWatts = data.stats.avgWatts || 170;
          const hrDelta = Math.max(30, avgHr - 60);
          const efficiency = hrDelta > 0 ? avgWatts / hrDelta : 0;
          let fitnessScore = Math.round((efficiency - 0.8) * 35 + 50);
          if (fitnessScore < 10) fitnessScore = 10;
          if (fitnessScore > 100) fitnessScore = 100;
          data.stats.fitnessScore = fitnessScore;
          
          setSelectedActivity(data);
          
          if (data.stats && data.stats.maxHr) {
            setMaxHr(data.stats.maxHr);
          }
        }
      } catch (err) {
        console.error('Error fetching activity details:', err);
      } finally {
        setDetailLoading(false);
      }
    };

    fetchDetail();
  }, [selectedFilename, isLocalMode, config.age, config.weight]);

  // Handle GPX upload (works in both server and offline local fallback modes)
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileContent = e.target.result;

      if (isLocalMode) {
        try {
          setDetailLoading(true);
          
          // 1. Parse GPX XML client-side in the browser using browser's DOMParser
          const parsedData = parseGPXDataClient(fileContent, file.name);
          
          // 2. Perform custom advanced telemetry injections
          parsedData.points = parsedData.points.map(p => ({
            ...p,
            hr: p.hr && p.hr > 0 ? p.hr : null
          }));
          
          const calories = calculateCalories(parsedData.points, config.age, config.weight, parsedData.stats);
          parsedData.stats.calories = calories;
          
          const power = calculatePower(parsedData.points, config.weight);
          parsedData.stats.avgWatts = power.avgWatts;
          parsedData.stats.maxWatts = power.maxWatts;
          parsedData.stats.hasPowerMeter = power.hasPowerMeter;

          const dist = parsedData.stats.distanceKm || 0;
          const ele = parsedData.stats.elevationGainM || 0;
          const difficultyScore = dist > 0 ? Math.min(100, Math.round((dist * 1.1 + ele * 0.12) / 1.3)) : 0;
          parsedData.stats.difficultyScore = difficultyScore;

          const avgHr = parsedData.stats.avgHr || 150;
          const avgWatts = parsedData.stats.avgWatts || 170;
          const hrDelta = Math.max(30, avgHr - 60);
          const efficiency = hrDelta > 0 ? avgWatts / hrDelta : 0;
          let fitnessScore = Math.round((efficiency - 0.8) * 35 + 50);
          if (fitnessScore < 10) fitnessScore = 10;
          if (fitnessScore > 100) fitnessScore = 100;
          parsedData.stats.fitnessScore = fitnessScore;
          
          // 3. Save parsed full data to localStorage
          const detailKey = `giro_gpx_detail_${file.name}`;
          try {
            localStorage.setItem(detailKey, JSON.stringify(parsedData));
          } catch (storageErr) {
            console.warn('Storage limit exceeded, loaded in memory only.', storageErr);
          }
          
          // 4. Update local activities list
          const summary = {
            filename: file.name,
            name: parsedData.name,
            type: parsedData.type,
            date: parsedData.date,
            stats: parsedData.stats
          };
          
          const updatedList = [summary, ...activities.filter(a => a.filename !== file.name)];
          setActivities(updatedList);
          setSelectedFilename(file.name);
          setSelectedActivity(parsedData);
          
          try {
            localStorage.setItem('giro_gpx_activities', JSON.stringify(updatedList));
          } catch (storageErr) {
            console.warn('Storage limit exceeded for list persistence.', storageErr);
          }
        } catch (parseErr) {
          console.error('Error parsing client-side GPX:', parseErr);
          alert(`Error al procesar el archivo GPX en el navegador: ${parseErr.message}`);
        } finally {
          setDetailLoading(false);
        }
        return;
      }

      // Backend server upload logic
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: file.name,
            fileContent
          })
        });
        
        if (response.ok) {
          const resData = await response.json();
          await fetchActivities(resData.filename);
        } else {
          alert('Error al subir el archivo GPX. Asegúrate de que sea un archivo XML válido.');
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Error de conexión al subir el GPX.');
      }
    };
    reader.readAsText(file);
  };

  // Calculate global summary stats
  const globalStats = activities.reduce(
    (acc, act) => {
      if (act.stats) {
        acc.distance += act.stats.distanceKm || 0;
        acc.elevation += act.stats.elevationGainM || 0;
      }
      return acc;
    },
    { distance: 0, elevation: 0 }
  );

  return (
    <div className="app-container" id="pdf-report">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="5.5" cy="17.5" r="3.5"/>
            <circle cx="18.5" cy="17.5" r="3.5"/>
            <path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 5.5 4-4.5h3m-7 4.5L9 8h4l2 3.5"/>
          </svg>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <h1 className="logo-title">GIRO GPX</h1>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '6px' }}>v{versionData.version}</span>
            </div>
            <div className="logo-subtitle" style={{ color: isLocalMode ? '#00d2ff' : 'var(--text-muted)' }}>
              {isLocalMode ? 'Modo Autónomo Local' : 'Métricas de Ciclismo'}
            </div>
          </div>
        </div>

        {/* Upload new ride & user settings */}
        <div className="upload-box" style={{ display: 'flex', gap: '10px' }}>
          <label className="upload-btn" style={{ flex: 1 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Subir archivo GPX
            <input 
              type="file" 
              accept=".gpx" 
              className="hidden-file-input" 
              onChange={handleFileUpload} 
            />
          </label>
          <button className="config-btn" onClick={() => setIsConfigOpen(true)} title="Configuración de usuario y zonas">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>

        {/* Global summary stats */}
        <div className="global-stats-card">
          <div className="global-stats-title">Estadísticas Totales</div>
          <div className="global-stats-grid">
            <div className="global-stat-item">
              <div className="global-stat-val">{activities.length}</div>
              <div className="global-stat-lbl">Rutas</div>
            </div>
            <div className="global-stat-item">
              <div className="global-stat-val">{globalStats.distance.toFixed(0)} <span style={{ fontSize: '10px' }}>km</span></div>
              <div className="global-stat-lbl">Dist. Total</div>
            </div>
            <div className="global-stat-item">
              <div className="global-stat-val">+{globalStats.elevation.toFixed(0)} <span style={{ fontSize: '10px' }}>m</span></div>
              <div className="global-stat-lbl">Desnivel</div>
            </div>
          </div>
        </div>

        {/* GPX Files list */}
        <div className="activity-list-container">
          <div className="section-title">Tus Entrenamientos</div>
          {listLoading ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>Cargando rutas...</div>
          ) : activities.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>
              {isLocalMode ? 'Sube un archivo GPX local para comenzar.' : 'Arrastra o sube un archivo GPX para comenzar.'}
            </div>
          ) : (
            <div className="activity-list">
              {activities.map((act) => {
                const isActive = act.filename === selectedFilename;
                return (
                  <div 
                    key={act.filename} 
                    className={`activity-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      if (isLocalMode) {
                        loadLocalActivity(act.filename);
                      } else {
                        setSelectedFilename(act.filename);
                      }
                    }}
                  >
                    <div className="act-title">{act.name}</div>
                    <div className="act-date">{formatDate(act.date)}</div>
                    {act.stats && (
                      <div className="act-grid-stats">
                        <div className="act-mini-stat">
                          <span className="act-mini-val">{act.stats.distanceKm || 0}k</span>
                          <span className="act-mini-lbl">Dist.</span>
                        </div>
                        <div className="act-mini-stat">
                          <span className="act-mini-val">
                            {act.stats.movingTimeSec 
                              ? `${Math.floor(act.stats.movingTimeSec / 60)}m` 
                              : '0m'}
                          </span>
                          <span className="act-mini-lbl">Tiempo</span>
                        </div>
                        <div className="act-mini-stat">
                          <span className="act-mini-val">+{act.stats.elevationGainM || 0}m</span>
                          <span className="act-mini-lbl">Desn.</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* PDF Report Button */}
        <ReportButton activity={selectedActivity} config={config} />
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-dashboard">
        {activities.length === 0 ? (
          <div className="glass-card welcome-card">
            <div className="welcome-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h2 className="welcome-title">Bienvenido a Giro GPX</h2>
            <p className="welcome-desc">
              {isLocalMode 
                ? 'Ejecutando en Modo Local. Sube tus archivos GPX para analizarlos al instante directamente en tu navegador de forma privada. Tus rutas se procesan localmente y se guardan en el navegador sin subirse a ningún servidor.'
                : 'Esta aplicación te permite analizar todos los archivos GPX en tu carpeta de manera profesional. Sube tus rutas grabadas con Strava, Garmin, Wahoo o tu móvil para ver mapas interactivos, zonas de frecuencia cardíaca y curvas de rendimiento sincronizadas.'}
            </p>
            <label className="upload-btn" style={{ marginTop: '24px', maxWidth: '240px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Cargar mi primera ruta
              <input 
                type="file" 
                accept=".gpx" 
                className="hidden-file-input" 
                onChange={handleFileUpload} 
              />
            </label>
          </div>
        ) : detailLoading || !selectedActivity ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '16px' }}>
            <div style={{ border: '3px solid rgba(252, 97, 0, 0.1)', borderTop: '3px solid var(--strava-orange)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
            <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Analizando telemetría GPX...</div>
            <style>{`@keyframes spin {0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); }}`}</style>
          </div>
        ) : (
          <>
            {/* Header section of dashboard */}
            <div className="dashboard-header">
              <div className="activity-name-container">
                <h2 className="activity-full-title">{selectedActivity.name}</h2>
                <div className="activity-full-date">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  {formatDate(selectedActivity.date)}
                  <span style={{ color: 'var(--text-muted)' }}>|</span>
                  <span style={{ textTransform: 'capitalize', color: 'var(--strava-orange)', fontWeight: 600 }}>🚴 {selectedActivity.type === 'cycling' ? 'Ciclismo' : selectedActivity.type}</span>
                </div>
              </div>

              {/* Cyclist Profile Info & premium scores badges */}
              {selectedActivity.stats && (
                <div className="header-scores-container" style={{ display: 'flex', gap: '12px' }}>
                  {/* Cyclist Profile Badge */}
                  <div className="header-score-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: 'rgba(255, 255, 255, 0.03)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Ciclista</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {config.name} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)' }}>({config.age} años • {config.weight} kg)</span>
                    </span>
                  </div>

                  {/* Difficulty Badge */}
                  <div className="header-score-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(252, 97, 0, 0.1)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(252, 97, 0, 0.2)' }}>
                    <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Dificultad Ruta</span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--strava-orange)' }}>{selectedActivity.stats.difficultyScore} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/100</span></span>
                  </div>

                  {/* Fitness Badge */}
                  {selectedActivity.stats.avgHr && (
                    <div className="header-score-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(167, 139, 250, 0.1)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(167, 139, 250, 0.2)' }}>
                      <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>Forma Física</span>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#a78bfa' }}>{selectedActivity.stats.fitnessScore} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/100</span></span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dashboard telemetry grid */}
            <DashboardStats stats={selectedActivity.stats} />

            {/* Middle panel with Map, HR zones & Climbs list (3 Columns!) */}
            <div className="mid-panel-grid">
              {/* Map */}
              <RouteMap 
                points={selectedActivity.points} 
                hoverPoint={hoverPoint} 
                activeClimb={activeClimb} 
                onHoverPoint={setHoverPoint}
              />

              {/* HR zones card */}
              <HeartRateZones points={selectedActivity.points} stats={selectedActivity.stats} config={config} />
              
              {/* Detected Climbs card */}
              <div className="glass-card climbs-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <h3 className="hr-zones-title" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                  Puertos y Repechos {selectedActivity.climbs ? `(${selectedActivity.climbs.length})` : '(0)'}
                </h3>
                {selectedActivity.climbs && selectedActivity.climbs.length > 0 ? (
                  <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '340px', paddingRight: '4px' }}>
                    {selectedActivity.climbs.map((climb, index) => {
                      const isHighlighted = activeClimb && activeClimb.name === climb.name;
                      return (
                        <div 
                          key={index} 
                          className={`climb-card ${isHighlighted ? 'active' : ''}`}
                          onMouseEnter={() => setActiveClimb(climb)}
                          onMouseLeave={() => setActiveClimb(null)}
                          onClick={() => setActiveClimb(climb)}
                          style={{
                            borderLeft: isHighlighted ? '4px solid var(--strava-orange)' : '4px solid transparent',
                            background: isHighlighted ? 'rgba(252, 97, 0, 0.05)' : ''
                          }}
                        >
                          <div className="climb-left">
                            <span className="climb-name">⛰️ {climb.name}</span>
                            <span className="climb-sub">km {climb.startKm} • {climb.lengthKm} km</span>
                          </div>
                          <div className="climb-right">
                            <span className="climb-grade-tag" style={{ color: isHighlighted ? 'var(--strava-orange)' : '' }}>{climb.avgGrade}% avg</span>
                            <span className="climb-ele-gain">+{climb.eleGain}m (max {climb.maxGrade}%)</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', margin: 'auto', padding: '20px', lineHeight: '1.4' }}>
                    No se han detectado subidas notables (puertos o repechos) en este recorrido.
                  </div>
                )}
              </div>
            </div>

            {/* Synchronized Recharts charts bottom */}
            <ActivityCharts 
              points={selectedActivity.points} 
              onHoverPoint={setHoverPoint} 
              activeClimb={activeClimb} 
              hoverPoint={hoverPoint}
              hasPowerMeter={selectedActivity.stats.hasPowerMeter}
              hasCadenceSensor={selectedActivity.stats.hasCadenceSensor}
            />
          </>
        )}
      </main>

      {/* SETTINGS MODAL */}
      {isConfigOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                Configuración de Ciclista
              </h3>
              <button className="modal-close" onClick={() => setIsConfigOpen(false)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {valError && (
              <div style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px', fontWeight: 600 }}>
                ⚠️ {valError}
              </div>
            )}

            <div className="config-form-group">
              <label className="config-label">Nombre del Ciclista</label>
              <input 
                type="text" 
                className="config-input" 
                value={tempName} 
                onChange={(e) => setTempName(e.target.value)} 
              />
            </div>

            <div className="config-grid-2">
              <div className="config-form-group">
                <label className="config-label">Edad (años)</label>
                <input 
                  type="number" 
                  className="config-input" 
                  value={tempAge} 
                  onChange={(e) => setTempAge(e.target.value)} 
                />
              </div>
              <div className="config-form-group">
                <label className="config-label">Peso (kg)</label>
                <input 
                  type="number" 
                  step="0.1"
                  className="config-input" 
                  value={tempWeight} 
                  onChange={(e) => setTempWeight(e.target.value)} 
                />
              </div>
            </div>

            <div className="hr-zones-edit-section">
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>Zonas de Pulso (Límites ppm)</h4>
              
              <div className="hr-zone-edit-row">
                <span className="hr-zone-color-lbl"><div className="zone-dot zone-1-bg" /> Z1 Máx</span>
                <span className="hr-zone-range-preview">&lt; {parseInt(tempZ1Max) + 1 || 125} ppm</span>
                <input 
                  type="number" 
                  className="config-input" 
                  value={tempZ1Max} 
                  onChange={(e) => setTempZ1Max(e.target.value)} 
                  style={{ textAlign: 'center' }}
                />
              </div>

              <div className="hr-zone-edit-row">
                <span className="hr-zone-color-lbl"><div className="zone-dot zone-2-bg" /> Z2 Máx</span>
                <span className="hr-zone-range-preview">{parseInt(tempZ1Max) + 1 || 125} - {tempZ2Max} ppm</span>
                <input 
                  type="number" 
                  className="config-input" 
                  value={tempZ2Max} 
                  onChange={(e) => setTempZ2Max(e.target.value)} 
                  style={{ textAlign: 'center' }}
                />
              </div>

              <div className="hr-zone-edit-row">
                <span className="hr-zone-color-lbl"><div className="zone-dot zone-3-bg" /> Z3 Máx</span>
                <span className="hr-zone-range-preview">{parseInt(tempZ2Max) + 1 || 146} - {tempZ3Max} ppm</span>
                <input 
                  type="number" 
                  className="config-input" 
                  value={tempZ3Max} 
                  onChange={(e) => setTempZ3Max(e.target.value)} 
                  style={{ textAlign: 'center' }}
                />
              </div>

              <div className="hr-zone-edit-row">
                <span className="hr-zone-color-lbl"><div className="zone-dot zone-4-bg" /> Z4 Máx</span>
                <span className="hr-zone-range-preview">{parseInt(tempZ3Max) + 1 || 159} - {tempZ4Max} ppm</span>
                <input 
                  type="number" 
                  className="config-input" 
                  value={tempZ4Max} 
                  onChange={(e) => setTempZ4Max(e.target.value)} 
                  style={{ textAlign: 'center' }}
                />
              </div>

              <div className="hr-zone-edit-row">
                <span className="hr-zone-color-lbl"><div className="zone-dot zone-5-bg" /> Z5 Mín</span>
                <span className="hr-zone-range-preview" style={{ textAlign: 'left', gridColumn: 'span 2' }}>&gt; {parseInt(tempZ4Max) || 170} ppm</span>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setIsConfigOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveConfig}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
