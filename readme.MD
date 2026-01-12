# Web Technologies - FEUP-MM0047-2025/2026

#### Group Members (G05)

```
Alessandro Zocchi
Dayo Ashaolu
Paolo Pascarelli
```

# GEO-SHOOTER: Battle Arena

**GEO-SHOOTER** is a fast-paced, multiplayer battle arena game designed for local cooperative or competitive play. It features a unique control scheme where players use their mobile devices as motion-sensitive controllers to navigate and battle on a central computer screen.

---

## 🚀 Key Features

- **Multiplayer Arena**: Battle against friends in real-time using a room-based matchmaking system.
- **Motion Control**: Use your smartphone's gyroscope and accelerometer to move your character.
- **Multiple Character Classes**: Choose from five distinct fighters: Tank, Sniper, Runner, Balanced, and Assault—each with unique stats and special abilities like Shields or Dashing.
- **Dynamic Maps**: Six different arenas ranging from "Training Grounds" to "The Pit," featuring hazards like toxic zones, moving walls, and gravity anomalies.
- **Immersive Audio**: Full audio system including background music and sound effects for gunfire, power-ups, and respawns.

---

## 🛠 Tech Stack

- **Backend**: Node.js, Express.
- **Communication**: WebSockets (`ws`) for low-latency player input and game state synchronization.
- **Frontend**: HTML5 Canvas, Vanilla JavaScript, CSS3.
- **Libraries**:
- `Chart.js`: Used for controller UI visualizations.
- `qrcode.min.js`: Generates join codes for mobile devices.

---

## 📁 Project Structure

To ensure the project runs correctly, the files are organised as follows:

```text
/
├── certs/                # Required for HTTPS (Motion sensor support)
│   ├── cert.pem
│   └── key.pem
├── public/               # Static assets served by Express
│   ├── fonts/           # CSS files (game.css, landing.css, controller.css)
│   ├── scripts/          # Client-side JS (landing.js, game.js, controller.js)
│   ├── scripts/          # Client-side JS (landing.js, game.js, controller.js)
│   ├── sounds/           # Audio files (.mp3)
│   ├── styles/          # Client-side JS (landing.js, game.js, controller.js)
│   ├── vendor/           # Third-party scripts (qrcode.min.js)
│   ├── landing.html      # Main entry point
│   ├── game.html         # Main game arena
│   └── controller.html   # Mobile controller interface
├── server.js             # Node.js backend server
└── package.json          # Project dependencies

```

---

## 📥 Installation Guide

### 1. Prerequisites

Ensure you have **Node.js** (v14 or higher) and **npm** installed on your machine.

### 2. Install Dependencies

Initialize your project and install the required Node.js packages:

```bash
npm init -y
npm install express ws

```

### 3. Setup SSL (Crucial for Mobile)

Mobile browsers require a secure connection (**HTTPS**) to access motion sensors (gyroscope).

1. Create a `certs/` folder in the root directory.
2. Place your `cert.pem` and `key.pem` files inside.

- _Note: For local testing, you can generate self-signed certificates using OpenSSL._

### 4. Run the Server

Start the application using:

```bash
node server.js

```

---

## 🎮 How to Play

1. **Launch the Game**: On your computer, open a browser and go to `https://<YOUR-IP>:8443` preferably or `https://localhost:8443` alternatively.
2. **Access the Controller**:

- Scan the QR code displayed on the "Power On" screen or the Game Arena.
- Alternatively, visit `https://<YOUR-IP>:8443/phone` on your mobile device.

3. **Join a Room**: Enter the same Room ID on both the PC and the Mobile device.
4. **Select Character**: Choose your fighter on your phone:

- **🛡️ Tank**: High health, low speed, has a **Shield** ability.
- **🎯 Sniper**: High damage, long range, has a **Piercing Shot** ability.
- **💨 Runner**: Extreme speed, low health, has a **Dash** ability.
- **💚 Balanced**: All-around stats with a **Heal Burst** ability.
- **🔥 Assault**: High fire rate with a **Triple Shot** ability.

5. **Calibrate & Battle**:

- Select your hero class.
- Follow the on-screen prompts to calibrate your phone's sensors.
- Tilt your phone to move and tap the **SHOOT** or **SPECIAL** buttons to play.

---

## ⚠️ Troubleshooting: iOS & Motion Sensors

If motion controls are not working on iOS devices:

1. Ensure you are using **HTTPS**, as motion sensors are blocked on standard HTTP.
2. When visiting the site on an iPhone, you may need to manually "Accept" the self-signed certificate warning.
3. Ensure "Motion & Orientation Access" is enabled in your mobile browser settings.
