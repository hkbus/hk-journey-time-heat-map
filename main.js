function loadJSON(url, callback) {
    fetch(url)
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
            initMap();
            modes = new Set(Array.from(document.querySelectorAll('input[name="modes"]:checked')).map(el => el.value));
            maxInterchanges = Number(document.getElementById("maxInterchanges").value);
            intensityByTravelTimeMaxTime = Number(document.getElementById("intensityByTravelTimeMaxTime").value);
            updateHeatLegend();
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

function updateHeatLegend() {
    const heatLegend = document.getElementById("heat-legend");
    const heatLegendContext = heatLegend.getContext("2d");
    const grad= heatLegendContext.createLinearGradient(0,0, heatLegend.width,0);
    const shift = intensityByTravelTimeMaxTime / 180;
    for (const [offset, color] of Object.entries(gradient)) {
        grad.addColorStop((1 - Number(offset)) * shift, color);
    }
    heatLegendContext.fillStyle = grad;
    heatLegendContext.fillRect(0,0, heatLegend.width, heatLegend.height);
}

function initMap() {
    tileLayers.clearLayers();
    L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/rastertiles/voyager_nolabels/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://api.portal.hkmapservice.gov.hk/disclaimer">HKSAR Gov</a>'
    }).addTo(tileLayers);
    L.tileLayer('https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/label/hk/{lang}/WGS84/{z}/{x}/{y}.png'.replace("{lang}", language === "en" ? "en" : "tc"), {
        maxZoom: 19,
    }).addTo(tileLayers);
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

    return stopsWithinRadius;
}

// Calculate intensity based on travel time
function calculateIntensityByTravelTime(travelTime) {
    return Math.max(0, 1 - (travelTime / 60) / intensityByTravelTimeMaxTime);
}

async function generateHeatmapDataWithTravelDistance(stopList, routeList, startStops, seenRoutes = new Set()) {
    const stopSequenceList = [];
    const nextSeenRouts = [];
    for (const [routeKey, routeData] of Object.entries(routeList)) {
        if (seenRoutes.has(routeKey)) continue
        const {co, stops} = routeData;
        for (const operator of co) {
            if (stops && modes.has(operator)) {
                const stopsByCo = stops[operator];
                if (stopsByCo) {
                    let highestIndex = -1;
                    for (const stopId of Object.keys(startStops)) {
                        const index = stopsByCo.indexOf(stopId);
                        if (index > highestIndex) {
                            highestIndex = index;
                        }
                    }
                    if (highestIndex >= 0) {
                        stopSequenceList.push({
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
    for (const stopSequence of stopSequenceList) {
        const {stops} = stopSequence;
        let {travelTime, interchangeCount} = startStops[stops[0]];

        for (let index = 1; index < stops.length; index++) {
            const stopId = stops[index];

            const data = journeyTimes[stops[index - 1]];
            travelTime += data[stopId] !== undefined ? data[stopId] : Number.MAX_SAFE_INTEGER;

            const stopInfo = stopList[stopId];
            if (stopInfo) {
                const location = stopInfo.location;
                heatmapData[stopId] = [location.lat, location.lng, travelTime];
                stopIdData[stopId] = {travelTime: travelTime, interchangeCount: interchangeCount};
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
            const time = data !== undefined ? data.travelTime : Number.MAX_SAFE_INTEGER;
            for (const nearbyStopId of stop.nearby) {
                const nearbyStopCo = stopList[nearbyStopId].co;
                const isTrain = nearbyStopCo.includes("mtr") || nearbyStopCo.includes("lightRail");
                const interchangeTime = isTrain ? interchangeTimeForTrains : interchangeTimes;
                const nextInterchangeCount = interchangeCount + (isTrain ? 0 : 1);
                if (nextInterchangeCount < maxInterchanges) {
                    nextStartStops[nearbyStopId] = {
                        travelTime: time + interchangeTime,
                        interchangeCount: nextInterchangeCount
                    };
                }
            }
            const isTrain = co === "mtr" || co === "lightRail";
            const interchangeTime = isTrain ? interchangeTimeForTrains : interchangeTimes;
            const nextInterchangeCount = interchangeCount + (isTrain ? 0 : 1);
            if (nextInterchangeCount < maxInterchanges) {
                nextStartStops[stopId] = {travelTime: time + interchangeTime, interchangeCount: nextInterchangeCount};
            }
        }
    }

    if (nextStartStops.length <= 0) {
        return heatmapData;
    }

    return mergeHeatmapData(
        heatmapData,
        await generateHeatmapDataWithTravelDistance(stopList, routeList, nextStartStops, seenRoutes)
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
    document.getElementById("export-button").disabled = true;

    if (!routeList || !stopList || !lat || !lng) return;
    droppedPinLayer.clearLayers();
    L.marker([lat, lng]).addTo(droppedPinLayer);
    document.getElementById("origin").innerHTML = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    const stops = findStopsWithinRadius(stopList, lat, lng, walkableDistance);
    const journeyTimesData = [[lat, lng, 0]];

    const startStops = {};
    stops.forEach((stop) => {
        const {id, location, distance} = stop;
        const walkTime = calculateWalkTimeByDistance(distance);
        journeyTimesData.push([location.lat, location.lng, walkTime]);
        startStops[id] = {travelTime: walkTime, interchangeCount: 0};
    });
    Object.values(await generateHeatmapDataWithTravelDistance(stopList, routeList, startStops)).forEach(stop => {
        const [lat, lng, journeyTime] = stop;
        journeyTimesData.push([lat, lng, journeyTime]);
    });

    heatmapLayer.setLatLngs(journeyTimesData);
    lastJourneyTimes = journeyTimesData;
    lastJourneyTimesTree = new KDTree(journeyTimesData.map(([lat, lng], index) => ({
        lat: lat,
        lng: lng,
        index: index
    })), (a, b) => getDistanceFromLatLngInKm(a.lat, a.lng, b.lat, b.lng), ["lat", "lng"]);

    if (journeyTimesData.length > 0) {
        document.getElementById("export-button").disabled = false;
    }
}

function getMinTimeAt(lat, lng) {
    if (lastJourneyTimesTree === null) {
        return null;
    }
    let time = null;
    const nearest = lastJourneyTimesTree.nearest({lat: lat, lng: lng}, 10);
    for (const [nearby] of nearest) {
        const data = lastJourneyTimes[nearby.index];
        if (data) {
            const [stop_lat, stop_lng, journeyTime] = data;
            const distance = getDistanceFromLatLngInKm(lat, lng, stop_lat, stop_lng);
            const walkable = distance <= walkableDistance;
            const calculatedTime = journeyTime + calculateWalkTimeByDistance(distance);
            if (walkable || calculateIntensityByTravelTime(calculatedTime) > 0) {
                if (time === null || calculatedTime < time) {
                    time = calculatedTime;
                }
            }
        }
    }
    return time;
}

function exportGeoJson() {
    if (!lastJourneyTimes) {
        return
    }
    // Convert heatData to GeoJSON
    const geojson = {
        type: "FeatureCollection",
        features: lastJourneyTimes
            .map(([lat, lng, journeyTine]) => ({
                type: "Feature",
                properties: {
                    intensity: calculateIntensityByTravelTime(journeyTine),
                    journeyTine: journeyTine
                },
                geometry: {
                    type: "Point",
                    coordinates: [lng, lat],
                },
            }))
            .filter(({properties}) => properties.journeyTine < Number.MAX_SAFE_INTEGER),
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

// ==============================

let routeList = null;
let stopList = null;
let journeyTimes = null;
loadJSON("./routeTimeList.min.json", dataSheet => {
    routeList = dataSheet.routeList;
    stopList = dataSheet.stopList;
    journeyTimes = dataSheet.journeyTimes;
});

let lastPosition = null;
let lastJourneyTimes = [];
let lastJourneyTimesTree = null;

let language = "zh";
let modes = new Set(["kmb", "ctb", "nlb", "gmb", "mtr", "lightRail", "lrtfeeder", "hkkf", "sunferry", "fortuneferry"]);
let maxInterchanges = 1;
let intensityByTravelTimeMaxTime = 90;

let walkingSpeedKmh = 5.1;
let interchangeTimes = 900;
let interchangeTimeForTrains = 90;
let walkableDistance = 1.5;

const map = L.map('map').setView([22.362458, 114.115333], 11);
const tileLayers = L.layerGroup().addTo(map);
initMap();

const droppedPinLayer = L.layerGroup().addTo(map);
const gradient = {
    0.1: "blue",
    0.6: "cyan",
    0.8: "lime",
    0.9: "yellow",
    1.0: "red"
}
const heatmapLayer = L.heatLayer([], {radius: 20, blur: 20, maxZoom: 17, gradient: gradient}).addTo(map);
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
        let time = getMinTimeAt(lat, lng);
        if (time && time < Number.MAX_SAFE_INTEGER) {
            document.getElementById("time").innerHTML = `~${Math.round(time / 60)}`;
        } else {
            document.getElementById("time").innerHTML = `N/A`;
        }
    } else {
        document.getElementById("time").innerHTML = `-`;
    }
});