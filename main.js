function loadJSON(url, callback) {
    fetch(url, {
        method: 'GET',
        headers: {
            'Accept-Encoding': 'gzip',
        },
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            callback(data);
        })
        .catch(error => {
            console.error("Error loading JSON:", error);
        });
}

function setLoading(loading) {
    if (loading) {
        document.getElementById("loader").style.display = "flex";
    } else {
        document.getElementById("loader").style.display = "none";
    }
}

function reload() {
    setLoading(true);
    setTimeout(() => {
        try {
            language = document.getElementById("language").value;
            if (document.getElementById("basemapUrl").value.length === 0) {
                basemapUrls = [
                    "https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
                    "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/{lang}/WGS84/{z}/{x}/{y}.png"
                ];
                document.getElementById("basemapUrl").value = basemapUrls.join("\n");
            } else {
                basemapUrls = document.getElementById("basemapUrl").value.split("\n");
            }
            initMap();
            modes = new Set(Array.from(document.querySelectorAll('input[name="modes"]:checked')).map(el => el.value));
            direction = document.getElementById("direction").value;
            weekday = document.getElementById("weekday").value;
            if (weekday === "N") {
                hour = "N";
                document.getElementById("hour").value = hour;
                document.getElementById("hour").disabled = true;
            } else {
                document.getElementById("hour").disabled = false;
                if (hour === "N") {
                    hour = "00";
                    document.getElementById("hour").value = hour;
                } else {
                    hour = document.getElementById("hour").value;
                }
            }
            maxInterchanges = Number(document.getElementById("maxInterchanges").value);
            walkingSpeedKmh = Number(document.getElementById("walkingSpeed").value);
            walkableDistance = Number(document.getElementById("walkableDistance").value);
            interchangeTimes = Number(document.getElementById("interchangeTimes").value);
            interchangeTimeForTrains = Number(document.getElementById("interchangeTimesForTrains").value);
            intensityByTravelTimeMaxTime = Number(document.getElementById("intensityByTravelTimeMaxTime").value);
            maxTransparency = Number(document.getElementById("maxTransparency").value);
            updateGradientPicker();
            clipToBoundaries = document.getElementById("boundaries").value === "true";
            enableAreaLayer = document.getElementById("useArea").value === "true";
            updateHeatLegend(intensityByTravelTimeMaxTime);
            heatmapLayer.options.gradient = gradient;
            heatmapLayer._updateOptions();
            if (!lastPosition) return;
            const [lat, lng] = lastPosition;
            updateOrigin(lat, lng)
        } finally {
            setLoading(false);
        }
    }, 50);
}

function updateIntensitySliderValue(value) {
    document.getElementById('intensityByTravelTimeMaxTimeValue').innerHTML = value;
    updateHeatLegend(value);
}

function updateMaxTransparencyValue(value) {
    document.getElementById('maxTransparencyValue').innerHTML = value;
    document.getElementById('heat-legend').style.filter = `opacity(${value})`;
}

function flipCheckbox(value) {
    const checkbox = document.querySelector(`.modes-table input[type="checkbox"][value="${value}"]`);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        reload();
    }
}

function toggleAllCheckboxes() {
    const checkboxes = Array.from(document.querySelectorAll('.modes-table input[type="checkbox"]'));
    const newValue = !checkboxes.every(checkbox => checkbox.checked);
    checkboxes.forEach(checkbox => checkbox.checked = newValue);
    reload();
}

function drawHeatLegend() {
    const heatLegend = document.getElementById("heat-legend");
    const heatLegendContext = heatLegend.getContext("2d");
    const grad= heatLegendContext.createLinearGradient(0,0, heatLegend.width,0);
    const gradientEntries = Object.entries(gradient);
    grad.addColorStop(0, gradientEntries[0][1]);
    for (const [offset, color] of gradientEntries.slice(1)) {
        grad.addColorStop((1 - Math.max(0, Math.min(1, Number(offset) * 0.8 - 0.15))), color);
    }
    heatLegendContext.fillStyle = grad;
    heatLegendContext.fillRect(0,0, heatLegend.width, heatLegend.height);
}

function updateHeatLegend(value) {
    document.getElementById("heat-legend-1").innerHTML = "0";
    document.getElementById("heat-legend-2").innerHTML = `${value / 4}`;
    document.getElementById("heat-legend-3").innerHTML = `${value / 2}`;
    document.getElementById("heat-legend-4").innerHTML = `${value / 4 * 3}`;
    document.getElementById("heat-legend-5").innerHTML = `${value}`;
}

function removeGradientPicker(index) {
    updateGradientPicker(index);
    reload();
}

function updateGradientPicker(ignore = undefined) {
    const newGradient = {};
    for (let index = 1; ; index++) {
        if (index === ignore) {
            continue;
        }
        const positionElement = document.getElementById(`gradient-position-${index}`);
        const valueElement = document.getElementById(`gradient-value-${index}`);
        if (!positionElement || !valueElement) {
            break;
        }
        if (!newGradient.hasOwnProperty(positionElement.value) || gradientPickerPriority === index) {
            newGradient[positionElement.value] = valueElement.value;
        }
    }
    if (Object.keys(newGradient).length > 0) {
        gradient = newGradient;
    }
    generateGradientPicker(gradient);
    drawHeatLegend();
}

function addGradientPicker() {
    let newValue = 1;
    for (const position of Object.keys(gradient).sort((a, b) => Number(b) - Number(a))) {
        if (Number(position) === newValue) {
            newValue = Number((newValue - 0.05).toFixed(2));
        }
    }
    if (newValue >= 0 && newValue <= 1) {
        gradient[newValue] = "#FF0000";
    }
    generateGradientPicker(gradient);
    reload();
}

function generateGradientPicker(value) {
    const div = document.getElementById("gradient-picker");
    let innerHTML = "";
    const entries = Object.entries(value).sort(([a], [b]) => Number(b) - Number(a));
    let counter = 1;
    for (const [position, value] of entries) {
        const index = counter++;
        innerHTML += `
         <div class="control gradient-entry" id="gradient-entry-${index}">
            <input type="number" class="input gradient-position" id="gradient-position-${index}" min="0" max="1" step="0.05" value="${position}" onchange="gradientPickerPriority = ${index}; reload();">
            <input type="color" class="input gradient-color" id="gradient-value-${index}" value="${value}" onchange="gradientPickerPriority = ${index}; reload();">
            <button class="button gradient-remove" id="gradient-remove-${index}" onclick="gradientPickerPriority = null; removeGradientPicker(${index});">-</button>
         </div>
         `;
    }
    div.innerHTML = innerHTML;
}

function toggleGradientPicker() {
    const div = document.getElementById("gradient-section");
    const button = document.getElementById("gradient-toggle-button");
    if (div.style.display === "none") {
        div.style.display = "block";
        button.innerHTML = "隱藏 Hide";
    } else {
        div.style.display = "none";
        button.innerHTML = "展示 Show";
    }
}

function initMap() {
    tileLayers.clearLayers();
    let first = true;
    for (const basemapUrl of basemapUrls) {
        if (first) {
            L.tileLayer(basemapUrl.replace("{lang}", language === "en" ? "en" : "tc"), {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://api.portal.hkmapservice.gov.hk/disclaimer">HKSAR Gov</a>'
            }).addTo(tileLayers);
            first = false;
        } else {
            L.tileLayer(basemapUrl.replace("{lang}", language === "en" ? "en" : "tc"), {
                maxZoom: 19,
            }).addTo(tileLayers);
        }
    }
}

// ==============================

function clipCanvasToPolygons(geojson, map, canvasContext) {
    canvasContext.beginPath();
    geojson.features.forEach(feature => {
        const geometry = feature.geometry;
        if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
            const coordinates = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
            coordinates.forEach(polygon => {
                polygon.forEach(ring => {
                    ring.forEach((coordinate, i) => {
                        const [lng, lat] = coordinate;
                        const { x, y } = map.latLngToContainerPoint([lat, lng]);
                        if (i === 0) {
                            canvasContext.moveTo(x, y);
                        } else {
                            canvasContext.lineTo(x, y);
                        }
                    });
                });
            });
        }
    });
    canvasContext.clip();
}

// ==============================

function calculateIntensityByDistance(distance, maxDistance) {
    if (distance >= maxDistance) return 0; // Intensity is 0 if beyond max distance
    return 1 - (distance / maxDistance); // Linear interpolation for intensity
}

function calculateWalkTimeByDistance(distance) {
    const walkingSpeedInKmPerSecond = walkingSpeedKmh / 3600;
    return distance / walkingSpeedInKmPerSecond;
}

// Calculate intensity based on travel time
function calculateIntensityByTravelTime(travelTime) {
    return Math.max(0, 1 - (travelTime / 60) / intensityByTravelTimeMaxTime);
}

// Haversine formula to calculate the distance between two points (in kilometers)
function getDistanceFromLatLngInKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function findStopsWithinRadius(stopList, targetLat, targetLng, radiusKm) {
    const stopsWithinRadius = [];

    for (const stopId in stopList) {
        if (stopList.hasOwnProperty(stopId)) {
            const stop = stopList[stopId];
            if (stop && stop.co.some(co => modes.has(co))) {
                const {lat, lng} = stop.location;
                const distance = getDistanceFromLatLngInKm(targetLat, targetLng, lat, lng);
                if (distance <= radiusKm) {
                    stopsWithinRadius.push({
                        id: stopId,
                        name: stop.name,
                        location: stop.location,
                        distance: distance
                    });
                }
            }
        }
    }

    return stopsWithinRadius.sort(({distance: distanceA}, {distance: distanceB}) => distanceA - distanceB);
}

async function generateHeatmapDataWithTravelDistance(stopList, routeList, startStops, takeFirstStop, seenRoutes = new Set()) {
    const stopSequenceList = [];
    const nextSeenRouts = [];

    const isArrivingAt = direction === "arriving-at";

    for (const [routeKey, routeData] of Object.entries(routeList)) {
        if (seenRoutes.has(routeKey)) continue
        const {co, stops} = routeData;
        for (const operator of co) {
            if (stops && modes.has(operator)) {
                let stopsByCo = stops[operator];
                if (stopsByCo) {
                    if (isArrivingAt) {
                        stopsByCo = stopsByCo.toReversed();
                    }
                    let highestIndex = -1;
                    if (takeFirstStop === null) {
                        for (const stopId of Object.keys(startStops)) {
                            const index = stopsByCo.indexOf(stopId);
                            if (index > highestIndex) {
                                highestIndex = index;
                            }
                        }
                    } else {
                        for (const stopId of takeFirstStop) {
                            if (startStops.hasOwnProperty(stopId)) {
                                const index = stopsByCo.indexOf(stopId);
                                if (index > highestIndex) {
                                    highestIndex = index;
                                    break;
                                }
                            }
                        }
                    }
                    if (highestIndex >= 0) {
                        stopSequenceList.push({
                            routeKey: routeKey,
                            stops: stopsByCo.slice(highestIndex, stopsByCo.length),
                            co: operator
                        });
                        nextSeenRouts.push(routeKey)
                    }
                }
            }
        }
    }

    nextSeenRouts.forEach(r => seenRoutes.add(r));
    if (stopSequenceList.length <= 0) {
        return {};
    }

    const heatmapData = {};
    const stopIdData = {};
    for (const {routeKey, stops} of stopSequenceList) {
        let {travelTime, interchangeCount, steps} = startStops[stops[0]];

        for (let index = 1; index < stops.length; index++) {
            const stopId = stops[index];

            let jtFirstStopId = stops[index - 1];
            let jtSecondStopId = stopId;
            if (isArrivingAt) {
                jtFirstStopId = stopId;
                jtSecondStopId = stops[index - 1];
            }

            const journeyTimeData = journeyTimes[jtFirstStopId];
            if (journeyTimeData[jtSecondStopId] === undefined) {
                travelTime += Number.MAX_SAFE_INTEGER;
            } else {
                const data = journeyTimeData[jtSecondStopId];
                if (weekday === "N") {
                    travelTime += data["normal"] !== undefined ? data["normal"] : Number.MAX_SAFE_INTEGER;
                } else if (data.hasOwnProperty(weekday) && data[weekday].hasOwnProperty(hour)) {
                    travelTime += data[weekday][hour];
                } else {
                    travelTime += Number.MAX_SAFE_INTEGER;
                }
            }

            const stopInfo = stopList[stopId];
            if (stopInfo) {
                const location = stopInfo.location;
                const nextSteps = steps.slice();
                const routeData = routeList[routeKey];
                let route = `${routeData.co.join("&").toUpperCase()} ${routeData.route}`;
                if (heatmapData.hasOwnProperty(stopId)) {
                    route = `${route} / ${heatmapData[stopId][3].at(-1).route}`;
                }
                nextSteps.push({stopId: stopId, route: route});
                heatmapData[stopId] = [location.lat, location.lng, travelTime, nextSteps];
                stopIdData[stopId] = {travelTime: travelTime, interchangeCount: interchangeCount, steps: nextSteps};
            }
        }
    }

    const nextStartStops = {};
    for (const stopSequence of stopSequenceList) {
        const {stops, co} = stopSequence;
        for (const stopId of stops) {
            const stop = stopList[stopId];
            const data = stopIdData[stopId];
            const interchangeCount = data !== undefined ? data.interchangeCount : maxInterchanges;
            const steps = data !== undefined ? data.steps : [];
            const time = data !== undefined ? data.travelTime : Number.MAX_SAFE_INTEGER;
            for (const nearbyStopId of stop.nearby) {
                const nearbyStopCo = stopList[nearbyStopId].co;
                const isTrain = nearbyStopCo.includes("mtr") || nearbyStopCo.includes("lightRail");
                const interchangeTime = isTrain ? interchangeTimeForTrains : interchangeTimes;
                const nextInterchangeCount = interchangeCount + (isTrain ? 0 : 1);
                if (nextInterchangeCount < maxInterchanges) {
                    nextStartStops[nearbyStopId] = {
                        travelTime: time + interchangeTime,
                        interchangeCount: nextInterchangeCount,
                        steps: steps
                    };
                }
            }
            const isTrain = co === "mtr" || co === "lightRail";
            const interchangeTime = isTrain ? interchangeTimeForTrains : interchangeTimes;
            const nextInterchangeCount = interchangeCount + (isTrain ? 0 : 1);
            if (nextInterchangeCount < maxInterchanges) {
                nextStartStops[stopId] = {
                    travelTime: time + interchangeTime,
                    interchangeCount: nextInterchangeCount,
                    steps: steps
                };
            }
        }
    }

    if (nextStartStops.length <= 0) {
        return heatmapData;
    }

    return mergeHeatmapData(
        heatmapData,
        await generateHeatmapDataWithTravelDistance(stopList, routeList, nextStartStops, null, seenRoutes)
    );
}

function mergeHeatmapData(map1, map2) {
    const map = {...map1}
    for (const [stopId, data] of Object.entries(map2)) {
        const existingData = map[stopId];
        if (!existingData || existingData[2] > data[2]) {
            map[stopId] = data;
        }
    }
    return map;
}

async function updateOrigin(lat = lastPosition[0], lng = lastPosition[1]) {
    document.getElementById("export-points-button").disabled = true;
    document.getElementById("export-image-button").disabled = true;
    document.getElementById("export-image-basemap-button").disabled = true;
    document.getElementById("export-area-button").disabled = true;

    if (!routeList || !stopList || !lat || !lng) return;
    droppedPinLayer.clearLayers();
    transitPointLayer.clearLayers();
    areaLayer.clearLayers();
    lastAreaGeoJson = null;
    L.marker([lat, lng]).addTo(droppedPinLayer);
    document.getElementById("origin").innerHTML = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const stops = findStopsWithinRadius(stopList, lat, lng, walkableDistance);
    const journeyTimesData = [[lat, lng, 0, [{stopId: null, route: "walk"}]]];
    const heatmapData = [[lat, lng, 0]];

    const startStops = {};
    stops.forEach(({id, location, distance}) => {
        const walkTime = calculateWalkTimeByDistance(distance);
        journeyTimesData.push([location.lat, location.lng, walkTime, [{stopId: id, route: "walk"}]]);
        heatmapData.push([location.lat, location.lng, walkTime]);
        startStops[id] = {travelTime: walkTime, interchangeCount: 0, steps: [{stopId: id, route: "walk"}]};
    });
    Object.values(await generateHeatmapDataWithTravelDistance(stopList, routeList, startStops, stops.map(({id}) => id))).forEach(stop => {
        const [lat, lng, journeyTime, steps] = stop;
        heatmapData.push([lat, lng, journeyTime]);
        journeyTimesData.push([lat, lng, journeyTime, steps]);
    });

    heatmapLayer.setLatLngs(heatmapData);
    lastJourneyTimes = journeyTimesData;
    lastJourneyTimesTree = new KDTree(journeyTimesData.map(([lat, lng], index) => ({
        lat: lat,
        lng: lng,
        index: index
    })), (a, b) => getDistanceFromLatLngInKm(a.lat, a.lng, b.lat, b.lng), ["lat", "lng"]);

    const markersMap = new Map();
    for (const [, , , steps] of journeyTimesData) {
        const stepRoutes = [];
        for (const {stopId, route} of steps) {
            if (stopId) {
                const {name, location} = stopList[stopId];
                const {lat, lng} = location;
                const coordKey = `${lat},${lng}`;
                stepRoutes.push(`${route} ${language === "en" ? "to" : "至"} ${name[language]}`);
                const currentStepRoutes = stepRoutes.slice();
                if (!markersMap.has(coordKey)) {
                    markersMap.set(coordKey, { lat, lng, routes: [] });
                }
                markersMap.get(coordKey).routes.push(currentStepRoutes);
            }
        }
    }
    for (const { lat, lng, routes } of markersMap.values()) {
        const marker = L.marker([lat, lng], { icon: redIcon }).addTo(transitPointLayer);
        let popupContent = `<div style="text-align: center;">${Array.from(new Set(routes.map(r => r.join("<br>↓<br>")))).join('<br><br>')}</div>`;
        if (language !== "en") {
            popupContent = popupContent.replaceAll("walk", "步行");
        }
        marker.bindPopup(popupContent);
        marker.on('mouseover', () => {
            marker.openPopup();
        });
        marker.on('mouseout', () => {
            marker.closePopup();
        });
    }

    if (enableAreaLayer) {
        const timeIntervals = [];
        for (let min = 10; min <= intensityByTravelTimeMaxTime; min += 10) {
            timeIntervals.push(min * 60);
        }
        const travelTimePolygons = generateTravelTimePolygon(timeIntervals);
        for (const [time, polygon] of Object.entries(travelTimePolygons).toReversed()) {
            const polygonLayer = L.geoJSON(polygon, {
                style: {
                    color: 'black',
                    fillOpacity: 0,
                    weight: 2
                }
            }).addTo(areaLayer);
            polygonLayer.bindTooltip(`${time / 60} ${language === "en" ? " Mins Area" : "分鐘範圍"}`, {sticky: true});
            polygonLayer.on('click', e => {
                e.target.openTooltip(e.latlng); // Open the tooltip at the clicked location
            });
        }
        lastAreaGeoJson = travelTimePolygons;
    }

    if (journeyTimesData.length > 0) {
        document.getElementById("export-points-button").disabled = false;
        document.getElementById("export-image-button").disabled = false;
        document.getElementById("export-image-basemap-button").disabled = false;
        if (lastAreaGeoJson) {
            document.getElementById("export-area-button").disabled = false;
        }
    }
}

function generateTravelTimePolygon(timeIntervals) {
    const reachablePointsByInterval = {};
    for (let lat = hongKongBounds.minLat; lat <= hongKongBounds.maxLat; lat += gridResolutionLat) {
        for (let lng = hongKongBounds.minLng; lng <= hongKongBounds.maxLng; lng += gridResolutionLng) {
            const {time} = getMinTimeAt(lat, lng);
            if (time !== null) {
                for (const timeInterval of timeIntervals) {
                    if (time <= timeInterval) {
                        if (!reachablePointsByInterval.hasOwnProperty(timeInterval)) {
                            reachablePointsByInterval[timeInterval] = [];
                        }
                        reachablePointsByInterval[timeInterval].push([lat, lng]);
                    }
                }
            }
        }
    }
    const result = {};
    for (const [timeInterval, reachablePoints] of Object.entries(reachablePointsByInterval)) {
        const points = turf.featureCollection(
            reachablePoints.map(([lat, lng]) => turf.point([lng, lat]))
        );
        let polygon = turf.concave(points, { maxEdge: 1 });
        polygon = turf.polygonSmooth(polygon, { iterations: 3 });
        polygon.features.forEach(f => f.properties["journeyTime"] = timeInterval);
        result[timeInterval] = polygon;
    }
    return result;
}

function findPdd(lat, lng) {
    const point = turf.point([lng, lat]);
    for (const feature of pdd.features) {
        if (turf.booleanPointInPolygon(point, feature)) {
            return feature.properties;
        }
    }
    return null;
}

function getMinTimeAt(lat, lng) {
    if (lastJourneyTimesTree === null) {
        return {time: null, steps: []};
    }
    let time = null;
    let steps = [];
    const nearest = lastJourneyTimesTree.nearest({lat: lat, lng: lng}, 30);
    for (const [nearby] of nearest) {
        const data = lastJourneyTimes[nearby.index];
        if (data) {
            const [stop_lat, stop_lng, journeyTime, journeySteps] = data;
            const distance = getDistanceFromLatLngInKm(lat, lng, stop_lat, stop_lng);
            const walkable = distance <= walkableDistance;
            const calculatedTime = journeyTime + calculateWalkTimeByDistance(distance);
            if (walkable) {
                if (time === null || calculatedTime < time) {
                    time = calculatedTime;
                    steps = journeySteps;
                }
            }
        }
    }
    return {time: time, steps: steps};
}

function exportGeoJson() {
    if (!lastJourneyTimes) {
        return
    }
    // Convert heatData to GeoJSON
    const geojson = {
        type: "FeatureCollection",
        features: lastJourneyTimes
            .map(([lat, lng, journeyTime, steps]) => ({
                type: "Feature",
                properties: {
                    intensity: calculateIntensityByTravelTime(journeyTime),
                    journeyTime: journeyTime,
                    journeySteps: steps,
                    stopId: steps[steps.length - 1].stopId,
                    pdd: findPdd(lat, lng),
                },
                geometry: {
                    type: "Point",
                    coordinates: [lng, lat],
                },
            }))
            .filter(({properties}) => properties.journeyTime < Number.MAX_SAFE_INTEGER),
    };
    // Download the GeoJSON file
    const downloadGeoJSON = (geojson) => {
        const blob = new Blob([JSON.stringify(geojson, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'points.geojson';
        link.click();
    };
    // Call the download function
    downloadGeoJSON(geojson);
}

function exportTimeArea() {
    if (!lastAreaGeoJson) {
        return
    }
    let geojson = {
        type: "FeatureCollection",
        features: Object.values(lastAreaGeoJson).toReversed().flatMap(e => e.features),
    }
    // Download the GeoJSON file
    const downloadGeoJSON = (geojson) => {
        const blob = new Blob([JSON.stringify(geojson, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'area.geojson';
        link.click();
    };
    // Call the download function
    downloadGeoJSON(geojson);
}

function exportHeatmapAsImage() {
    const width = heatmapLayer._heat._width;
    const height = heatmapLayer._heat._height;
    const { lat: latUpperLeft, lng: lngUpperLeft} = heatmapLayer._map.containerPointToLatLng([0, 0]);
    const { lat: latUpperRight, lng: lngUpperRight} = heatmapLayer._map.containerPointToLatLng([width, 0]);
    const { lat: latLowerLeft, lng: lngLowerLeft} = heatmapLayer._map.containerPointToLatLng([0, height]);
    const { lat: latLowerRight, lng: lngLowerRight} = heatmapLayer._map.containerPointToLatLng([width, height]);
    heatmapLayer._heat._canvas.toBlob(heatMapBlob => {
        saveAs(heatMapBlob, "heatmap.png");

        const meta = {
            "UpperLeft": [latUpperLeft, lngUpperLeft],
            "UpperRight": [latUpperRight, lngUpperRight],
            "LowerLeft": [latLowerLeft, lngLowerLeft],
            "LowerRight": [latLowerRight, lngLowerRight],
        }
        const metaBlob = new Blob([JSON.stringify(meta, null, 4)], {type: "text/plain;charset=utf-8"});
        saveAs(metaBlob, "heatmap.json");
    });
}

function exportHeatmapWithBasemapAsImage() {
    const mapCanvas = document.createElement('canvas');
    const mapContext = mapCanvas.getContext('2d');

    const width = heatmapLayer._heat._width;
    const height = heatmapLayer._heat._height;
    const { lat: latUpperLeft, lng: lngUpperLeft} = heatmapLayer._map.containerPointToLatLng([0, 0]);
    const { lat: latUpperRight, lng: lngUpperRight} = heatmapLayer._map.containerPointToLatLng([width, 0]);
    const { lat: latLowerLeft, lng: lngLowerLeft} = heatmapLayer._map.containerPointToLatLng([0, height]);
    const { lat: latLowerRight, lng: lngLowerRight} = heatmapLayer._map.containerPointToLatLng([width, height]);

    mapCanvas.width = width;
    mapCanvas.height = height;

    bigImageLayer._print().then(basemapCanvas => {
        // Render the base tile layers
        mapContext.drawImage(basemapCanvas, 0, 0, width, height);

        // Render the heatmap layer
        const heatmapCanvas = heatmapLayer._heat._canvas;
        mapContext.drawImage(heatmapCanvas, 0, 0, width, height);

        // Export the combined canvas
        mapCanvas.toBlob(function(blob) {
            saveAs(blob, "heatmap_basemap.png");

            const meta = {
                "UpperLeft": [latUpperLeft, lngUpperLeft],
                "UpperRight": [latUpperRight, lngUpperRight],
                "LowerLeft": [latLowerLeft, lngLowerLeft],
                "LowerRight": [latLowerRight, lngLowerRight],
            }
            const metaBlob = new Blob([JSON.stringify(meta, null, 4)], {type: "text/plain;charset=utf-8"});
            saveAs(metaBlob, "heatmap_basemap.json");
        });
    });
}

// ==============================

async function getSHA256Hash(input) {
    const textAsBuffer = new TextEncoder().encode(input);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", textAsBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((item) => item.toString(16).padStart(2, "0")).join("");
}

function checkPassword() {
    const passwordElement = document.getElementById("password");
    getSHA256Hash(passwordElement.value).then(hash => {
        if (hash === exportPasswordHash) {
            document.getElementById("password-blocker").style.display = "none";
            document.getElementById("password-dialog").style.display = "none";
        } else {
            passwordElement.classList.add("error");
            alert("密碼錯誤 Incorrect password");
        }
    });
}

// ==============================

const exportPasswordHash = "b92a1ffdc416f6f67e0a32f459e2b652504adba390017c29f3538b7b494172df";

document.getElementById("password").addEventListener("keyup", event => {
    if (event.key === "Enter") {
        checkPassword();
    }
});

let routeList = null;
let stopList = null;
let journeyTimes = null;
let districtBoundaries = null;
let pdd = null;
loadJSON("https://jt.hkbus.app/routeTimeList.min.json", dataSheet => {
    routeList = dataSheet.routeList;
    stopList = dataSheet.stopList;
    journeyTimes = dataSheet.journeyTimes;
});
loadJSON("https://jt.hkbus.app/district_boundaries.geojson", geoJson => {
    districtBoundaries = geoJson;
});
loadJSON("https://jt.hkbus.app/pdd.geojson", geoJson => {
    pdd = geoJson;
});

let lastPosition = null;
let lastJourneyTimes = [];
let lastJourneyTimesTree = null;
let lastAreaGeoJson = null;

let language = "zh";
let basemapUrls = [
    "https://cartodb-basemaps-a.global.ssl.fastly.net/rastertiles/voyager_nolabels/{z}/{x}/{y}.png",
    "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/{lang}/WGS84/{z}/{x}/{y}.png"
];
let modes = new Set(["kmb", "ctb", "nlb", "gmb", "mtr", "lightRail", "lrtfeeder", "hkkf", "sunferry", "fortuneferry"]);
let direction = "departing-from";
let weekday = "N";
let hour = "N";
let maxInterchanges = 1;
let intensityByTravelTimeMaxTime = 90;
let maxTransparency = 0.75;
let walkingSpeedKmh = 5.1;
let interchangeTimes = 900;
let interchangeTimeForTrains = 90;
let walkableDistance = 1.5;
let clipToBoundaries = false;
let enableAreaLayer = false;
let gradient = {
    0.1: "#0000FF",
    0.6: "#00FFFF",
    0.8: "#00FF00",
    0.9: "#FFFF00",
    1.0: "#FF0000"
}

let gradientPickerPriority = null;
generateGradientPicker(gradient);

const hongKongBounds = {
    minLat: 22.14, maxLat: 22.57,
    minLng: 113.83, maxLng: 114.43
};
const gridResolutionLat = 0.0009; // 100 meters in latitude
const gridResolutionLng = 0.00097; // 100 meters in longitude

const redIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [12.5, 20.5],
    iconAnchor: [6, 20.5],
    popupAnchor: [0.5, -17],
    shadowSize: [20.5, 20.5]
});

const map = L.map('map').setView([22.362458, 114.115333], 11);
const tileLayers = L.layerGroup().addTo(map);
initMap();

const droppedPinLayer = L.layerGroup().addTo(map);

const transitPointLayer = L.markerClusterGroup({spiderfyOnMaxZoom: false, disableClusteringAtZoom: 16}).addTo(map);

const heatmapLayer = L.heatLayer([], {radius: 20, blur: 20, maxZoom: 17, gradient: gradient}).addTo(map);
drawHeatLegend();

const areaLayer = L.layerGroup().addTo(map);

const layerControl = L.control.layers(null, null).addTo(map)
    .addOverlay(droppedPinLayer, "所選地點 Selected Location")
    .addOverlay(transitPointLayer, "車站地點 Transit Points")
    .addOverlay(heatmapLayer, "熱圖 Heatmap")
    .addOverlay(areaLayer, "行程時間範圍 Travel Time Area");

const bigImageLayer = L.control.bigImage({position: 'topright'}).addTo(map);

reload();

map.on('click', (event) => {
    setLoading(true);
    setTimeout(() => {
        try {
            const {lat, lng} = event.latlng;
            lastPosition = [lat, lng];
            updateOrigin(lat, lng);
        } finally {
            setLoading(false);
        }
    }, 50);
});

map.on('mousemove', (event) => {
    const {lat, lng} = event.latlng;
    document.getElementById("hovering").innerHTML = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (lastJourneyTimes.length > 0) {
        let {time} = getMinTimeAt(lat, lng);
        if (time && time < Number.MAX_SAFE_INTEGER) {
            document.getElementById("time").innerHTML = `~${Math.round(time / 60)}`;
        } else {
            document.getElementById("time").innerHTML = `N/A`;
        }
    } else {
        document.getElementById("time").innerHTML = `-`;
    }
});