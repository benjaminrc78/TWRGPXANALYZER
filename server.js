import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static assets from the compiled React app
app.use(express.static(path.join(__dirname, 'dist')));

// Directory where GPX files are located (current workspace)
const GPX_DIR = __dirname;

// Helper to convert coordinate distance (Haversine Formula)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// 5-Point Rolling Average for smoothing elevation & removing GPS jitter
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

// Parse GPX XML content and calculate statistics
function parseGPXData(xmlContent, filename) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseNodeValue: true,
    parseAttributeValue: true,
  });

  const parsed = parser.parse(xmlContent);
  if (!parsed.gpx || !parsed.gpx.trk) {
    throw new Error('Formato GPX no válido o archivo dañado.');
  }

  const trk = parsed.gpx.trk;
  const name = trk.name || filename.replace('.gpx', '');
  const type = trk.type || 'cycling';

  // Handle single track segment or multiple segments
  let trksegs = [];
  if (Array.isArray(trk.trkseg)) {
    trksegs = trk.trkseg;
  } else if (trk.trkseg) {
    trksegs = [trk.trkseg];
  } else {
    throw new Error('No se encontraron segmentos de track en el GPX.');
  }

  // Flatten all trackpoints
  let rawPoints = [];
  for (const seg of trksegs) {
    if (seg.trkpt) {
      if (Array.isArray(seg.trkpt)) {
        rawPoints = rawPoints.concat(seg.trkpt);
      } else {
        rawPoints.push(seg.trkpt);
      }
    }
  }

  if (rawPoints.length === 0) {
    throw new Error('No se encontraron puntos de track en el GPX.');
  }

  // Map raw points into structured, clean data
  const points = rawPoints.map((pt, index) => {
    const lat = parseFloat(pt['@_lat']);
    const lon = parseFloat(pt['@_lon']);
    const ele = pt.ele !== undefined ? parseFloat(pt.ele) : 0;
    const time = pt.time ? new Date(pt.time) : null;

    // Resolve heart rate in extensions
    let hr = null;
    if (pt.extensions) {
      const ext = pt.extensions;
      if (ext['gpxtpx:TrackPointExtension'] && ext['gpxtpx:TrackPointExtension']['gpxtpx:hr'] !== undefined) {
        hr = parseInt(ext['gpxtpx:TrackPointExtension']['gpxtpx:hr'], 10);
      } else if (ext.TrackPointExtension && ext.TrackPointExtension.hr !== undefined) {
        hr = parseInt(ext.TrackPointExtension.hr, 10);
      } else if (ext.hr !== undefined) {
        hr = parseInt(ext.hr, 10);
      }
    }

    // Resolve power/watts in extensions or direct tags
    let watts = null;
    if (pt.power !== undefined) {
      watts = parseInt(pt.power, 10);
    } else if (pt.watts !== undefined) {
      watts = parseInt(pt.watts, 10);
    } else if (pt.extensions) {
      const ext = pt.extensions;
      if (ext['gpxtpx:TrackPointExtension'] && ext['gpxtpx:TrackPointExtension']['gpxtpx:watts'] !== undefined) {
        watts = parseInt(ext['gpxtpx:TrackPointExtension']['gpxtpx:watts'], 10);
      } else if (ext['gpxtpx:TrackPointExtension'] && ext['gpxtpx:TrackPointExtension']['gpxtpx:power'] !== undefined) {
        watts = parseInt(ext['gpxtpx:TrackPointExtension']['gpxtpx:power'], 10);
      } else if (ext.TrackPointExtension && ext.TrackPointExtension.watts !== undefined) {
        watts = parseInt(ext.TrackPointExtension.watts, 10);
      } else if (ext.TrackPointExtension && ext.TrackPointExtension.power !== undefined) {
        watts = parseInt(ext.TrackPointExtension.power, 10);
      } else if (ext.watts !== undefined) {
        watts = parseInt(ext.watts, 10);
      } else if (ext.power !== undefined) {
        watts = parseInt(ext.power, 10);
      }
    }

    // Resolve cadence in extensions
    let cadence = null;
    if (pt.extensions) {
      const ext = pt.extensions;
      if (ext['gpxtpx:TrackPointExtension'] && ext['gpxtpx:TrackPointExtension']['gpxtpx:cad'] !== undefined) {
        cadence = parseInt(ext['gpxtpx:TrackPointExtension']['gpxtpx:cad'], 10);
      } else if (ext['gpxtpx:TrackPointExtension'] && ext['gpxtpx:TrackPointExtension']['gpxtpx:cadence'] !== undefined) {
        cadence = parseInt(ext['gpxtpx:TrackPointExtension']['gpxtpx:cadence'], 10);
      } else if (ext.TrackPointExtension && ext.TrackPointExtension.cad !== undefined) {
        cadence = parseInt(ext.TrackPointExtension.cad, 10);
      } else if (ext.TrackPointExtension && ext.TrackPointExtension.cadence !== undefined) {
        cadence = parseInt(ext.TrackPointExtension.cadence, 10);
      } else if (ext.cad !== undefined) {
        cadence = parseInt(ext.cad, 10);
      } else if (ext.cadence !== undefined) {
        cadence = parseInt(ext.cadence, 10);
      }
    }
    if (cadence === null) {
      if (pt.cad !== undefined) {
        cadence = parseInt(pt.cad, 10);
      } else if (pt.cadence !== undefined) {
        cadence = parseInt(pt.cadence, 10);
      }
    }

    return {
      index,
      lat,
      lon,
      ele,
      time,
      hr: hr !== null && !isNaN(hr) ? hr : null,
      watts: watts !== null && !isNaN(watts) ? watts : null,
      cadence: cadence !== null && !isNaN(cadence) ? cadence : null,
    };
  });

  // Basic time metrics
  const startTime = points[0].time;
  const endTime = points[points.length - 1].time;
  const totalDuration = startTime && endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : 0; // seconds

  // Smooth elevation to remove altimeter noise
  const rawElevations = points.map(p => p.ele);
  const smoothedElevations = smoothSeries(rawElevations, 7);

  const hasCadenceSensor = points.some(p => p.cadence !== null && p.cadence > 0);

  // Stats calculation loop
  let cumulativeDistance = 0; // km
  let cumulativeAscent = 0; // m
  let cumulativeDescent = 0; // m
  let movingTime = 0; // seconds
  let hrSum = 0;
  let hrCount = 0;
  let maxHr = 0;

  const pointsWithTelemetry = [points[0]];
  points[0].distance = 0;
  points[0].speed = 0;
  points[0].grade = 0;
  points[0].cadence = points[0].cadence || 0;

  if (points[0].hr && points[0].hr > 0) {
    hrSum += points[0].hr;
    hrCount++;
    maxHr = points[0].hr;
  }

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    // Distance delta
    const dDist = haversine(prev.lat, prev.lon, curr.lat, curr.lon); // km
    cumulativeDistance += dDist;

    // Time delta
    let dTime = 0;
    if (prev.time && curr.time) {
      dTime = (curr.time.getTime() - prev.time.getTime()) / 1000; // seconds
    }

    // Altitude delta (using smoothed elevations)
    const dEle = smoothedElevations[i] - smoothedElevations[i - 1];
    if (dEle > 0) {
      cumulativeAscent += dEle;
    } else {
      cumulativeDescent += Math.abs(dEle);
    }

    // Frecuencia Cardíaca
    if (curr.hr && curr.hr > 0) {
      hrSum += curr.hr;
      hrCount++;
      if (curr.hr > maxHr) maxHr = curr.hr;
    }

    // Instant speed (km/h)
    let speed = 0;
    if (dTime > 0) {
      speed = (dDist / dTime) * 3600; // km/h
    }

    // Sanity filter for unrealistic GPS spikes
    if (speed > 90) speed = prev.speed || 0;

    // Filter moving time: speed > 1.8 km/h and time gap is reasonable (< 30 seconds)
    // If there is an enormous gap (e.g. paused device), we don't count it as moving time
    if (speed > 1.8 && dTime < 60) {
      movingTime += dTime;
    }

    // Slope/grade (%)
    let grade = 0;
    if (dDist > 0) {
      grade = (dEle / (dDist * 1000)) * 100;
    }
    // Cap slope at reasonable values
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

  // Smooth speeds for charts (10-point rolling average)
  const speeds = pointsWithTelemetry.map(p => p.speed);
  const smoothedSpeeds = smoothSeries(speeds, 11);
  pointsWithTelemetry.forEach((p, idx) => {
    p.speed = parseFloat(smoothedSpeeds[idx].toFixed(1));
  });

  const avgSpeed = movingTime > 0 ? (cumulativeDistance / movingTime) * 3600 : 0;
  const maxSpeed = Math.max(...pointsWithTelemetry.map(p => p.speed));
  const avgHr = hrCount > 0 ? Math.round(hrSum / hrCount) : null;

  // Auto-detect climbs (sustained gradient > 2.5% for at least 400m)
  const climbs = [];
  let climbStartIdx = null;

  for (let i = 1; i < pointsWithTelemetry.length; i++) {
    const pt = pointsWithTelemetry[i];
    // Check if slope is positive
    if (pt.grade > 1.5) {
      if (climbStartIdx === null) {
        climbStartIdx = i - 1;
      }
    } else if (pt.grade < 0) {
      if (climbStartIdx !== null) {
        const startPt = pointsWithTelemetry[climbStartIdx];
        const endPt = pointsWithTelemetry[i - 1];
        const distDiff = endPt.distance - startPt.distance; // km
        const eleDiff = endPt.ele - startPt.ele; // m
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

  // Handle case where GPX ends on a climb
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
      maxHr: hrCount > 0 ? maxHr : null,
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

// Simple in-memory cache for parsed GPX files to prevent high-CPU re-parsing
const gpxCache = new Map();

function getParsedGPXWithCache(filename) {
  const filePath = path.join(GPX_DIR, filename);
  const stats = fs.statSync(filePath);
  const cacheKey = filename;
  
  const cached = gpxCache.get(cacheKey);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    return cached.parsedData;
  }
  
  // Cache miss or file changed: read and parse
  const xmlContent = fs.readFileSync(filePath, 'utf-8');
  const parsedData = parseGPXData(xmlContent, filename);
  
  gpxCache.set(cacheKey, {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    parsedData
  });
  
  return parsedData;
}

// Endpoint 1: List all GPX files with metadata summaries (using cache for instant response)
app.get('/api/activities', async (req, res) => {
  try {
    const files = fs.readdirSync(GPX_DIR);
    const gpxFiles = files.filter(f => f.toLowerCase().endsWith('.gpx'));

    const activities = [];

    for (const filename of gpxFiles) {
      try {
        const fullData = getParsedGPXWithCache(filename);
        // Exclude full trackpoints for listing to keep payload small
        const { points, ...summary } = fullData;
        activities.push(summary);
      } catch (err) {
        console.error(`Error parsing GPX file: ${filename}`, err);
        // Return basic metadata if parse fails entirely
        try {
          const stats = fs.statSync(path.join(GPX_DIR, filename));
          activities.push({
            filename,
            name: filename.replace('.gpx', ''),
            date: stats.mtime.toISOString(),
            error: `Error al procesar archivo GPX: ${err.message}`,
            stats: { distanceKm: 0, movingTimeSec: 0, elevationGainM: 0 }
          });
        } catch (statErr) {
          console.error(`Error getting stats for file: ${filename}`, statErr);
        }
      }
    }

    // Sort by date descending
    activities.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(activities);
  } catch (err) {
    console.error('Error reading GPX directory:', err);
    res.status(500).json({ error: 'No se pudo leer la carpeta de archivos GPX.' });
  }
});

// Endpoint 2: Get full details of a specific GPX activity (including trackpoints, from cache)
app.get('/api/activities/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(GPX_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo GPX no encontrado.' });
  }

  try {
    const fullData = getParsedGPXWithCache(filename);
    res.json(fullData);
  } catch (err) {
    console.error(`Error parsing GPX details for ${filename}:`, err);
    res.status(500).json({ error: `Error al procesar el archivo GPX: ${err.message}` });
  }
});

// Endpoint 3: Upload a new GPX file to the directory
app.post('/api/upload', (req, res) => {
  const { filename, fileContent } = req.body;

  if (!filename || !fileContent) {
    return res.status(400).json({ error: 'Nombre de archivo o contenido ausente.' });
  }

  const safeFilename = path.basename(filename);
  if (!safeFilename.toLowerCase().endsWith('.gpx')) {
    return res.status(400).json({ error: 'El archivo debe tener la extensión .gpx.' });
  }

  const filePath = path.join(GPX_DIR, safeFilename);

  try {
    fs.writeFileSync(filePath, fileContent, 'utf-8');
    res.json({ message: 'Archivo GPX guardado con éxito!', filename: safeFilename });
  } catch (err) {
    console.error('Error saving GPX file:', err);
    res.status(500).json({ error: 'No se pudo guardar el archivo GPX en el servidor.' });
  }
});

// Catch-all route to serve the React SPA index.html
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('Frontend no compilado en dist. Ejecuta npm run build.');
  }
});

app.listen(PORT, () => {
  console.log(`GPX Server running at http://localhost:${PORT}`);
});
