const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "../client")));

const players = {}; // Store player info
let readyCount = 0;
let currentTurn = "white";
let scores = { white: 0, black: 0 };
let round = 1;
let latestBoard = []; // Store the latest board state

io.on("connection", (socket) => {
  console.log("🎮 New player connected");

  socket.on("playerJoined", (name) => {
    const takenColors = Object.values(players).map(p => p.color);
    let color = "spectator";
    if (!takenColors.includes("white")) color = "white";
    else if (!takenColors.includes("black")) color = "black";

    players[socket.id] = { name, color };
    socket.emit("assignColor", color);
    console.log(`👤 ${name} joined as ${color}`);

    // Send current board if available (for spectators or reconnects)
    if (latestBoard.length) {
      socket.emit("syncBoard", { board: latestBoard, turn: currentTurn });
    }
  });

  socket.on("playerReady", () => {
    readyCount++;
    if (readyCount === 2) {
      io.emit("startGame");
      io.emit("updateTurn", currentTurn);
      console.log("🟢 Game started!");
    }
  });

  socket.on("move", ({ board, turn }) => {
    latestBoard = board;
    currentTurn = turn;
    io.emit("syncBoard", { board, turn });
    console.log("♟️ Move synced | New turn:", turn);
  });

  socket.on("chatMessage", (data) => {
    io.emit("chatMessage", data);
  });

  socket.on("gameOver", ({ winner }) => {
    if (winner === "white" || winner === "black") {
      scores[winner]++;
      round++;
    }
    io.emit("gameOver", { winner, scores, round });
    console.log(`🏁 Game over. Winner: ${winner}`);
  });

  socket.on("resign", (resigningColor) => {
    const winner = resigningColor === "white" ? "black" : "white";
    scores[winner]++;
    round++;
    io.emit("gameOver", { winner, scores, round });
    console.log(`🏳️ ${resigningColor} resigned. ${winner} wins.`);
  });

  socket.on("restartGame", () => {
    currentTurn = "white";
    latestBoard = []; // Clear stored board
    readyCount = 0;
    io.emit("restartGame");
    io.emit("updateTurn", currentTurn);
    console.log("🔁 Game restarted");
  });

  socket.on("updatePlayerImage", (data) => {
    io.emit("updatePlayerImage", data);
  });

  socket.on("disconnect", () => {
    const disconnectedPlayer = players[socket.id];
    if (disconnectedPlayer?.color !== "spectator") {
      readyCount = Math.max(0, readyCount - 1);
    }
    delete players[socket.id];
    currentTurn = "white";
    latestBoard = [];
    io.emit("updateTurn", currentTurn);
    io.emit("gameOver", { winner: "none", scores, round });
    console.log("❌ A player disconnected");
  });
});

const PORT = process.env.PORT || 5500;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
