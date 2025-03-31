console.log("Socket connected!");
const socket = io('http://localhost:5500');

let playerName = "";
let playerColor = "";
let currentTurn = "white";
let selected = null;
let gameStarted = false;
let timerInterval;
let timeLeft = 30;

let initialBoard = [
  ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"],
  ["♟︎", "♟︎", "♟︎", "♟︎", "♟︎", "♟︎", "♟︎", "♟︎"],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["♙", "♙", "♙", "♙", "♙", "♙", "♙", "♙"],
  ["♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"]
];

document.getElementById("chessboard").style.display = "none";

document.getElementById("joinGameBtn").addEventListener("click", sendName);

function sendName() {
  const nameInput = document.getElementById("nameInput").value.trim();
  if (nameInput) {
    playerName = nameInput;
    socket.emit("playerJoined", playerName);
    document.getElementById("login").style.display = "none";
    document.getElementById("waitingMessage").style.display = "block";
    document.getElementById("sound-start")?.play();
  } else {
    alert("Please provide a valid name!");
  }
}

socket.on("assignColor", (color) => {
  document.getElementById("waitingMessage").style.display = "none";
  document.getElementById("chessboard").style.display = "grid";

  if (color === "spectator") {
    alert("⚠️ Two players are already in the game. You are watching as a spectator.");
    document.getElementById("playerRole").innerText = "You are watching as a spectator.";
    document.getElementById("chessboard").style.pointerEvents = "none";
    playerColor = "spectator";
    return;
  }

  playerColor = color;
  document.getElementById("playerRole").innerText = `You are playing as: ${color.toUpperCase()}`;
  socket.emit("playerReady");
  updateBoardOrientation();
});

socket.on("startGame", () => {
  gameStarted = true;
  createChessboard();
  startTimer();
  document.getElementById("bg-music")?.play();
});

function createChessboard() {
  const board = document.getElementById("chessboard");
  board.innerHTML = "";

  const rows = [...Array(8).keys()];
  const cols = [...Array(8).keys()];
  const isBlack = playerColor === "black";

  const rowIndices = isBlack ? [...rows].reverse() : rows;
  const colIndices = isBlack ? [...cols].reverse() : cols;

  for (let r of rowIndices) {
    for (let c of colIndices) {
      const square = document.createElement("div");
      square.classList.add("square");
      const isLight = (r + c) % 2 === 0;
      square.classList.add(isLight ? "light" : "dark");

      const piece = initialBoard[r][c];
      square.textContent = piece;
      square.dataset.row = r;
      square.dataset.col = c;

      square.addEventListener("click", () => handleClick(r, c));
      board.appendChild(square);
    }
  }

  document.getElementById("turnInfo").innerHTML =
    `<span class="turn-${currentTurn}">It's ${currentTurn.toUpperCase()}'s turn</span>`;

  // Enable/disable interaction based on turn
  const pointer = currentTurn === playerColor ? "auto" : "none";
  document.querySelectorAll(".square").forEach(square => {
    square.style.pointerEvents = pointer;
  });
}

function handleClick(row, col) {
  if (!gameStarted || playerColor === "spectator" || currentTurn !== playerColor) return;

  const piece = initialBoard[row][col];
  const color = getPieceColor(piece);

  document.querySelectorAll(".square").forEach(square => square.classList.remove("selected"));

  if (piece && color === currentTurn && color === playerColor) {
    selected = { row, col };
    const square = document.querySelector(`[data-row='${row}'][data-col='${col}']`);
    square?.classList.add("selected");
    return;
  }

  if (selected) {
    const from = selected;
    const to = { row, col };
    const movedPiece = initialBoard[from.row][from.col];
    const target = initialBoard[to.row][to.col];

    if (!isLegalMove(movedPiece, from, to)) {
      selected = null;
      createChessboard();
      document.getElementById("sound-wrong")?.play();
      return;
    }

    initialBoard[to.row][to.col] = movedPiece;
    initialBoard[from.row][from.col] = "";

    currentTurn = currentTurn === "white" ? "black" : "white";
    selected = null;

    socket.emit("move", {
      board: initialBoard,
      turn: currentTurn
    });
    checkWinCondition(); // 👑 Game ends if king is defeated
  }
}

socket.on("syncBoard", ({ board, turn }) => {
  initialBoard = board;
  currentTurn = turn;
  createChessboard();
  startTimer();
  

});

socket.on("updateTurn", (newTurn) => {
  currentTurn = newTurn;
  document.getElementById("turnInfo").innerHTML = 
    `<span class="turn-${currentTurn}">It's ${currentTurn.toUpperCase()}'s turn</span>`;
});

function isLegalMove(piece, from, to) {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const target = initialBoard[to.row][to.col];
  const color = getPieceColor(piece);
  const targetColor = getPieceColor(target);

  if (targetColor === color) return false;

  switch (piece) {
    case "♘": case "♞": return (absDx === 2 && absDy === 1) || (absDx === 1 && absDy === 2);
    case "♙":
      return (dx === 0 && dy === -1 && target === "") ||
             (dx === 0 && dy === -2 && from.row === 6 && target === "" && initialBoard[5][from.col] === "") ||
             (absDx === 1 && dy === -1 && targetColor === "black");
    case "♟︎":
      return (dx === 0 && dy === 1 && target === "") ||
             (dx === 0 && dy === 2 && from.row === 1 && target === "" && initialBoard[2][from.col] === "") ||
             (absDx === 1 && dy === 1 && targetColor === "white");
    case "♖": case "♜": return dx === 0 || dy === 0 ? clearPath(from, to) : false;
    case "♗": case "♝": return absDx === absDy ? clearPath(from, to) : false;
    case "♕": case "♛": return (dx === 0 || dy === 0 || absDx === absDy) && clearPath(from, to);
    case "♔": case "♚": return absDx <= 1 && absDy <= 1;
  }
  return false;
}

function clearPath(from, to) {
  const dx = Math.sign(to.col - from.col);
  const dy = Math.sign(to.row - from.row);
  let x = from.col + dx;
  let y = from.row + dy;
  while (x !== to.col || y !== to.row) {
    if (initialBoard[y][x] !== "") return false;
    x += dx;
    y += dy;
  }
  return true;
}

function getPieceColor(piece) {
  if (["♜", "♞", "♝", "♛", "♚", "♟︎"].includes(piece)) return "black";
  if (["♖", "♘", "♗", "♕", "♔", "♙"].includes(piece)) return "white";
  return null;
}

function updateBoardOrientation() {
  if (playerColor === "black") {
    document.getElementById("chessboard").classList.add("rotate-board");
  } else {
    document.getElementById("chessboard").classList.remove("rotate-board");
  }
}

function startTimer() {
  timeLeft = 30;
  document.getElementById("timeLeft").textContent = timeLeft;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      document.getElementById("timeLeft").textContent = timeLeft;
    } else {
      clearInterval(timerInterval);
      document.getElementById("sound-time")?.play();
    }
  }, 1000);
}

// Chat
function sendChat() {
  const chatInput = document.getElementById("chatInput");
  const message = chatInput.value.trim();
  if (message) {
    socket.emit("chatMessage", { name: playerName, text: message });
    chatInput.value = "";
  }
}
document.getElementById("chatInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendChat();
});
socket.on("chatMessage", (data) => {
  const log = document.getElementById("chatLog");
  const div = document.createElement("div");
  div.innerHTML = `<strong>${data.name}:</strong> ${data.text}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  document.getElementById("sound-chat")?.play();
});

// Theme toggle
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});

// Resign / Restart / Game Over
function restartGame() {
  initialBoard = [
    ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"],
    ["♟︎", "♟︎", "♟︎", "♟︎", "♟︎", "♟︎", "♟︎", "♟︎"],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["♙", "♙", "♙", "♙", "♙", "♙", "♙", "♙"],
    ["♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"]
  ];
  currentTurn = "white"; // reset turn
  createChessboard(); // redraw board
  startTimer(); // restart timer
  socket.emit("restartGame");
}



function resignGame() {
  socket.emit("resign", playerColor);
}
socket.on("gameOver", ({ winner, scores: s, round: r }) => {
  document.getElementById(winner === playerColor ? "sound-win" : "sound-lose")?.play();
  document.getElementById("gameStatus").textContent =
    winner === "none" ? "Game ended." : `${winner.toUpperCase()} wins!`;
  scores = s;
  round = r;
  document.getElementById("scoreboard").textContent =
    `Score - White: ${scores.white} | Black: ${scores.black} | Round: ${round}`;
});



function checkWinCondition() {
  const flat = initialBoard.flat();
  const whiteKingAlive = flat.includes("♔");
  const blackKingAlive = flat.includes("♚");

  if (!whiteKingAlive) {
    socket.emit("gameOver", { winner: "black" });
  } else if (!blackKingAlive) {
    socket.emit("gameOver", { winner: "white" });
  }
}
