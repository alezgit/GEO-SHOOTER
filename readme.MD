# 🔫 GEO-SHOOTER: Battle Arena

**GEO-SHOOTER** is a high-performance, multiplayer web-based battle arena game featuring a unique "Screen-to-Phone" architecture. Players use their smartphones as motion-sensing controllers to battle in real-time on a centralized game screen, connected via low-latency WebSockets.

---

## ✨ Features

- **Motion-Controlled Gameplay**: Move your character by tilting your mobile device in landscape mode, utilizing the gyroscope and accelerometer.
- **Dual-Screen Architecture**:
- **Main Screen**: High-fidelity game engine and scoreboard rendered on HTML5 Canvas.
- **Mobile Controller**: Personalized dashboard with class selection, radar charts for stats, and haptic feedback.

- **Multiplayer Room System**: Seamlessly join friends using unique Room IDs.
- **Hero Classes & Abilities**: Choose from 5 distinct classes with unique special abilities:
- 🛡️ **Tank**: High health + Shield ability.
- 🎯 **Sniper**: High damage + Piercing shot.
- 💨 **Runner**: High speed + Dash ability.
- 💚 **Balanced**: Versatile stats + Heal burst.
- 🔥 **Assault**: High fire rate + Triple shot.

- **Dynamic Arenas**: Multiple maps including _Training Ground_, _Classic Arena_, _Urban Warfare_, _The Pit_, and the high-stakes _Death Zone_.

---

## 🛠️ Tech Stack

- **Backend**: [Node.js](https://nodejs.org/) & [Express](https://expressjs.com/).
- **Real-time Communication**: [ws (WebSockets)](https://github.com/websockets/ws).
- **Frontend**: HTML5 Canvas, CSS3 Grid/Animations, Vanilla JavaScript (ES6+).
- **Libraries**:
- **Chart.js**: For character stat visualization on the controller.
- **Eruda**: Mobile console for on-device debugging.

---

## 🚀 Installation & Setup

### 1. Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### 2. Install Dependencies

```bash
# Install core server dependencies
npm install express ws

```

### 3. SSL Certificate Setup (Required for Mobile Sensors)

Modern mobile browsers (iOS/Android) require a secure context (**HTTPS**) to access the Device Orientation API (gyroscope).

1. **Create a Directory**: Create a folder named `certs` in your project root.
2. **Generate Certificates**: You can use OpenSSL to generate self-signed certificates:

```bash
openssl req -nodes -new -x509 -keyout certs/key.pem -out certs/cert.pem

```

3. **Automatic Detection**: The `server.js` script is pre-configured to look for `cert.pem` and `key.pem` in the following locations:

- `./certs/`
- `../certs/`

### 4. Running the Game

```bash
# Start the server
node server.js or npm run start

```

---

## 🎮 How to Play

1. **Launch the Hub**: Open `landing.html` (or your server root) on your computer.
2. **Host the Screen**: Select **"OPEN GAME SCREEN"**, choose a map, enter a Room ID, and click **Connect**.
3. **Join with Phone**: Open the server URL on your smartphone, select **"OPEN CONTROLLER"**, and enter the **same Room ID**.
4. **Calibrate & Battle**:

- Select your hero class.
- Follow the on-screen prompts to calibrate your phone's sensors.
- Tilt your phone to move and tap the **SHOOT** or **SPECIAL** buttons to play.

---

## 📂 Project Structure

- `sounds`: Folder containing sounds used throughout the game.
- `server.js`: Node.js server managing rooms and WebSocket synchronization.
- `landing.html`: Entry gateway for selecting host or player roles.
- `GEOSHOOTER.html`: The core game engine, map logic, and physics.
- `controller_GEOSHOOTER.html`: Mobile interface for motion input and character selection.

---
