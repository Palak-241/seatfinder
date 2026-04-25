 Architecture & Tech Stack: "Where's My Seat?"

A lightweight, highly efficient stack designed to get a working wayfinding prototype up and running quickly. This approach leans into Python's "antigravity" philosophy—doing complex things with minimal boilerplate—while keeping the deployment simple and the UI clean and functional.

## 1. The Core Application Stack

### Option A: The "Antigravity" Route (Flet)
If you want to build a mobile-ready interface entirely in Python without dealing with JavaScript or mobile SDKs:
* **Framework:** **Flet** (Python wrapper for Flutter). Allows you to build real-time, reactive UIs that look native on mobile devices but are coded entirely in Python.
* **UI/UX:** Supports clean, minimalist styling (glassmorphism, subtle drop shadows, custom tealtone accents) out of the box. 
* **Math & Logic:** Standard Python `math` library for the trigonometric bearing calculations.

### Option B: The Zero-Install PWA (Vanilla Web APIs)
If you want instant testing via a mobile browser without packaging an app:
* **Frontend:** Vanilla HTML5, CSS, and JavaScript. Keep it strictly functional.
* **Sensors:** * `DeviceOrientation Event API` (specifically the `alpha` value, or `webkitCompassHeading` for iOS) to read the phone's hardware magnetometer.
* **Hosting for Mobile Testing:** Serve locally from your Arch Linux environment using `python -m http.server 8000`. Expose it to the internet using a tool like `ngrok` or `Cloudflare Tunnels`. **HTTPS is strictly required** by mobile browsers to access compass and motion sensors.

## 2. Proximity & Tracking Integrations (Phased Approach)

### Phase 1: Math & Magnetometer (Current Prototype)
* **Hardware:** Mobile phone compass.
* **Logic:** A simulated `(X, Y)` grid system. The user updates their position via on-screen D-pad controls, while the physical phone rotation dictates the dynamic directional arrow on the screen.

### Phase 2: Radio Proximity (BLE)
* **Library:** `Bleak` (Cross-platform Python BLE client).
* **Hardware:** Any powered-on Bluetooth device (earbuds, smartwatch, or a spare laptop) acting as the target "seat" beacon.
* **Execution:** Write an asynchronous Python script that constantly scans for the target MAC address, reads the RSSI (signal strength), and applies a Kalman filter or moving average to smooth out signal reflections and wall interference.

### Phase 3: The AR / Visual Positioning Fallback
* **Libraries:** `OpenCV` (`cv2`) and `NumPy`.
* **Hardware:** High-FPS camera feed.
* **Execution:** Instead of relying solely on radio signals, print an ArUco marker and place it on the target seat. Use OpenCV's `cv2.aruco.detectMarkers` and `cv2.solvePnP` to map 3D translation vectors in real-time, rendering the directional arrow directly over a live video feed.

---

## 3. The Math Engine

Whether you write this in Python (for Flet) or JavaScript (for the Web), the core logic that powers the directional pointer remains the same. Here is the Python implementation: