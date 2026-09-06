const J_PER_KWH = 3.6e6;

export function parseEso(text) {
  const lines = text.split(/\r?\n/);
  const dictionary = new Map();
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === 'End of Data Dictionary') {
      i++;
      break;
    }
    const parts = line.split(',');
    if (parts.length < 4) continue;
    const id = parts[0];
    const count = Number(parts[1]);
    if (!Number.isInteger(count)) continue;
    dictionary.set(id, {
      id,
      count,
      key: parts[2],
      name: parts.slice(3).join(',').replace(/\s+!.*$/, '').trim(),
      raw: line,
    });
  }

  const series = new Map();
  const timestamps = [];
  let current = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line === 'End of Data') continue;
    const parts = line.split(',');
    const id = parts[0];
    if (id === '2') {
      current = {
        dayOfSimulation: Number(parts[1]),
        month: Number(parts[2]),
        day: Number(parts[3]),
        hour: Number(parts[5]),
        startMinute: Number(parts[6]),
        endMinute: Number(parts[7]),
      };
      timestamps.push(current);
      continue;
    }
    const meta = dictionary.get(id);
    if (!meta || meta.count !== 1) continue;
    const value = Number(parts[1]);
    if (!Number.isFinite(value)) continue;
    const key = `${meta.key}|${meta.name}`;
    if (!series.has(key)) series.set(key, { meta, values: [], timestamps: [] });
    const row = series.get(key);
    row.values.push(value);
    row.timestamps.push(current);
  }

  return { dictionary, series, timestamps };
}

// ESO dictionary names always carry a trailing units suffix, e.g.
// "Zone Ideal Loads Supply Air Total Heating Energy [J]" — callers pass the
// bare variable name (matching Output:Variable's variable_name field, which
// has no units), so strip the suffix before comparing. Without this, every
// annualSums/monthlySums/hourlyPeaks/euiBreakdown call silently matched
// nothing and returned {} with no error.
function stripUnits(name) {
  return name.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
}

function findSeries(esoData, variableName) {
  return [...esoData.series.values()].filter(s => stripUnits(s.meta.name) === variableName);
}

/**
 * Specification 34 comfort screen. A zone's occupied floor area qualifies
 * when its Fanger PMV is between -1 and +1 for at least 98% of NCC hours of
 * operation: hours when whole-building occupancy is greater than 20% of its
 * peak. The returned area percentage is tested against J1V3's 95%
 * occupied-floor-area threshold.
 */
export function buildFangerComfort(esoData, floorAreaByZone = {}, zoneNamesByKey = {}) {
  const pmvSeries = findSeries(esoData, 'Zone Thermal Comfort Fanger Model PMV');
  const peopleSeries = findSeries(esoData, 'Zone People Occupant Count');
  const sourceRows = Object.entries(floorAreaByZone).map(([zoneUpperRaw, rawArea]) => {
    const zoneUpper = String(zoneUpperRaw).toUpperCase();
    const pmv = pmvSeries.find(series => {
      const key = String(series.meta.key).toUpperCase();
      return key === zoneUpper || key.startsWith(`${zoneUpper}_`);
    });
    const occupants = peopleSeries.find(series => {
      const key = String(series.meta.key).toUpperCase();
      return key === zoneUpper || key.startsWith(`${zoneUpper}_`);
    });
    return { zoneUpper, areaM2:Math.max(0, Number(rawArea) || 0), pmv, occupants };
  });

  // NCC Schedule 1 defines an hour of operation as one in which total
  // building occupancy is greater than 20% of peak occupancy. Derive that
  // mask from all occupied model zones; HVAC availability is deliberately
  // not used as a proxy for occupancy.
  const annualHours = Math.max(0, ...sourceRows.map(row => row.occupants?.values?.length || 0));
  const buildingOccupancy = Array(annualHours).fill(0);
  for (const row of sourceRows) {
    for (let i = 0; i < (row.occupants?.values?.length || 0); i++) {
      buildingOccupancy[i] += Math.max(0, Number(row.occupants.values[i]) || 0);
    }
  }
  const peakBuildingOccupancy = Math.max(0, ...buildingOccupancy);
  const operationThresholdOccupancy = peakBuildingOccupancy * 0.20;
  const operationMask = buildingOccupancy.map(value =>
    peakBuildingOccupancy > 0 && value > operationThresholdOccupancy);
  const annualOperatingHours = operationMask.filter(Boolean).length;
  const rows = [];
  for (const { zoneUpper, areaM2, pmv, occupants } of sourceRows) {
    if (!pmv || !occupants) {
      rows.push({ zoneKey:zoneUpper, displayName:zoneNamesByKey[zoneUpper] || zoneUpper,
        areaM2, occupiedTimesteps:annualOperatingHours, operatingHours:annualOperatingHours,
        validPmvTimesteps:0, passingTimesteps:0,
        tooColdTimesteps:0, tooWarmTimesteps:0, pmvMin:null, pmvMax:null,
        passingPercent:null, qualifies:false });
      continue;
    }
    const count = Math.min(pmv.values.length, operationMask.length);
    let occupiedTimesteps = 0, validPmvTimesteps = 0, passingTimesteps = 0;
    let tooColdTimesteps = 0, tooWarmTimesteps = 0, pmvMin = Infinity, pmvMax = -Infinity;
    for (let i = 0; i < count; i++) {
      if (!operationMask[i]) continue;
      occupiedTimesteps++;
      const value = Number(pmv.values[i]);
      if (!Number.isFinite(value)) continue;
      validPmvTimesteps++;
      pmvMin = Math.min(pmvMin, value);
      pmvMax = Math.max(pmvMax, value);
      if (value < -1) tooColdTimesteps++;
      else if (value > 1) tooWarmTimesteps++;
      else passingTimesteps++;
    }
    const passingPercent = occupiedTimesteps > 0 ? passingTimesteps / occupiedTimesteps * 100 : null;
    rows.push({ zoneKey:zoneUpper, displayName:zoneNamesByKey[zoneUpper] || zoneUpper,
      areaM2, occupiedTimesteps, operatingHours:occupiedTimesteps,
      validPmvTimesteps, passingTimesteps,
      tooColdTimesteps, tooWarmTimesteps,
      pmvMin:Number.isFinite(pmvMin) ? pmvMin : null,
      pmvMax:Number.isFinite(pmvMax) ? pmvMax : null,
      passingPercent,
      qualifies:passingPercent != null && passingPercent >= 98 });
  }
  const totalAreaM2 = rows.reduce((sum, row) => sum + row.areaM2, 0);
  const assessedAreaM2 = rows.filter(row => row.passingPercent != null).reduce((sum, row) => sum + row.areaM2, 0);
  const passingAreaM2 = rows.filter(row => row.qualifies).reduce((sum, row) => sum + row.areaM2, 0);
  const assessed = rows.filter(row => row.passingPercent != null);
  return {
    method:'Fanger PMV', sourceTimestep:'Hourly', pmvRange:[-1, 1],
    hoursOfOperationDefinition:'Whole-building occupancy greater than 20% of peak occupancy',
    operationOccupancyThresholdPercent:20, peakBuildingOccupancy,
    operationThresholdOccupancy, annualOperatingHours,
    occupiedHoursThresholdPercent:98, floorAreaThresholdPercent:95,
    totalAreaM2, assessedAreaM2, passingAreaM2,
    areaPassingPercent:totalAreaM2 > 0 ? passingAreaM2 / totalAreaM2 * 100 : null,
    minimumOccupiedHoursPassingPercent:assessed.length
      ? Math.min(...assessed.map(row => row.passingPercent)) : null,
    complete:assessedAreaM2 >= totalAreaM2 - 1e-9,
    zones:rows,
  };
}

export function annualSums(esoData, variableName) {
  return Object.fromEntries(findSeries(esoData, variableName).map(s => [
    s.meta.key,
    s.values.reduce((a, b) => a + b, 0),
  ]));
}

const INCIDENT_SOLAR_VARIABLE = 'Surface Outside Face Incident Solar Radiation Rate per Area';
const TRANSMITTED_SOLAR_VARIABLE = 'Surface Window Transmitted Solar Radiation Energy';

function normalizedSums(sums) {
  return Object.fromEntries(Object.entries(sums).map(([key, value]) => [String(key).toUpperCase(), value]));
}

function solarAccumulator(key, label, assembly = null, orientation = null) {
  return {
    key, label, assembly, orientation,
    areaM2: 0,
    incidentKWh: 0,
    incidentKWhM2: null,
    transmittedKWh: 0,
    transmittedKWhM2: null,
    hasIncident: false,
    hasTransmitted: false,
  };
}

function addSolarEntry(target, entry, incidentKWhM2, transmittedKWh) {
  const area = Math.max(0, Number(entry.areaM2) || 0);
  target.areaM2 += area;
  if (incidentKWhM2 != null && Number.isFinite(incidentKWhM2)) {
    target.incidentKWh += incidentKWhM2 * area;
    target.hasIncident = true;
  }
  if (transmittedKWh != null && Number.isFinite(transmittedKWh)) {
    target.transmittedKWh += transmittedKWh;
    target.hasTransmitted = true;
  }
}

function finishSolarEntry(target) {
  target.incidentKWhM2 = target.hasIncident && target.areaM2 > 0 ? target.incidentKWh / target.areaM2 : null;
  target.transmittedKWhM2 = target.hasTransmitted && target.areaM2 > 0 ? target.transmittedKWh / target.areaM2 : null;
  return target;
}

/**
 * Reduces hourly EnergyPlus surface streams into annual, area-weighted map
 * values. `manifest` is emitted by btmToEpjson and preserves the original
 * BTM ids when pitched roofs/skylights are split into EnergyPlus facets.
 */
export function buildAnnualSurfaceSolar(esoData, manifest = []) {
  const incidentSums = normalizedSums(annualSums(esoData, INCIDENT_SOLAR_VARIABLE));
  const transmittedSums = normalizedSums(annualSums(esoData, TRANSMITTED_SOLAR_VARIABLE));
  const sourceGroups = new Map();
  const assemblyGroups = new Map();
  const orientationGroups = new Map();
  const assemblyLabels = { wall: 'Walls', window: 'Windows', roof: 'Roofs' };

  for (const entry of manifest) {
    if (!entry?.epName || !entry?.sourceId || !entry?.assembly) continue;
    const epKey = String(entry.epName).toUpperCase();
    // Hourly "Rate per Area" values are hourly averages in W/m2. Summing
    // 8760 hourly values and dividing by 1000 yields annual kWh/m2.
    const incidentKWhM2 = Object.hasOwn(incidentSums, epKey) ? incidentSums[epKey] / 1000 : null;
    // The window stream is already an energy quantity in joules.
    const transmittedKWh = entry.kind === 'window' && Object.hasOwn(transmittedSums, epKey)
      ? transmittedSums[epKey] / J_PER_KWH : null;
    // surfaceManifest also carries ground floors for the monthly envelope
    // balance. Do not let entries without a solar stream create empty rows
    // in the annual incident/transmitted-solar views.
    if (incidentKWhM2 == null && transmittedKWh == null) continue;

    const sourceKey = `${entry.kind}:${entry.sourceId}`;
    if (!sourceGroups.has(sourceKey)) {
      sourceGroups.set(sourceKey, {
        ...solarAccumulator(sourceKey, String(entry.sourceId), entry.assembly),
        sourceId: entry.sourceId,
        kind: entry.kind,
        hostSourceId: entry.hostSourceId || null,
      });
    }
    addSolarEntry(sourceGroups.get(sourceKey), entry, incidentKWhM2, transmittedKWh);

    if (!assemblyGroups.has(entry.assembly)) {
      assemblyGroups.set(entry.assembly, solarAccumulator(
        entry.assembly, assemblyLabels[entry.assembly] || entry.assembly, entry.assembly));
    }
    addSolarEntry(assemblyGroups.get(entry.assembly), entry, incidentKWhM2, transmittedKWh);

    const orientation = entry.orientation || 'Unknown';
    const orientationKey = `${entry.assembly}:${orientation}`;
    if (!orientationGroups.has(orientationKey)) {
      orientationGroups.set(orientationKey, solarAccumulator(
        orientationKey,
        `${orientation} ${assemblyLabels[entry.assembly] || entry.assembly}`,
        entry.assembly,
        orientation));
    }
    addSolarEntry(orientationGroups.get(orientationKey), entry, incidentKWhM2, transmittedKWh);
  }

  const assemblyOrder = { wall: 0, window: 1, roof: 2 };
  const orientationOrder = { N: 0, E: 1, S: 2, W: 3, Horizontal: 4, Unknown: 5 };
  const surfaceValues = Object.fromEntries([...sourceGroups.values()].map(finishSolarEntry).map(v => [v.sourceId, v]));
  const assemblies = [...assemblyGroups.values()].map(finishSolarEntry)
    .sort((a, b) => (assemblyOrder[a.assembly] ?? 99) - (assemblyOrder[b.assembly] ?? 99));
  const orientations = [...orientationGroups.values()].map(finishSolarEntry)
    .sort((a, b) => (assemblyOrder[a.assembly] ?? 99) - (assemblyOrder[b.assembly] ?? 99)
      || (orientationOrder[a.orientation] ?? 99) - (orientationOrder[b.orientation] ?? 99));

  const rangeFor = field => {
    const values = Object.values(surfaceValues).map(v => v[field]).filter(Number.isFinite);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : { min: null, max: null };
  };
  return {
    surfaceValues,
    assemblies,
    orientations,
    ranges: {
      incident: rangeFor('incidentKWhM2'),
      transmitted: rangeFor('transmittedKWhM2'),
    },
  };
}

export function monthlySums(esoData, variableName) {
  const out = {};
  for (const s of findSeries(esoData, variableName)) {
    const bins = Array(12).fill(0);
    s.values.forEach((v, i) => {
      const month = s.timestamps[i]?.month;
      if (month >= 1 && month <= 12) bins[month - 1] += v;
    });
    out[s.meta.key] = bins;
  }
  return out;
}

// Non-envelope heat-balance terms used by the browser dashboard. Envelope
// conduction and solar are assembled separately at surface level below so
// walls, roofs, floors, window conduction, and window solar stay distinct.
export const ENERGY_BALANCE_COMPONENTS = Object.freeze([
  {
    key: 'peopleGains', label: 'People gains', sign: 1,
    variables: ['Zone People Total Heating Energy'],
  },
  {
    key: 'lightingGains', label: 'Lighting gains', sign: 1,
    variables: ['Zone Lights Total Heating Energy'],
  },
  {
    key: 'equipmentGains', label: 'Equipment gains', sign: 1,
    variables: ['Zone Electric Equipment Total Heating Energy'],
  },
  {
    key: 'airExchangeGains', label: 'Air exchange gains', sign: 1,
    variables: ['Zone Infiltration Total Heat Gain Energy', 'Zone Ventilation Total Heat Gain Energy'],
  },
  {
    key: 'heatingInput', label: 'Heating input', sign: 1,
    variables: ['Zone Ideal Loads Supply Air Total Heating Energy'],
  },
  {
    key: 'coolingRemoval', label: 'Cooling removal', sign: -1,
    variables: ['Zone Ideal Loads Supply Air Total Cooling Energy'],
  },
  {
    key: 'airExchangeLosses', label: 'Air exchange losses', sign: -1,
    variables: ['Zone Infiltration Total Heat Loss Energy', 'Zone Ventilation Total Heat Loss Energy'],
  },
]);

const LEGACY_ENVELOPE_BALANCE_COMPONENTS = Object.freeze([
  {
    key: 'windowGains', label: 'Window + solar gains', sign: 1,
    variables: ['Zone Windows Total Heat Gain Energy'],
  },
  {
    key: 'fabricGains', label: 'Fabric gains', sign: 1,
    variables: ['Zone Opaque Surface Inside Faces Conduction Heat Gain Energy'],
  },
  {
    key: 'fabricLosses', label: 'Fabric losses', sign: -1,
    variables: ['Zone Opaque Surface Inside Faces Conduction Heat Loss Energy'],
  },
  {
    key: 'windowLosses', label: 'Window losses', sign: -1,
    variables: ['Zone Windows Total Heat Loss Energy'],
  },
]);

const OPAQUE_SURFACE_CONDUCTION_VARIABLE = 'Surface Inside Face Conduction Heat Transfer Energy';
const WINDOW_NET_HEAT_RATE_VARIABLE = 'Surface Window Net Heat Transfer Rate';
const WINDOW_TRANSMITTED_SOLAR_VARIABLE = 'Surface Window Transmitted Solar Radiation Energy';

function buildReportedBalanceComponent(esoData, definition) {
  const availableVariables = definition.variables.filter(variable => findSeries(esoData, variable).length > 0);
  if (!availableVariables.length) return null;
  const monthlyKWh = Array(12).fill(0);
  for (const variable of availableVariables) {
    for (const values of Object.values(monthlySums(esoData, variable))) {
      values.forEach((joules, month) => { monthlyKWh[month] += joules / J_PER_KWH; });
    }
  }
  return {
    ...definition,
    variables: [...availableVariables],
    monthlyKWh,
    annualKWh: monthlyKWh.reduce((sum, value) => sum + value, 0),
  };
}

function sumManifestMonthly(esoData, variable, manifest, predicate, divisor) {
  const targetKeys = new Set((manifest || [])
    .filter(entry => entry?.epName && predicate(entry))
    .map(entry => String(entry.epName).toUpperCase()));
  const monthly = Array(12).fill(0);
  let seriesCount = 0;
  for (const [rawKey, values] of Object.entries(monthlySums(esoData, variable))) {
    if (!targetKeys.has(String(rawKey).toUpperCase())) continue;
    seriesCount++;
    values.forEach((value, month) => { monthly[month] += value / divisor; });
  }
  return { available:seriesCount > 0, monthlyKWh:monthly, seriesCount };
}

function signedEnvelopeComponent(key, label, monthlyKWh, variables, surfaceCount) {
  return {
    key, label, sign:0, valueMode:'signed', variables, surfaceCount,
    monthlyKWh,
    annualKWh:monthlyKWh.reduce((sum, value) => sum + value, 0),
    annualAbsoluteKWh:monthlyKWh.reduce((sum, value) => sum + Math.abs(value), 0),
  };
}

function buildElementEnvelopeComponents(esoData, surfaceManifest) {
  const components = [];
  const opaqueDefinitions = [
    { key:'wallConduction', label:'Walls', assembly:'wall' },
    { key:'roofConduction', label:'Roofs', assembly:'roof' },
    { key:'floorConduction', label:'Floors', assembly:'floor' },
  ];
  for (const definition of opaqueDefinitions) {
    const series = sumManifestMonthly(
      esoData, OPAQUE_SURFACE_CONDUCTION_VARIABLE, surfaceManifest,
      entry => entry.kind === 'surface' && entry.assembly === definition.assembly,
      J_PER_KWH,
    );
    if (!series.available) continue;
    components.push(signedEnvelopeComponent(
      definition.key, definition.label, series.monthlyKWh,
      [OPAQUE_SURFACE_CONDUCTION_VARIABLE], series.seriesCount,
    ));
  }

  const windowPredicate = entry => entry.kind === 'window' && entry.assembly === 'window';
  const solar = sumManifestMonthly(
    esoData, WINDOW_TRANSMITTED_SOLAR_VARIABLE, surfaceManifest,
    windowPredicate, J_PER_KWH,
  );
  if (solar.available) {
    components.push({
      key:'windowSolar', label:'Window solar radiation', sign:1,
      variables:[WINDOW_TRANSMITTED_SOLAR_VARIABLE], surfaceCount:solar.seriesCount,
      monthlyKWh:solar.monthlyKWh,
      annualKWh:solar.monthlyKWh.reduce((sum, value) => sum + value, 0),
    });
  }

  // EnergyPlus reports the net window heat-transfer rate with transmitted
  // solar included. Subtracting the independently reported solar energy
  // leaves the non-solar glazing/frame transfer requested as "conduction".
  const netWindow = sumManifestMonthly(
    esoData, WINDOW_NET_HEAT_RATE_VARIABLE, surfaceManifest,
    windowPredicate, 1000, // hourly average W summed across hours -> kWh
  );
  if (netWindow.available) {
    const monthlyKWh = netWindow.monthlyKWh.map((value, month) =>
      value - (solar.available ? solar.monthlyKWh[month] : 0));
    components.push(signedEnvelopeComponent(
      'windowConduction', 'Window conduction', monthlyKWh,
      solar.available
        ? [WINDOW_NET_HEAT_RATE_VARIABLE, WINDOW_TRANSMITTED_SOLAR_VARIABLE]
        : [WINDOW_NET_HEAT_RATE_VARIABLE],
      netWindow.seriesCount,
    ));
  }
  return components;
}

export function energyBalanceMonthlyContribution(component, month) {
  const value = Number(component?.monthlyKWh?.[month]) || 0;
  return component?.valueMode === 'signed' || component?.sign === 0
    ? value : (component?.sign < 0 ? -Math.max(0, value) : Math.max(0, value));
}

/**
 * Adapt hourly ESO heat-balance streams into chart-ready monthly kWh.
 * Missing variables are omitted instead of being invented as zero series;
 * genuine reported zero-valued series are preserved.
 */
export function buildMonthlyEnergyBalance(esoData, surfaceManifest = []) {
  const reported = new Map(ENERGY_BALANCE_COMPONENTS
    .map(definition => buildReportedBalanceComponent(esoData, definition))
    .filter(Boolean)
    .map(component => [component.key, component]));
  const legacyEnvelope = new Map(LEGACY_ENVELOPE_BALANCE_COMPONENTS
    .map(definition => buildReportedBalanceComponent(esoData, definition))
    .filter(Boolean)
    .map(component => [component.key, component]));
  const elementEnvelope = new Map(buildElementEnvelopeComponents(esoData, surfaceManifest)
    .map(component => [component.key, component]));
  // A browser may briefly combine a newly loaded results worker with a
  // cached exporter that did not yet request the per-window net-rate stream.
  // The older zone totals still provide the exact net window transfer; use
  // them with the new solar series to keep conduction visible without
  // double-counting solar while the versioned exporter refreshes.
  if (elementEnvelope.has('windowSolar') && !elementEnvelope.has('windowConduction')) {
    const gains = legacyEnvelope.get('windowGains');
    const losses = legacyEnvelope.get('windowLosses');
    if (gains || losses) {
      const solar = elementEnvelope.get('windowSolar');
      const monthlyKWh = Array.from({ length:12 }, (_, month) =>
        (gains?.monthlyKWh?.[month] || 0) - (losses?.monthlyKWh?.[month] || 0) -
        (solar.monthlyKWh[month] || 0));
      elementEnvelope.set('windowConduction', signedEnvelopeComponent(
        'windowConduction', 'Window conduction', monthlyKWh,
        [...(gains?.variables || []), ...(losses?.variables || []), ...solar.variables],
        solar.surfaceCount,
      ));
    }
  }
  const hasOpaqueElements = ['wallConduction', 'roofConduction', 'floorConduction']
    .some(key => elementEnvelope.has(key));
  const hasWindowElements = elementEnvelope.has('windowSolar') || elementEnvelope.has('windowConduction');
  const components = [];
  const add = (map, key) => { if (map.has(key)) components.push(map.get(key)); };

  add(reported, 'peopleGains');
  add(reported, 'lightingGains');
  add(reported, 'equipmentGains');
  if (hasWindowElements) add(elementEnvelope, 'windowSolar');
  else add(legacyEnvelope, 'windowGains');
  if (hasOpaqueElements) {
    add(elementEnvelope, 'wallConduction');
    add(elementEnvelope, 'roofConduction');
    add(elementEnvelope, 'floorConduction');
  } else {
    add(legacyEnvelope, 'fabricGains');
    add(legacyEnvelope, 'fabricLosses');
  }
  if (hasWindowElements) add(elementEnvelope, 'windowConduction');
  else add(legacyEnvelope, 'windowLosses');
  add(reported, 'airExchangeGains');
  add(reported, 'heatingInput');
  add(reported, 'coolingRemoval');
  add(reported, 'airExchangeLosses');

  const positiveMonthlyKWh = Array(12).fill(0);
  const negativeMonthlyKWh = Array(12).fill(0);
  for (const component of components) {
    component.monthlyKWh.forEach((_, month) => {
      const contribution = energyBalanceMonthlyContribution(component, month);
      if (contribution >= 0) positiveMonthlyKWh[month] += contribution;
      else negativeMonthlyKWh[month] += contribution;
    });
  }
  return {
    components,
    positiveMonthlyKWh,
    negativeMonthlyKWh,
    netMonthlyKWh: positiveMonthlyKWh.map((value, month) => value + negativeMonthlyKWh[month]),
  };
}

export function hourlyPeaks(esoData, variableName) {
  const out = {};
  for (const s of findSeries(esoData, variableName)) {
    let value = -Infinity, timestamp = null;
    s.values.forEach((v, i) => {
      if (v > value) {
        value = v;
        timestamp = s.timestamps[i];
      }
    });
    out[s.meta.key] = { value, timestamp };
  }
  return out;
}

function sumValues(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

function byZoneKwh(esoData, variableName, floorAreaByZone = {}) {
  const sums = annualSums(esoData, variableName);
  return Object.fromEntries(Object.entries(sums).map(([zone, joules]) => [
    zone,
    {
      kWh: joules / J_PER_KWH,
      kWhPerM2: floorAreaByZone[zone] > 0 ? joules / J_PER_KWH / floorAreaByZone[zone] : null,
    },
  ]));
}

export function euiBreakdown(esoData, floorArea, floorAreaByZone = {}) {
  const streams = {
    heating: 'Zone Ideal Loads Supply Air Total Heating Energy',
    cooling: 'Zone Ideal Loads Supply Air Total Cooling Energy',
    lights: 'Zone Lights Electricity Energy',
    equipment: 'Zone Electric Equipment Electricity Energy',
  };
  const metrics = {};
  for (const [name, variable] of Object.entries(streams)) {
    const joules = sumValues(annualSums(esoData, variable));
    metrics[name] = {
      kWh: joules / J_PER_KWH,
      kWhPerM2: floorArea > 0 ? joules / J_PER_KWH / floorArea : null,
      byZone: byZoneKwh(esoData, variable, floorAreaByZone),
    };
  }

  const heatingPeaks = hourlyPeaks(esoData, streams.heating);
  const coolingPeaks = hourlyPeaks(esoData, streams.cooling);
  const peakOf = peaks => Object.values(peaks).reduce((best, p) => p.value > best.value ? p : best, { value: 0, timestamp: null });
  const heatPeak = peakOf(heatingPeaks);
  const coolPeak = peakOf(coolingPeaks);

  return {
    streams: metrics,
    peaks: {
      heatingWPerM2: floorArea > 0 ? heatPeak.value / 3600 / floorArea : null,
      heatingTimestamp: heatPeak.timestamp,
      coolingWPerM2: floorArea > 0 ? coolPeak.value / 3600 / floorArea : null,
      coolingTimestamp: coolPeak.timestamp,
    },
    monthly: {
      heating: Object.values(monthlySums(esoData, streams.heating)).reduce((a, b) => a.map((v, i) => v + b[i]), Array(12).fill(0)).map(j => j / J_PER_KWH),
      cooling: Object.values(monthlySums(esoData, streams.cooling)).reduce((a, b) => a.map((v, i) => v + b[i]), Array(12).fill(0)).map(j => j / J_PER_KWH),
    },
  };
}
