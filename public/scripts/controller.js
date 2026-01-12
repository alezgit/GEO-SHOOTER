      const CHARACTERS = {
        TANK: {
          name: "Tank",
          color: "#4CAF50",
          spider: {
            speed: 20,
            health: 95,
            damage: 70,
            fireRate: 35,
            defense: 80,
          },
          ability: { name: "Shield", icon: "ABILITY", cooldown: 20000 },
        },
        SNIPER: {
          name: "Sniper",
          color: "#2196F3",
          spider: {
            speed: 70,
            health: 30,
            damage: 100,
            fireRate: 25,
            defense: 75,
          },
          ability: { name: "Piercing Shot", icon: "ABILITY", cooldown: 12000 },
        },
        RUNNER: {
          name: "Runner",
          color: "#FFC107",
          spider: {
            speed: 100,
            health: 40,
            damage: 30,
            fireRate: 100,
            defense: 30,
          },
          ability: { name: "Dash", icon: "ABILITY", cooldown: 8000 },
        },
        BALANCED: {
          name: "Balanced",
          color: "#9C27B0",
          spider: {
            speed: 60,
            health: 60,
            damage: 60,
            fireRate: 60,
            defense: 60,
          },
          ability: { name: "Heal Burst", icon: "ABILITY", cooldown: 15000 },
        },
        ASSAULT: {
          name: "Assault",
          color: "#FF5722",
          spider: {
            speed: 70,
            health: 50,
            damage: 65,
            fireRate: 75,
            defense: 40,
          },
          ability: { name: "Triple Shot", icon: "ABILITY", cooldown: 12000 },
        },
      };

      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${window.location.host}`);
      const statusEl = document.getElementById("status");

      let selectedCharacter = null;
      let sensorActive = false;
      let roomId = null;
      let playerId = null;
      let abilityCooldownEnd = 0;
      let cooldownInterval = null;
      let calibrationX = 0;
      let calibrationSamples = [];
      let isCalibrating = false;
      let calibrationActive = false;
      let isGravityChaos = false;

      let axisConfig = {
        invertX: false,
        invertY: false,
        swapAxes: false,
        sensUp: 1.0,
        sensDown: 1.0,
        sensLeft: 1.0,
        sensRight: 1.0,
      };

      try {
        const saved = localStorage.getItem("geoshooter_axis_config");
        if (saved) {
          const parsed = JSON.parse(saved);
          axisConfig = { ...axisConfig, ...parsed };

          document.getElementById("sens-up-val").textContent =
            axisConfig.sensUp.toFixed(1) + "x";
          document.getElementById("sens-down-val").textContent =
            axisConfig.sensDown.toFixed(1) + "x";
          document.getElementById("sens-left-val").textContent =
            axisConfig.sensLeft.toFixed(1) + "x";
          document.getElementById("sens-right-val").textContent =
            axisConfig.sensRight.toFixed(1) + "x";
        }
      } catch (e) {
        console.log("No saved axis config");
      }

      socket.onopen = () => {
        statusEl.textContent = "🟢 Connected - Enter Room ID";
        statusEl.style.background = "rgba(0,255,136,0.2)";
      };

      socket.onmessage = (event) => {
        try {
          let data;
          if (typeof event.data === "string") {
            data = JSON.parse(event.data);
          } else if (typeof event.data === "object") {
            data = event.data;
          } else {
            return;
          }

          // 1. EVENT START (Triggers the visual box + Turns ON effects)
          if (data.type === "arena_event") {
            triggerGameEvent(data.event); // Shows the visual box

            if (data.event === "INFERNO") {
              setupMicrophone();
            }
            if (data.event === "GRAVITY_CHAOS") {
              isGravityChaos = true; // <--- Turns CHAOS ON
            }
          }

          // 2. EVENT END (Triggers hiding the box + Turns OFF effects)
          else if (data.type === "arena_event_end") {
            isGravityChaos = false; // <--- CRITICAL: Turns CHAOS OFF
            hideEvent(); // Hides the visual box
          } else if (data.type === "player_id") {
            playerId = data.id;
          } else if (data.type === "game_start") {
            document.getElementById("character-select").style.display = "none";
            document.getElementById("rotation-message").style.display = "flex";
            setupAbilityUI();
          } else if (data.type === "game_update" && data.players) {
            const myData = data.players.find((p) => p.id === playerId);
            if (myData) updatePlayerUI(myData);
          } else if (data.type === "game_end") {
            const isWinner = data.winner === playerId;
            showGameOver(isWinner, data.character);
          } else if (data.type === "restart_game") {
            document.getElementById("game-controller").style.display = "none";
            document.getElementById("rotation-message").style.display = "none";
            document.getElementById("game-over").style.display = "none";

            document.getElementById("character-select").style.display = "block";
            document.querySelector(".header").style.display = "block";

            selectedCharacter = null;
            document
              .querySelectorAll(".character-card")
              .forEach((c) => c.classList.remove("selected"));
            document.getElementById("confirm-btn").disabled = true;

            sensorActive = false;
            window.removeEventListener("devicemotion", handleMotion);

            console.log("Game restarted - select character");

            
          }
          // ----------------------------------------------------
// ADD THIS BLOCK TO FIX THE ABILITY RECHARGE
// ----------------------------------------------------
else if (data.type === 'status') {
    if (data.status === 'ability_ready') {
        // 1. Reset the timer variable
        abilityCooldownEnd = 0; 
        
        // 2. Visually update the button immediately
        updateAbilityCooldown(); 
        
        // 3. Vibrate to tell the player (Optional)
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    } 
    // Only include this 'else' if you actually have a showStatusWarning function defined
    // else {
    //    showStatusWarning(data.status, data.message);
    // }
}
// ----------------------------------------------------
        } catch (e) {
          console.error("Error parsing message:", e);
        }
      };

      socket.onerror = () => {
        statusEl.textContent = "❌ Connection Error";
        statusEl.style.background = "rgba(255,0,0,0.2)";
      };

      socket.onclose = () => {
        statusEl.textContent = "🔴 Disconnected";
        statusEl.style.background = "rgba(255,0,0,0.2)";
      };

function updatePlayerUI(data) {
        // 1. Update Health
        const healthPercent = (data.health / data.maxHealth) * 100;
        document.getElementById("health-fill").style.width = healthPercent + "%";
        document.getElementById("health-text").textContent = Math.ceil(data.health) + "/" + data.maxHealth;

        // 2. Check for Ability Item Pickup (The Fix)
        // If the server tells us we collected the ability item OR the cooldown is strictly 0:
        if (data.dropCollected === "ABILITY" || (data.abilityCooldown === 0 && abilityCooldownEnd > Date.now())) {
            // Force reset local timer
            abilityCooldownEnd = 0;
            
            // Force visual update immediately
            updateAbilityCooldown(); 
            
            const abilityBtn = document.getElementById("ability-btn");
            if (abilityBtn) {
                abilityBtn.classList.remove("on-cooldown");
                abilityBtn.classList.add("ready");
            }
            
            // Optional: Haptic feedback
            if (navigator.vibrate) navigator.vibrate(50);
        }
      }

      function setupAbilityUI() {
        if (!selectedCharacter) return;

        const char = CHARACTERS[selectedCharacter];
        document.getElementById("ability-icon").textContent = char.ability.icon;

        if (cooldownInterval) clearInterval(cooldownInterval);
        cooldownInterval = setInterval(updateAbilityCooldown, 100);
      }

      function updateAbilityCooldown() {
        const now = Date.now();
        const remaining = abilityCooldownEnd - now;
        const char = CHARACTERS[selectedCharacter];

        const abilityBtn = document.getElementById("ability-btn");
        const overlay = document.getElementById("cooldown-overlay");
        // const cooldownText = document.getElementById("cooldown-text");

        if (remaining > 0) {
          const percent = (remaining / char.ability.cooldown) * 100;
          overlay.style.height = percent + "%";
          cooldownText.style.display = "block";
          cooldownText.textContent = Math.ceil(remaining / 1000) + "s";
          abilityBtn.classList.add("on-cooldown");
          abilityBtn.classList.remove("ready");
        } else {
          overlay.style.height = "0%";
          cooldownText.style.display = "none";
          abilityBtn.classList.remove("on-cooldown");
          abilityBtn.classList.add("ready");
        }
      }

      function flashPowerUp(success = true) {
        const flash = document.getElementById("powerup-flash");
        flash.classList.remove("active", "fail");

        if (success) {
          flash.classList.add("active");
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } else {
          flash.classList.add("fail");
          if (navigator.vibrate) navigator.vibrate(50);
        }

        setTimeout(() => flash.classList.remove("active", "fail"), 500);
      }

      function showGameOver(isWinner, character) {
        const gameOver = document.getElementById("game-over");
        const title = document.getElementById("game-over-title");

        if (isWinner) {
          title.textContent = "VICTORY!";
          title.style.color = "#FFD700";
        } else {
          title.textContent = "ELIMINATED";
          title.style.color = "#ff4444";
        }

        gameOver.style.display = "flex";
      }

      document.getElementById("join-btn").addEventListener("click", () => {
        roomId = document.getElementById("room-input").value.trim() || "war123";

        socket.send(
          JSON.stringify({
            type: "join",
            role: "phone",
            room: roomId,
          })
        );

        statusEl.textContent = `🟢 Joined room: ${roomId}`;
        document.getElementById("room-section").style.display = "none";
        document.getElementById("character-select").style.display = "block";

        if (navigator.vibrate) navigator.vibrate(50);
      });

      let radarChart = null;
      const radarCanvas = document.getElementById("radarChart");

      if (window.Chart && radarCanvas) {
        const ctx = radarCanvas.getContext("2d");
        radarChart = new Chart(ctx, {
          type: "radar",
          data: {
            labels: ["Speed", "Health", "Damage", "Fire Rate", "Defense"],
            datasets: [
              {
                label: "Stats",
                data: [0, 0, 0, 0, 0],
                backgroundColor: "rgba(255, 69, 0, 0.2)",
                borderColor: "#ff4500",
                borderWidth: 2,
                pointBackgroundColor: "#ff4500",
                pointBorderColor: "#fff",
                pointRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
              r: {
                beginAtZero: true,
                max: 100,
                min: 0,
                ticks: {
                  stepSize: 25,
                  color: "#666",
                  backdropColor: "transparent",
                  font: { size: 10 },
                },
                grid: { color: "rgba(255,255,255,0.1)" },
                angleLines: { color: "rgba(255,255,255,0.1)" },
                pointLabels: {
                  color: "#fff",
                  font: { size: 12, weight: "bold" },
                  padding: 10,
                },
              },
            },
            plugins: { legend: { display: false } },
            layout: { padding: 5 },
          },
        });
      }

      function updateRadar(charKey) {
        const char = CHARACTERS[charKey];
        const spider = char.spider;

        if (radarChart) {
          radarChart.data.datasets[0].data = [
            spider.speed,
            spider.health,
            spider.damage,
            spider.fireRate,
            spider.defense,
          ];
          radarChart.data.datasets[0].backgroundColor = char.color + "40";
          radarChart.data.datasets[0].borderColor = char.color;
          radarChart.data.datasets[0].pointBackgroundColor = char.color;
          radarChart.update();
        }

        document.getElementById("selected-name").textContent = char.name;
        document.getElementById("selected-name").style.color = char.color;
        document.getElementById(
          "selected-ability"
        ).textContent = `${char.ability.name}`;

        const total =
          spider.speed +
          spider.health +
          spider.damage +
          spider.fireRate +
          spider.defense;
      }

      const cards = document.querySelectorAll(".character-card");
      const confirmBtn = document.getElementById("confirm-btn");

      cards.forEach((card) => {
        card.addEventListener("click", () => {
          cards.forEach((c) => c.classList.remove("selected"));
          card.classList.add("selected");
          selectedCharacter = card.dataset.char;
          updateRadar(selectedCharacter);
          confirmBtn.disabled = false;
          if (navigator.vibrate) navigator.vibrate(30);
        });
      });

      confirmBtn.addEventListener("click", async () => {
        if (!selectedCharacter) return;

        try {
          if (typeof DeviceMotionEvent.requestPermission === "function") {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission !== "granted") {
              alert("Motion sensors are required to play!");
              return;
            }
          }

          try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("🎤 Microphone permission granted");
          } catch (e) {
            console.warn("Microphone denied - blow feature will not work:", e);
          }
        } catch (e) {
          alert("Sensor permission denied: " + e.message);
          return;
        }

        socket.send(
          JSON.stringify({
            type: "character_select",
            character: selectedCharacter,
          })
        );

        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      });

      document
        .getElementById("rotation-ready-btn")
        .addEventListener("click", () => {
          document.getElementById("rotation-message").style.display = "none";
          document.getElementById("axis-calibration").style.display = "block";
          startAxisCalibration();
          if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        });

      function handleMotion(event) {
        if (!sensorActive) return;

        const acc = event.accelerationIncludingGravity || {};
        const rawX = acc.x || 0;
        const rawY = acc.y || 0;

        if (isCalibrating) {
          calibrationSamples.push(rawX);
          if (calibrationSamples.length >= 10) {
            calibrationX =
              calibrationSamples.reduce((a, b) => a + b) /
              calibrationSamples.length;
            isCalibrating = false;
            console.log("Calibrated neutral X:", calibrationX);
          }
          return;
        }

        const calibratedX = rawX - calibrationX;
        const ax = calibratedX.toFixed(2);
        const ay = rawY.toFixed(2);

        let adjustedY = parseFloat(ay) * 1.3;
        let adjustedX = parseFloat(ax);

        if (adjustedX < 0) {
          adjustedX = -Math.pow(Math.abs(adjustedX), 0.75) * 3.5;
        } else {
          adjustedX = adjustedX * 1.2;
        }

        if (axisConfig.invertX) adjustedX = -adjustedX;
        if (axisConfig.invertY) adjustedY = -adjustedY;

        let finalX = adjustedY;
        let finalY = -adjustedX;

        if (axisConfig.swapAxes) {
          [finalX, finalY] = [finalY, finalX];
        }

        if (finalY < 0) finalY *= axisConfig.sensUp;
        if (finalY > 0) finalY *= axisConfig.sensDown;
        if (finalX < 0) finalX *= axisConfig.sensLeft;
        if (finalX > 0) finalX *= axisConfig.sensRight;

        if (isGravityChaos) {
          finalX = -finalX;
          finalY = -finalY;
        }

        if (calibrationActive) {
          updateCalibrationPreview(finalX, finalY, ax, ay);
        }

        if (!calibrationActive) {
          socket.send(
            JSON.stringify({
              type: "control",
              ax: -finalX,
              ay: finalY,
            })
          );
        }
      }

      let lastShakeTime = 0;
      let shakeCount = 0;

      function detectShake(event) {
        const acc = event.accelerationIncludingGravity || {};
        const total = Math.sqrt(
          (acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2
        );

        if (total > 25) {
          const now = Date.now();

          if (now - lastShakeTime < 600) {
            shakeCount++;

            if (shakeCount >= 3) {
              socket.send(
                JSON.stringify({
                  type: "player_action",
                  playerId: playerId,
                  action: "shake",
                })
              );

              shakeCount = 0;
              if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
              console.log("📱 SHAKE detected!");
            }
          } else {
            shakeCount = 1;
          }

          lastShakeTime = now;
        }
      }

      window.addEventListener("devicemotion", detectShake);

      let audioContext, analyser, microphone;
      let microphoneActive = false;

      async function setupMicrophone() {
        if (microphoneActive) return;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          audioContext = new (window.AudioContext ||
            window.webkitAudioContext)();
          analyser = audioContext.createAnalyser();
          microphone = audioContext.createMediaStreamSource(stream);
          microphone.connect(analyser);
          analyser.fftSize = 256;
          microphoneActive = true;

          console.log("🎤 Microphone ready");
          setInterval(checkForBlow, 100);
        } catch (e) {
          console.error("Microphone not available:", e);
        }
      }

      let lastBlowTime = 0;

      function checkForBlow() {
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const lowFreqVolume =
          dataArray.slice(0, 15).reduce((a, b) => a + b) / 15;

        const now = Date.now();
        if (lowFreqVolume > 150 && now - lastBlowTime > 500) {
          lastBlowTime = now;

          socket.send(
            JSON.stringify({
              type: "player_action",
              playerId: playerId,
              action: "blow",
            })
          );

          if (navigator.vibrate) navigator.vibrate(100);
          console.log("💨 BLOW detected!");
        }
      }

      const eventBox = document.getElementById("event-notification");
      const eventIcon = document.getElementById("event-icon");
      const eventTitle = document.getElementById("event-title");
      const eventDesc = document.getElementById("event-desc");
      let eventTimeout;

      // Call this function when an event packet is received
      function triggerGameEvent(eventType) {
        // Clear any existing timer
        if (eventTimeout) clearTimeout(eventTimeout);

        // Reset classes
        eventBox.className = "";

        // Logic for different events with corrected English
        switch (eventType) {
          case "INFERNO":
            eventBox.classList.add("event-fire");
            eventTitle.textContent = "INFERNO";
            // Corrected: "Blow on the mic to get rid of the flames" ->
            eventDesc.textContent =
              "Don't touch the walls! Blow into the microphone to extinguish the flames!";
            break;

          case "BLIZZARD":
            eventBox.classList.add("event-ice");
            eventTitle.textContent = "BLIZZARD";
            // Corrected: "Shake to scongelarti!" ->
            eventDesc.textContent =
              "Shake your device to unfreeze!";
            break;

          case "GRAVITY_CHAOS":
            eventBox.classList.add("event-gravity");
            eventTitle.textContent = "GRAVITY FLIP";
            eventDesc.textContent = "Warning: The controls are flipped!";
            break;

          case "CLEAR":
            hideEvent();
            return;
        }

        // Show box
        eventBox.classList.remove("hidden");

        // Auto-hide after 5 seconds (optional, or wait for 'CLEAR' event)
        eventTimeout = setTimeout(hideEvent, 13000);
      }

      function hideEvent() {
        eventBox.classList.add("hidden");
      }

      // EXAMPLE: Add this to your message handler
      // if (data.type === 'EVENT') {
      //   triggerGameEvent(data.kind); // data.kind should be 'FIRE', 'ICE', or 'GRAVITY'
      // }

      document.getElementById("shoot-btn").addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          socket.send(JSON.stringify({ type: "shoot" }));
          if (navigator.vibrate) navigator.vibrate(50);
        },
        { passive: false }
      );

      document.getElementById("ability-btn").addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          const now = Date.now();
          if (now < abilityCooldownEnd) return;

          socket.send(JSON.stringify({ type: "ability" }));

          const char = CHARACTERS[selectedCharacter];
          abilityCooldownEnd = now + char.ability.cooldown;
          updateAbilityCooldown();

          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        },
        { passive: false }
      );

      document
        .getElementById("recalibrate-btn")
        .addEventListener("click", () => {
          isCalibrating = true;
          calibrationSamples = [];

          const btn = document.getElementById("recalibrate-btn");
          btn.textContent = "Calibrating...";
          btn.style.background = "rgba(255,165,0,0.3)";

          setTimeout(() => {
            btn.textContent = "Recalibrate";
            btn.style.background = "rgba(0,188,212,0.3)";
          }, 1000);

          if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        });

      function startAxisCalibration() {
        calibrationActive = true;
        if (!sensorActive) {
          startSensorsForCalibration();
        }
      }

      async function startSensorsForCalibration() {
        try {
          sensorActive = true;
          isCalibrating = true;
          calibrationSamples = [];
          window.addEventListener("devicemotion", handleMotion);

          setTimeout(() => {
            if (!isCalibrating) console.log("Calibration complete");
          }, 1000);
        } catch (e) {
          alert("Sensor error: " + e.message);
        }
      }

      function updateCalibrationPreview(moveX, moveY, rawX, rawY) {
        const preview = document.getElementById("preview-player");

        const centerX = 85;
        const centerY = 85;
        const maxOffset = 70;

        const scaledX = moveX * 8;
        const scaledY = moveY * 8;

        const newX =
          centerX + Math.max(-maxOffset, Math.min(maxOffset, scaledX));
        const newY =
          centerY + Math.max(-maxOffset, Math.min(maxOffset, scaledY));

        preview.style.left = newX + "px";
        preview.style.top = newY + "px";

        document.getElementById("cal-raw-x").textContent = rawX;
        document.getElementById("cal-raw-y").textContent = rawY;
        document.getElementById("cal-move-x").textContent = moveX.toFixed(2);
        document.getElementById("cal-move-y").textContent = moveY.toFixed(2);
      }

      document.getElementById("cal-correct").addEventListener("click", () => {
        try {
          localStorage.setItem(
            "geoshooter_axis_config",
            JSON.stringify(axisConfig)
          );
        } catch (e) {
          console.log("Could not save config");
        }

        calibrationActive = false;
        document.getElementById("axis-calibration").style.display = "none";
        document.getElementById("game-controller").style.display = "block";
        document.querySelector(".header").style.display = "none";

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      });

      document.getElementById("cal-invert-x").addEventListener("click", () => {
        axisConfig.invertX = !axisConfig.invertX;
        if (navigator.vibrate) navigator.vibrate(30);
      });

      document.getElementById("cal-invert-y").addEventListener("click", () => {
        axisConfig.invertY = !axisConfig.invertY;
        if (navigator.vibrate) navigator.vibrate(30);
      });

      document.getElementById("cal-swap-axes").addEventListener("click", () => {
        axisConfig.swapAxes = !axisConfig.swapAxes;
        if (navigator.vibrate) navigator.vibrate(30);
      });

      document.getElementById("sens-up").addEventListener("click", () => {
        axisConfig.sensUp = Math.min(axisConfig.sensUp + 0.2, 3.0);
        document.getElementById("sens-up-val").textContent =
          axisConfig.sensUp.toFixed(1) + "x";
        if (navigator.vibrate) navigator.vibrate(30);
      });

      document.getElementById("sens-down").addEventListener("click", () => {
        axisConfig.sensDown = Math.min(axisConfig.sensDown + 0.2, 3.0);
        document.getElementById("sens-down-val").textContent =
          axisConfig.sensDown.toFixed(1) + "x";
        if (navigator.vibrate) navigator.vibrate(30);
      });

      document.getElementById("sens-left").addEventListener("click", () => {
        axisConfig.sensLeft = Math.min(axisConfig.sensLeft + 0.2, 3.0);
        document.getElementById("sens-left-val").textContent =
          axisConfig.sensLeft.toFixed(1) + "x";
        if (navigator.vibrate) navigator.vibrate(30);
      });

      document.getElementById("sens-right").addEventListener("click", () => {
        axisConfig.sensRight = Math.min(axisConfig.sensRight + 0.2, 3.0);
        document.getElementById("sens-right-val").textContent =
          axisConfig.sensRight.toFixed(1) + "x";
        if (navigator.vibrate) navigator.vibrate(30);
      });

      document.getElementById("cal-reset").addEventListener("click", () => {
        axisConfig = {
          invertX: false,
          invertY: false,
          swapAxes: false,
          sensUp: 1.0,
          sensDown: 1.0,
          sensLeft: 1.0,
          sensRight: 1.0,
        };

        document.getElementById("sens-up-val").textContent = "1.0x";
        document.getElementById("sens-down-val").textContent = "1.0x";
        document.getElementById("sens-left-val").textContent = "1.0x";
        document.getElementById("sens-right-val").textContent = "1.0x";

        try {
          localStorage.removeItem("geoshooter_axis_config");
        } catch (e) {}
        if (navigator.vibrate) navigator.vibrate(50);
      });