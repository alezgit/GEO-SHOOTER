// server.js
const express = require("express");
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");

const app = express();

// Try to load HTTPS certificates
let httpsServer = null;
let useHttps = false;

// Set to false to use local HTTPS with self-signed certs
const FORCE_HTTP_MODE = false;

if (!FORCE_HTTP_MODE) {
  try {
    // Try multiple paths for certificates
    const certPaths = [
      {
        cert: path.join(__dirname, "..", "certs", "cert.pem"),
        key: path.join(__dirname, "..", "certs", "key.pem"),
      },
      {
        cert: path.join(__dirname, "certs", "cert.pem"),
        key: path.join(__dirname, "certs", "key.pem"),
      },
      { cert: "./certs/cert.pem", key: "./certs/key.pem" },
    ];

    let certPath = null;
    let keyPath = null;

    for (const paths of certPaths) {
      if (fs.existsSync(paths.cert) && fs.existsSync(paths.key)) {
        certPath = paths.cert;
        keyPath = paths.key;
        break;
      }
    }

    if (certPath && keyPath) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      httpsServer = https.createServer(httpsOptions, app);
      useHttps = true;
      console.log(`✅ HTTPS certificates loaded from ${certPath}`);
    } else {
      console.log("⚠️  HTTPS certificates not found, using HTTP only");
    }
  } catch (err) {
    console.log("⚠️  Error loading HTTPS certificates:", err.message);
  }
} else {
  console.log("ℹ️  HTTP mode enabled for ngrok");
}

// Create HTTP server (fallback)
const httpServer = http.createServer(app);

// WebSocket server (will use HTTPS if available, HTTP otherwise)
const server = useHttps ? httpsServer : httpServer;
const wss = new WebSocket.Server({ server });

const rooms = {}; // { roomId: { pc: ws, players: [{ id, ws, character, ready }] } }

// Serve static files (the two HTML pages)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "landing.html"));
});

app.get("/pc", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "GEOSHOOTER.html"))
);

app.get("/phone", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "controller_GEOSHOOTER.html"))
);

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "join") {
        const roomId = data.room;
        if (!rooms[roomId]) {
          rooms[roomId] = { pc: null, players: [] };
        }

        if (data.role === "pc") {
          rooms[roomId].pc = ws;
          ws.role = "pc";
          ws.room = roomId;
          console.log(`PC display joined room ${roomId}`);
        } else if (data.role === "phone") {
          const playerId = `player_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
          const player = { id: playerId, ws, character: null, ready: false };
          rooms[roomId].players.push(player);
          ws.playerId = playerId;
          ws.role = "phone";
          ws.room = roomId;

          // Send player ID back
          ws.send(JSON.stringify({ type: "player_id", id: playerId }));
          console.log(`Player ${playerId} joined room ${roomId}`);

          // Notify PC of new player
          if (rooms[roomId].pc) {
            rooms[roomId].pc.send(
              JSON.stringify({
                type: "player_joined",
                playerId,
                totalPlayers: rooms[roomId].players.length,
              })
            );
          }
        }
      } else if (data.type === "character_select") {
        // Player selected a character
        const room = rooms[ws.room];
        if (room) {
          const player = room.players.find((p) => p.id === ws.playerId);
          if (player) {
            player.character = data.character;
            player.ready = true;

            // Broadcast to PC
            if (room.pc) {
              room.pc.send(
                JSON.stringify({
                  type: "character_selected",
                  playerId: ws.playerId,
                  character: data.character,
                })
              );
            }

            // Check if all players are ready
            const allReady = room.players.every((p) => p.ready);
            if (allReady && room.players.length > 0) {
              // Start game
              const playerData = room.players.map((p) => ({
                id: p.id,
                character: p.character,
              }));

              if (room.pc) {
                room.pc.send(
                  JSON.stringify({
                    type: "game_start",
                    players: playerData,
                  })
                );
              }

              room.players.forEach((p) => {
                p.ws.send(
                  JSON.stringify({
                    type: "game_start",
                    players: playerData,
                  })
                );
              });
            }
          }
        }
      } else if (data.type === "control") {
        // Movement from phone
        const room = rooms[ws.room];
        if (room && room.pc) {
          room.pc.send(
            JSON.stringify({
              type: "player_move",
              playerId: ws.playerId,
              ax: data.ax,
              ay: data.ay,
            })
          );
        }
      } else if (data.type === "shoot") {
        // Player shoots
        const room = rooms[ws.room];
        if (room && room.pc) {
          room.pc.send(
            JSON.stringify({
              type: "player_shoot",
              playerId: ws.playerId,
            })
          );
        }
      } else if (data.type === "ability") {
        // Player uses ability
        const room = rooms[ws.room];
        if (room && room.pc) {
          room.pc.send(
            JSON.stringify({
              type: "player_ability",
              playerId: ws.playerId,
            })
          );
        }
      } else if (data.type === "game_update") {
        // PC broadcasts game state to all players
        const room = rooms[ws.room];
        if (room && ws.role === "pc") {
          room.players.forEach((p) => {
            p.ws.send(msg);
          });
        }
      }
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });

  ws.on("close", () => {
    if (ws.room && rooms[ws.room]) {
      if (ws.role === "pc") {
        delete rooms[ws.room].pc;
        console.log(`PC disconnected from room ${ws.room}`);
      } else if (ws.role === "phone") {
        const room = rooms[ws.room];
        room.players = room.players.filter((p) => p.id !== ws.playerId);

        // Notify PC
        if (room.pc) {
          room.pc.send(
            JSON.stringify({
              type: "player_left",
              playerId: ws.playerId,
            })
          );
        }
        console.log(`Player ${ws.playerId} disconnected from room ${ws.room}`);
      }
    }
  });
});

const PORT = 8080;
const HTTPS_PORT = 8443;

if (useHttps) {
  server.listen(HTTPS_PORT, "0.0.0.0", () => {
    const interfaces = require("os").networkInterfaces();
    let localIp = "localhost";

    Object.keys(interfaces).forEach((ifname) => {
      interfaces[ifname].forEach((iface) => {
        if (iface.family === "IPv4" && !iface.internal) {
          localIp = iface.address;
        }
      });
    });

    console.log("\n🔒 HTTPS Server running!");
    console.log(`   Local:   https://localhost:${HTTPS_PORT}`);
    console.log(`   Network: https://${localIp}:${HTTPS_PORT}`);
    console.log("\n📱 For iOS devices:");
    console.log(
      `   1. On iPhone, go to: https://${localIp}:${HTTPS_PORT}/phone`
    );
    console.log(`   2. Accept the self-signed certificate warning`);
    console.log(`   3. Motion sensors will work!\n`);
    console.log("💡 Alternative: Use ngrok for a trusted certificate");
    console.log("   Run: npx ngrok http 8080\n");
  });
} else {
  httpServer.listen(PORT, "0.0.0.0", () => {
    const interfaces = require("os").networkInterfaces();
    let localIp = "localhost";

    Object.keys(interfaces).forEach((ifname) => {
      interfaces[ifname].forEach((iface) => {
        if (iface.family === "IPv4" && !iface.internal) {
          localIp = iface.address;
        }
      });
    });

    console.log(
      "\n⚠️  HTTP Server running (motion sensors won't work on iOS!)"
    );
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://${localIp}:${PORT}`);
    console.log("\n📱 To enable motion sensors on iOS:");
    console.log("   1. Add certificates to ../certs/ folder, OR");
    console.log("   2. Use ngrok: npx ngrok http 8080\n");
  });
}
