// Elements
const arrow = document.getElementById('arrow');
const distanceValue = document.getElementById('distanceValue');
const statusMessage = document.getElementById('statusMessage');
const setTargetBtn = document.getElementById('setTargetBtn');
const clearTargetBtn = document.getElementById('clearTargetBtn');

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
let currentHeading = null;
let watchId = null;

// Constants
const R = 6371e3; // Earth's radius in metres

// Math Engine
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

    return R * c; // in metres
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

    return (toDegrees(θ) + 360) % 360; // in degrees
}

// Update UI
function updateUI() {
    if (!currentLocation) {
        statusMessage.textContent = "Waiting for GPS...";
        return;
    }

    debugLat.textContent = currentLocation.latitude.toFixed(6);
    debugLon.textContent = currentLocation.longitude.toFixed(6);
    debugAccuracy.textContent = currentLocation.accuracy ? currentLocation.accuracy.toFixed(1) : "--";

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

        if (distance < 1) {
            distanceValue.textContent = "On Location";
            distanceValue.style.fontSize = "2.5rem"; // slightly smaller to fit
            document.querySelector('.unit').style.display = 'none';
            statusMessage.textContent = "📍 You have arrived!";
        } else {
            distanceValue.textContent = distance < 10 ? distance.toFixed(1) : Math.round(distance);
            distanceValue.style.fontSize = ""; // reset
            document.querySelector('.unit').style.display = 'inline';
            
            if (currentHeading !== null) {
                statusMessage.textContent = "Navigating to Target";
                // Calculate arrow rotation relative to phone's current heading
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
        statusMessage.textContent = "Ready. Drop a pin to start.";
        debugTLat.textContent = "--";
        debugTLon.textContent = "--";
        debugBearing.textContent = "--";
        if (currentHeading !== null) {
            debugHeading.textContent = currentHeading.toFixed(1) + "°";
        }
    }
}

let isAnimating = false;

// Event Listeners
setTargetBtn.addEventListener('click', () => {
    if (currentLocation && !isAnimating) {
        isAnimating = true;
        setTargetBtn.classList.add('hidden');
        statusMessage.textContent = "Dropping pin...";

        const pinIcon = document.getElementById('pinIcon');
        const arrow = document.getElementById('arrow');

        pinIcon.classList.remove('floating');
        pinIcon.classList.add('dropping');

        setTimeout(() => {
            targetLocation = { ...currentLocation };
            pinIcon.classList.add('hidden');
            arrow.classList.add('active');
            clearTargetBtn.classList.remove('hidden');
            isAnimating = false;
            updateUI();
        }, 600); // Wait for drop animation

    } else if (!currentLocation) {
        alert("Cannot set target: GPS location not yet available.");
    }
});

clearTargetBtn.addEventListener('click', () => {
    targetLocation = null;
    clearTargetBtn.classList.add('hidden');
    setTargetBtn.classList.remove('hidden');

    const pinIcon = document.getElementById('pinIcon');
    const arrow = document.getElementById('arrow');

    arrow.classList.remove('active');
    pinIcon.classList.remove('hidden', 'dropping');
    pinIcon.classList.add('floating');

    updateUI();
});

debugToggle.addEventListener('click', () => {
    debugPanel.classList.toggle('hidden');
});

grantPermissionBtn.addEventListener('click', requestOrientationPermission);

// Sensors Initialization
function initGeolocation() {
    if (!navigator.geolocation) {
        statusMessage.textContent = "Geolocation is not supported by your browser.";
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            updateUI();
        },
        (error) => {
            console.error("Geolocation error:", error);
            statusMessage.textContent = "GPS Error: " + error.message;
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
}

let smoothedHeading = null;
const FILTER_FACTOR = 0.15; // 15% new value, 85% old value

function handleOrientation(event) {
    let alpha = event.alpha;
    let webkitCompassHeading = event.webkitCompassHeading;
    let rawHeading = null;

    if (webkitCompassHeading !== undefined) {
        // iOS
        rawHeading = webkitCompassHeading;
    } else if (alpha !== null) {
        // Android (alpha is roughly 360 - compass heading, but needs absolute device orientation)
        // WebKit/Blink browsers generally use absolute alpha if absolute is supported
        // In standard absolute DeviceOrientation, alpha is the angle between device and North.
        // But the mapping is complex. Assuming a simple implementation for now:
        rawHeading = 360 - alpha;
    }

    if (rawHeading !== null) {
        if (smoothedHeading === null) {
            smoothedHeading = rawHeading;
        } else {
            // Calculate shortest path for angle difference
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
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation, true);
                    permissionOverlay.classList.add('hidden');
                    statusMessage.textContent = "Compass connected.";
                } else {
                    alert('Permission to access device orientation was denied.');
                }
            })
            .catch(console.error);
    } else {
        // non-iOS 13+ devices
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        // Fallback
        window.addEventListener('deviceorientation', handleOrientation, true);
        permissionOverlay.classList.add('hidden');
    }
}

// App Initialization
function initApp() {
    // Check if we need to show the permission overlay for iOS
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        permissionOverlay.classList.remove('hidden');
    } else {
        // Automatically attach for non-iOS
        requestOrientationPermission();
    }

    initGeolocation();
}

// Start
initApp();
