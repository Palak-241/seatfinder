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

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

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

    if (targetLocation) {
        const distance = calculateDistance(
            currentLocation.latitude, currentLocation.longitude,
            targetLocation.latitude, targetLocation.longitude
        );
        
        distanceValue.textContent = distance < 10 ? distance.toFixed(1) : Math.round(distance);
        
        const bearing = calculateBearing(
            currentLocation.latitude, currentLocation.longitude,
            targetLocation.latitude, targetLocation.longitude
        );

        debugTLat.textContent = targetLocation.latitude.toFixed(6);
        debugTLon.textContent = targetLocation.longitude.toFixed(6);
        debugBearing.textContent = bearing.toFixed(1) + "°";

        if (currentHeading !== null) {
            statusMessage.textContent = "Navigating to Target";
            // Calculate arrow rotation relative to phone's current heading
            // If bearing is 90 (East) and heading is 90 (Phone points East), arrow points straight (0)
            // If bearing is 90 (East) and heading is 0 (Phone points North), arrow points right (90)
            let arrowRotation = bearing - currentHeading;
            arrow.style.transform = `rotate(${arrowRotation}deg)`;
            debugHeading.textContent = currentHeading.toFixed(1) + "°";
        } else {
            statusMessage.textContent = "Waiting for Compass...";
        }
    } else {
        distanceValue.textContent = "--";
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

// Event Listeners
setTargetBtn.addEventListener('click', () => {
    if (currentLocation) {
        targetLocation = { ...currentLocation };
        setTargetBtn.classList.add('hidden');
        clearTargetBtn.classList.remove('hidden');
        statusMessage.textContent = "Target set! Walk away to see the distance.";
        updateUI();
    } else {
        alert("Cannot set target: GPS location not yet available.");
    }
});

clearTargetBtn.addEventListener('click', () => {
    targetLocation = null;
    clearTargetBtn.classList.add('hidden');
    setTargetBtn.classList.remove('hidden');
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
                longitude: position.coords.longitude
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

function handleOrientation(event) {
    let alpha = event.alpha;
    let webkitCompassHeading = event.webkitCompassHeading;

    if (webkitCompassHeading !== undefined) {
        // iOS
        currentHeading = webkitCompassHeading;
    } else if (alpha !== null) {
        // Android (alpha is roughly 360 - compass heading, but needs absolute device orientation)
        // WebKit/Blink browsers generally use absolute alpha if absolute is supported
        // In standard absolute DeviceOrientation, alpha is the angle between device and North.
        // But the mapping is complex. Assuming a simple implementation for now:
        currentHeading = 360 - alpha;
    }
    
    updateUI();
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
