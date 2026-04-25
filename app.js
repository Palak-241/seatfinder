// Elements
const arrow = document.getElementById('arrow');
const distanceValue = document.getElementById('distanceValue');
const statusMessage = document.getElementById('statusMessage');
const setTargetBtn = document.getElementById('setTargetBtn');
const clearTargetBtn = document.getElementById('clearTargetBtn');
const restoreTargetBtn = document.getElementById('restoreTargetBtn');

// Debug Elements
const debugToggle = document.getElementById('debugToggle');
const debugPanel = document.getElementById('debugPanel');
const debugLat = document.getElementById('debugLat');
const debugLon = document.getElementById('debugLon');
const debugAccuracy = document.getElementById('debugAccuracy');
const debugTLat = document.getElementById('debugTLat');
const debugTLon = document.getElementById('debugTLon');
const debugHeading = document.getElementById('debugHeading');
const debugBearing = document.getElementById('debugBearing');

// Overlay Elements
const permissionOverlay = document.getElementById('permissionOverlay');
const grantPermissionBtn = document.getElementById('grantPermissionBtn');

// State
let currentLocation = null;
let targetLocation = null;
let lastSavedTarget = null; // for restore
let currentHeading = null;
let watchId = null;
let indoorMode = true; // default to indoor (WiFi positioning)

// Position smoothing buffer
const locationBuffer = [];
const BUFFER_SIZE = 6;

// Constants
const R = 6371e3; // Earth's radius in metres
const INDOOR_ACCURACY_THRESHOLD = 60;  // metres — warn above this
const OUTDOOR_ACCURACY_THRESHOLD = 20; // metres — warn above this
const PIN_LOCK_THRESHOLD = 80;          // metres — block pin drop above this

// ─── Math Engine ─────────────────────────────────────────────────────────────

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function toDegrees(radians) {
    return radians * 180 / Math.PI;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const λ1 = toRadians(lon1);
    const λ2 = toRadians(lon2);
    const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
        Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
    const θ = Math.atan2(y, x);
    return (toDegrees(θ) + 360) % 360;
}

// ─── Position Smoothing ───────────────────────────────────────────────────────

function addToBuffer(lat, lon) {
    locationBuffer.push({ lat, lon });
    if (locationBuffer.length > BUFFER_SIZE) locationBuffer.shift();
}

function getSmoothedLocation() {
    if (locationBuffer.length === 0) return null;
    const avg = locationBuffer.reduce(
        (acc, p) => ({ lat: acc.lat + p.lat, lon: acc.lon + p.lon }),
        { lat: 0, lon: 0 }
    );
    return {
        latitude: avg.lat / locationBuffer.length,
        longitude: avg.lon / locationBuffer.length
    };
}

// ─── Geolocation Options ──────────────────────────────────────────────────────

function getGeoOptions() {
    if (indoorMode) {
        // enableHighAccuracy: false → browser uses WiFi + cell towers, much better indoors
        return { enableHighAccuracy: false, maximumAge: 10000, timeout: 30000 };
    } else {
        // enableHighAccuracy: true → forces GPS chip, better outdoors
        return { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 };
    }
}

// ─── Indoor / Outdoor Toggle ──────────────────────────────────────────────────

function createModeToggle() {
    const controls = document.querySelector('.controls');
    const btn = document.createElement('button');
    btn.id = 'modeToggleBtn';
    btn.className = 'secondary-btn';
    btn.style.fontSize = '0.9rem';
    btn.style.padding = '10px 24px';
    updateModeButton(btn);
    controls.appendChild(btn);

    btn.addEventListener('click', () => {
        indoorMode = !indoorMode;
        locationBuffer.length = 0; // clear buffer on mode switch
        updateModeButton(btn);
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
        }
        initGeolocation();
        statusMessage.textContent = indoorMode
            ? '📶 Switched to Indoor (WiFi) mode'
            : '🛰️ Switched to Outdoor (GPS) mode';
    });
}

function updateModeButton(btn) {
    btn.textContent = indoorMode ? '📶 Indoor Mode (WiFi)' : '🛰️ Outdoor Mode (GPS)';
}

// ─── Update UI ────────────────────────────────────────────────────────────────

function updateUI() {
    if (!currentLocation) {
        statusMessage.textContent = indoorMode
            ? "Waiting for WiFi location..."
            : "Waiting for GPS...";
        setTargetBtn.disabled = true;
        return;
    }

    // Accuracy feedback
    const acc = currentLocation.accuracy;
    const threshold = indoorMode ? INDOOR_ACCURACY_THRESHOLD : OUTDOOR_ACCURACY_THRESHOLD;
    const tooInaccurate = acc > PIN_LOCK_THRESHOLD;

    debugLat.textContent = currentLocation.latitude.toFixed(6);
    debugLon.textContent = currentLocation.longitude.toFixed(6);
    debugAccuracy.textContent = acc ? acc.toFixed(1) : "--";

    // Lock drop-pin if signal is terrible
    setTargetBtn.disabled = tooInaccurate;

    if (targetLocation) {
        const distance = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            targetLocation.latitude, targetLocation.longitude
        );

        const bearing = calculateBearing(
            currentLocation.latitude, currentLocation.longitude,
            targetLocation.latitude, targetLocation.longitude
        );

        debugTLat.textContent = targetLocation.latitude.toFixed(6);
        debugTLon.textContent = targetLocation.longitude.toFixed(6);
        debugBearing.textContent = bearing.toFixed(1) + "°";

        if (distance < 3) {
            distanceValue.textContent = "On Location";
            distanceValue.style.fontSize = "2.5rem";
            document.querySelector('.unit').style.display = 'none';
            statusMessage.textContent = "📍 You have arrived!";
        } else {
            distanceValue.textContent = distance < 10 ? distance.toFixed(1) : Math.round(distance);
            distanceValue.style.fontSize = "";
            document.querySelector('.unit').style.display = 'inline';

            if (acc > threshold) {
                statusMessage.textContent = `⚠️ Low signal accuracy (±${Math.round(acc)}m)`;
            } else if (currentHeading !== null) {
                statusMessage.textContent = "Navigating to Target";
                let arrowRotation = bearing - currentHeading;
                arrow.style.transform = `rotate(${arrowRotation}deg)`;
                debugHeading.textContent = currentHeading.toFixed(1) + "°";
            } else {
                statusMessage.textContent = "Waiting for Compass...";
            }
        }
    } else {
        distanceValue.textContent = "--";
        distanceValue.style.fontSize = "";
        document.querySelector('.unit').style.display = 'inline';
        arrow.style.transform = `rotate(0deg)`;

        if (tooInaccurate) {
            statusMessage.textContent = `⚠️ Signal too weak to pin (±${Math.round(acc)}m). Move closer to a window or WiFi.`;
        } else if (acc > threshold) {
            statusMessage.textContent = `📍 Ready — but accuracy is low (±${Math.round(acc)}m)`;
        } else {
            statusMessage.textContent = `✅ Ready. Drop a pin! (±${Math.round(acc)}m)`;
        }

        debugTLat.textContent = "--";
        debugTLon.textContent = "--";
        debugBearing.textContent = "--";
        if (currentHeading !== null) {
            debugHeading.textContent = currentHeading.toFixed(1) + "°";
        }
    }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

let isAnimating = false;

setTargetBtn.addEventListener('click', () => {
    if (currentLocation && !isAnimating && !setTargetBtn.disabled) {
        isAnimating = true;
        setTargetBtn.classList.add('hidden');
        statusMessage.textContent = "Dropping pin...";

        const pinIcon = document.getElementById('pinIcon');
        const arrowEl = document.getElementById('arrow');

        pinIcon.classList.remove('floating');
        pinIcon.classList.add('dropping');

        setTimeout(() => {
            // Use smoothed location for pin
            const smoothed = getSmoothedLocation();
            targetLocation = smoothed
                ? { ...smoothed, accuracy: currentLocation.accuracy }
                : { ...currentLocation };

            lastSavedTarget = { ...targetLocation };
            restoreTargetBtn.classList.add('hidden'); // hide restore while pin is active

            pinIcon.classList.add('hidden');
            arrowEl.classList.add('active');
            clearTargetBtn.classList.remove('hidden');
            isAnimating = false;
            updateUI();
        }, 600);

    } else if (!currentLocation) {
        alert("Location not yet available. Please wait.");
    }
});

clearTargetBtn.addEventListener('click', () => {
    targetLocation = null;
    clearTargetBtn.classList.add('hidden');
    setTargetBtn.classList.remove('hidden');
    if (lastSavedTarget) restoreTargetBtn.classList.remove('hidden');

    const pinIcon = document.getElementById('pinIcon');
    const arrowEl = document.getElementById('arrow');

    arrowEl.classList.remove('active');
    pinIcon.classList.remove('hidden', 'dropping');
    pinIcon.classList.add('floating');

    updateUI();
});

restoreTargetBtn.addEventListener('click', () => {
    if (lastSavedTarget) {
        targetLocation = { ...lastSavedTarget };
        restoreTargetBtn.classList.add('hidden');
        setTargetBtn.classList.add('hidden');
        clearTargetBtn.classList.remove('hidden');

        const pinIcon = document.getElementById('pinIcon');
        const arrowEl = document.getElementById('arrow');

        pinIcon.classList.add('hidden');
        arrowEl.classList.add('active');
        updateUI();
    }
});

debugToggle.addEventListener('click', () => {
    debugPanel.classList.toggle('hidden');
    debugToggle.textContent = debugPanel.classList.contains('hidden')
        ? 'Show Debug Info'
        : 'Hide Debug Info';
});

grantPermissionBtn.addEventListener('click', requestOrientationPermission);

// ─── Geolocation ──────────────────────────────────────────────────────────────

function initGeolocation() {
    if (!navigator.geolocation) {
        statusMessage.textContent = "Geolocation is not supported by your browser.";
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;

            addToBuffer(latitude, longitude);
            const smoothed = getSmoothedLocation();

            currentLocation = {
                latitude: smoothed.latitude,
                longitude: smoothed.longitude,
                accuracy
            };

            updateUI();
        },
        (error) => {
            console.error("Geolocation error:", error);
            if (error.code === error.TIMEOUT) {
                statusMessage.textContent = "Location timed out. Try moving near a window.";
            } else {
                statusMessage.textContent = "Location error: " + error.message;
            }
        },
        getGeoOptions()
    );
}

// ─── Compass ──────────────────────────────────────────────────────────────────

let smoothedHeading = null;
const FILTER_FACTOR = 0.15;

function handleOrientation(event) {
    let rawHeading = null;

    if (event.webkitCompassHeading !== undefined) {
        rawHeading = event.webkitCompassHeading; // iOS — already absolute
    } else if (event.alpha !== null) {
        rawHeading = 360 - event.alpha; // Android
    }

    if (rawHeading !== null) {
        if (smoothedHeading === null) {
            smoothedHeading = rawHeading;
        } else {
            let diff = rawHeading - smoothedHeading;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            smoothedHeading += diff * FILTER_FACTOR;
            smoothedHeading = (smoothedHeading + 360) % 360;
        }
        currentHeading = smoothedHeading;
        updateUI();
    }
}

function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                    permissionOverlay.classList.add('hidden');
                } else {
                    alert('Permission to access device orientation was denied.');
                }
            })
            .catch(console.error);
    } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
        permissionOverlay.classList.add('hidden');
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function initApp() {
    createModeToggle();

    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        permissionOverlay.classList.remove('hidden');
    } else {
        requestOrientationPermission();
    }

    initGeolocation();
}

initApp();