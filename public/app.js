// --- Question packs (mirrored from server) ---
const PACKS = [
  { id: "sfw", name: "Party Mode", description: "Clean fun for everyone" },
  { id: "nsfw", name: "After Dark", description: "Adults only, no filter" },
  { id: "dev", name: "Software Engineers", description: "For the technically inclined" },
];

// --- Settings defaults ---
const DEFAULT_SETTINGS = {
  numQuestions: 5,
  timeout: 20,
  packs: ["sfw"],
};

const SETTINGS_LIMITS = {
  numQuestions: { min: 1, max: 20 },
  timeout: { min: 5, max: 60 },
};

// --- State ---
let ws = null;
let state = {
  playerId: null,
  playerName: null,
  isHost: false,
  roomCode: null,
  phase: "home",
  hasVoted: false,
  timerInterval: null,
  timeLeft: 0,
  settings: { ...DEFAULT_SETTINGS, packs: [...DEFAULT_SETTINGS.packs] },
};

// --- Session Persistence ---
function saveSession() {
  sessionStorage.setItem(
    "questions-game-session",
    JSON.stringify({
      playerId: state.playerId,
      name: state.playerName,
      roomCode: state.roomCode,
    })
  );
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem("questions-game-session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem("questions-game-session");
}

// --- DOM Helpers ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(`#screen-${id}`).classList.add("active");
}

let _toastTimer = null;
function showToast(msg, isError = false) {
  const toast = $("#toast");
  if (_toastTimer) clearTimeout(_toastTimer);
  toast.textContent = msg;
  toast.className = "toast show" + (isError ? " error" : "");
  _toastTimer = setTimeout(() => {
    toast.className = "toast";
    _toastTimer = null;
  }, 2500);
}

// --- WebSocket ---
function connectToRoom(roomCode, playerName) {
  state.playerName = playerName;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws/${roomCode}`);

  ws.onopen = () => {
    ws.send(
      JSON.stringify({ type: "join", name: playerName, roomCode: roomCode })
    );
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  ws.onerror = () => {
    showToast("Connection error", true);
  };

  ws.onclose = () => {
    if (state.phase !== "home" && state.phase !== "final") {
      showToast("Disconnected from server", true);
    }
  };
}

function reconnectToRoom(roomCode, playerId, playerName) {
  state.playerName = playerName;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws/${roomCode}`);

  ws.onopen = () => {
    ws.send(
      JSON.stringify({ type: "rejoin", playerId: playerId, roomCode: roomCode })
    );
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  ws.onerror = () => {
    showToast("Connection error", true);
    clearSession();
  };

  ws.onclose = () => {
    if (state.phase !== "home" && state.phase !== "final") {
      showToast("Disconnected from server", true);
    }
  };
}

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// --- Server Message Handler ---
function handleServerMessage(data) {
  switch (data.type) {
    case "joined":
      state.playerId = data.playerId;
      state.isHost = data.isHost;
      state.roomCode = data.roomCode;
      saveSession();
      history.replaceState(null, "", `?room=${data.roomCode}`);
      showScreen("lobby");
      renderLobbyCode();
      break;

    case "rejoined":
      state.playerId = data.playerId;
      state.isHost = data.isHost;
      state.roomCode = data.roomCode;
      saveSession();
      history.replaceState(null, "", `?room=${data.roomCode}`);
      // State sync message will follow and set the correct screen
      break;

    case "rejoin-failed":
      clearSession();
      showToast("Session expired, please rejoin", true);
      showScreen("home");
      break;

    case "sync":
      handleSync(data);
      break;

    case "playerDisconnected":
      showToast(`${data.name} disconnected...`, false);
      break;

    case "promoted":
      state.isHost = data.isHost;
      updateStartButton();
      showToast("You are now the host!");
      break;

    case "lobby":
      state.phase = "lobby";
      updateReactionBar();
      renderLobby(data);
      // Only switch to lobby screen if we've already joined
      // (avoids interfering with the home screen)
      if (state.playerId) {
        showScreen("lobby");
      }
      break;

    case "question":
      state.phase = "question";
      state.hasVoted = false;
      updateReactionBar();
      renderQuestion(data);
      startTimer(data.timeLimit);
      showScreen("question");
      break;

    case "voted":
      state.hasVoted = true;
      highlightVote(data.votedFor);
      break;

    case "voteCount":
      renderVoteStatus(data);
      break;

    case "results":
      state.phase = "results";
      updateReactionBar();
      stopTimer();
      renderResults(data);
      showScreen("results");
      break;

    case "final":
      state.phase = "final";
      updateReactionBar();
      stopTimer();
      renderFinal(data);
      showScreen("final");
      break;

    case "reaction":
      showReaction(data.name, data.emoji, data.fromId);
      break;

    case "error":
      showToast(data.message, true);
      break;
  }
}

// --- State Sync (for rejoin) ---
function handleSync(data) {
  if (data.phase === "question") {
    state.phase = "question";
    state.hasVoted = data.hasVoted;
    updateReactionBar();
    renderQuestion({
      questionNumber: data.questionNumber,
      totalQuestions: data.totalQuestions,
      question: data.question,
      players: data.players,
      timeLimit: data.timeLeft,
    });
    if (data.timeLeft > 0) {
      startTimer(data.timeLeft);
    }
    if (data.hasVoted) {
      highlightVote(data.votedFor);
    }
    renderVoteStatus({ count: data.voteCount, total: data.totalPlayers });
    showScreen("question");
  }
  // results and final are handled by the normal message handlers
  // since sendStateSync sends those as standard messages
}

// --- Renderers ---
function renderLobbyCode() {
  $("#lobby-code").textContent = state.roomCode;
}

function renderLobby(data) {
  const list = $("#player-list");
  list.innerHTML = data.players
    .map(
      (p) =>
        `<span class="player-chip ${p.isHost ? "host" : ""}">${p.name}${p.id === state.playerId ? " (you)" : ""}</span>`
    )
    .join("");

  const count = data.players.length;
  $("#lobby-status").textContent =
    count < 2
      ? `${count} player joined. Need at least 2 to start.`
      : `${count} players ready!`;

  updateStartButton();
}

function updateStartButton() {
  const btn = $("#btn-start");
  const settings = $("#host-settings");
  if (state.isHost) {
    btn.style.display = "block";
    settings.style.display = "block";
    renderSettings();
  } else {
    btn.style.display = "none";
    settings.style.display = "none";
    $("#lobby-status").textContent += " Waiting for host to start...";
  }
}

function renderSettings() {
  $("#setting-questions").textContent = state.settings.numQuestions;
  $("#setting-timeout").textContent = state.settings.timeout;

  const packContainer = $("#pack-options");
  // Only render once
  if (packContainer.children.length === 0) {
    packContainer.innerHTML = PACKS.map(
      (p) => `
      <label class="pack-option ${state.settings.packs.includes(p.id) ? "selected" : ""}" data-pack="${p.id}">
        <input type="checkbox" value="${p.id}" ${state.settings.packs.includes(p.id) ? "checked" : ""}>
        <span class="pack-check"></span>
        <span class="pack-info">
          <span class="pack-name">${p.name}</span>
          <span class="pack-desc">${p.description}</span>
        </span>
      </label>
    `
    ).join("");

    // Attach pack toggle handlers
    packContainer.querySelectorAll(".pack-option").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const packId = el.dataset.pack;
        const idx = state.settings.packs.indexOf(packId);
        if (idx >= 0) {
          // Don't allow deselecting all
          if (state.settings.packs.length <= 1) {
            showToast("Select at least one pack", true);
            return;
          }
          state.settings.packs.splice(idx, 1);
          el.classList.remove("selected");
          el.querySelector("input").checked = false;
        } else {
          state.settings.packs.push(packId);
          el.classList.add("selected");
          el.querySelector("input").checked = true;
        }
      });
    });
  }
}

function renderQuestion(data) {
  $("#q-number").textContent = `${data.questionNumber} / ${data.totalQuestions}`;
  $("#question-text").textContent = data.question;

  const opts = $("#vote-options");
  opts.innerHTML = data.players
    .map(
      (p) =>
        `<button class="vote-btn" data-id="${p.id}">${p.name}${p.id === state.playerId ? " (you)" : ""}</button>`
    )
    .join("");

  // Attach click handlers
  opts.querySelectorAll(".vote-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (state.hasVoted) return;
      send({ type: "vote", votedFor: btn.dataset.id });
      // Optimistic UI
      opts.querySelectorAll(".vote-btn").forEach((b) => {
        b.classList.remove("selected");
        b.disabled = true;
      });
      btn.classList.add("selected");
    });
  });

  $("#vote-status").textContent = "";
}

function highlightVote(votedForId) {
  const opts = $("#vote-options");
  opts.querySelectorAll(".vote-btn").forEach((btn) => {
    btn.disabled = true;
    if (btn.dataset.id === votedForId) {
      btn.classList.add("selected");
    }
  });
}

function renderVoteStatus(data) {
  $("#vote-status").textContent = `${data.count} / ${data.total} have voted`;
}

function renderResults(data) {
  $("#results-question").textContent = data.question;

  const maxVotes = Math.max(...data.results.map((r) => r.votes), 1);
  const chart = $("#results-chart");
  chart.innerHTML = data.results
    .map(
      (r, i) => `
      <div class="result-row">
        <div class="result-info">
          <span class="result-name ${i === 0 && r.votes > 0 ? "winner" : ""}">${i === 0 && r.votes > 0 ? "\u2B50 " : ""}${r.name}</span>
          <span class="result-votes">${r.votes} vote${r.votes !== 1 ? "s" : ""}</span>
        </div>
        <div class="result-bar-bg">
          <div class="result-bar color-${i % 6}" style="width: 0%"></div>
        </div>
      </div>
    `
    )
    .join("");

  // Animate bars
  requestAnimationFrame(() => {
    setTimeout(() => {
      chart.querySelectorAll(".result-bar").forEach((bar, i) => {
        const pct = (data.results[i].votes / maxVotes) * 100;
        bar.style.width = `${pct}%`;
      });
    }, 50);
  });

  // Next button
  if (state.isHost) {
    const btn = $("#btn-next");
    btn.style.display = "block";
    btn.textContent = data.isLastQuestion ? "See Final Scores" : "Next Question";
    $("#waiting-next").style.display = "none";
  } else {
    $("#btn-next").style.display = "none";
    $("#waiting-next").style.display = "block";
  }
}

function renderFinal(data) {
  const maxVotes = Math.max(...data.scores.map((s) => s.totalVotes), 1);
  const chart = $("#final-scores");

  chart.innerHTML = data.scores
    .map(
      (s, i) => `
      <div class="result-row">
        <div class="result-info">
          <span class="result-name ${i === 0 ? "winner" : ""}">${i === 0 ? "\uD83C\uDFC6 " : i === 1 ? "\uD83E\uDD48 " : i === 2 ? "\uD83E\uDD49 " : ""}${s.name}</span>
          <span class="result-votes">${s.totalVotes} total vote${s.totalVotes !== 1 ? "s" : ""}</span>
        </div>
        <div class="result-bar-bg">
          <div class="result-bar color-${i % 6}" style="width: 0%"></div>
        </div>
      </div>
    `
    )
    .join("");

  requestAnimationFrame(() => {
    setTimeout(() => {
      chart.querySelectorAll(".result-bar").forEach((bar, i) => {
        const pct = (data.scores[i].totalVotes / maxVotes) * 100;
        bar.style.width = `${pct}%`;
      });
    }, 50);
  });

  // Show play again button for host, waiting text for others
  if (state.isHost) {
    $("#btn-play-again").style.display = "block";
    $("#waiting-play-again").style.display = "none";
  } else {
    $("#btn-play-again").style.display = "none";
    $("#waiting-play-again").style.display = "block";
  }
}

// --- Reactions ---
function showReaction(name, emoji, fromId) {
  const container = $("#reaction-container");
  const popup = document.createElement("div");
  popup.className = "reaction-popup";
  // Show name only for other players
  const label = fromId === state.playerId ? "You" : name;
  popup.innerHTML = `<span class="reaction-emoji">${emoji}</span><span class="reaction-name">${label}</span>`;

  // Random horizontal position
  popup.style.left = Math.random() * 70 + 10 + "%";

  container.appendChild(popup);

  // Trigger animation
  requestAnimationFrame(() => popup.classList.add("show"));

  setTimeout(() => {
    popup.classList.add("fade-out");
    setTimeout(() => popup.remove(), 400);
  }, 2000);
}

function updateReactionBar() {
  const bar = $("#reaction-bar");
  const gamePhases = ["question", "results", "final"];
  bar.classList.toggle("visible", gamePhases.includes(state.phase));
}

// --- Timer ---
function startTimer(seconds) {
  stopTimer();
  state.timeLeft = seconds;
  renderTimer();

  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    if (state.timeLeft <= 0) {
      stopTimer();
      state.timeLeft = 0;
    }
    renderTimer();
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function renderTimer() {
  const el = $("#timer");
  el.textContent = state.timeLeft + "s";
  el.className = "timer" + (state.timeLeft <= 5 ? " urgent" : "");
}

// --- Event Listeners ---
$("#btn-create").addEventListener("click", async () => {
  const name = $("#host-name").value.trim();
  if (!name) {
    showToast("Please enter your name", true);
    return;
  }

  try {
    const res = await fetch("/api/create-room");
    const { roomCode } = await res.json();
    state.roomCode = roomCode;
    connectToRoom(roomCode, name);
  } catch (e) {
    showToast("Failed to create room", true);
  }
});

$("#btn-join").addEventListener("click", () => {
  const name = $("#join-name").value.trim();
  const code = $("#join-code").value.trim().toUpperCase();
  if (!name) {
    showToast("Please enter your name", true);
    return;
  }
  if (!code || code.length < 4) {
    showToast("Please enter a valid room code", true);
    return;
  }
  state.roomCode = code;
  connectToRoom(code, name);
});

$("#btn-start").addEventListener("click", () => {
  send({
    type: "start",
    settings: {
      numQuestions: state.settings.numQuestions,
      timeout: state.settings.timeout,
      packs: state.settings.packs,
    },
  });
});

// --- Stepper buttons ---
document.querySelectorAll(".btn-stepper").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.target;
    const delta = parseInt(btn.dataset.delta, 10);
    const el = $(`#${targetId}`);
    let value = parseInt(el.textContent, 10) + delta;

    if (targetId === "setting-questions") {
      value = Math.max(SETTINGS_LIMITS.numQuestions.min, Math.min(SETTINGS_LIMITS.numQuestions.max, value));
      state.settings.numQuestions = value;
    } else if (targetId === "setting-timeout") {
      value = Math.max(SETTINGS_LIMITS.timeout.min, Math.min(SETTINGS_LIMITS.timeout.max, value));
      state.settings.timeout = value;
    }

    el.textContent = value;
  });
});

$("#btn-next").addEventListener("click", () => {
  send({ type: "next" });
});

$("#btn-copy").addEventListener("click", () => {
  const url = `${location.origin}?room=${state.roomCode}`;
  navigator.clipboard
    .writeText(url)
    .then(() => showToast("Link copied!"))
    .catch(() => showToast("Could not copy", true));
});

$("#btn-play-again").addEventListener("click", () => {
  send({ type: "play-again" });
});

// --- Reaction buttons ---
document.querySelectorAll(".reaction-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    send({ type: "reaction", emoji: btn.dataset.emoji });
    // Brief press animation
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 200);
  });
});

// --- Auto-reconnect or auto-fill room code from URL ---
(function init() {
  const params = new URLSearchParams(location.search);
  const roomFromUrl = params.get("room");

  // No room param → always go to home screen
  if (!roomFromUrl) {
    clearSession();
    return;
  }

  const room = roomFromUrl.toUpperCase();
  const session = loadSession();

  // If we have a session matching this room, try to rejoin as the same player
  if (session && session.playerId && session.roomCode === room) {
    showToast("Reconnecting...");
    reconnectToRoom(room, session.playerId, session.name);
    return;
  }

  // Otherwise, just pre-fill the join form
  $("#join-code").value = room;
  $("#join-name").focus();
})();

// --- Enter key support ---
$("#host-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#btn-create").click();
});
$("#join-code").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#btn-join").click();
});
$("#join-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#join-code").focus();
});
