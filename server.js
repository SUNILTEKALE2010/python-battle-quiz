const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {}; // { code: { host:{id,name,score,correct,streak}, guest:{...}, started:bool } }

function genCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms[code]);
  return code;
}

io.on("connection", (socket) => {
  let myRoom = null;
  let myRole = null; // "host" or "guest"

  socket.on("create-room", (name) => {
    const code = genCode();
    rooms[code] = {
      host: { id: socket.id, name, score: 0, correct: 0, streak: 0 },
      guest: null,
      started: false,
    };
    myRoom = code;
    myRole = "host";
    socket.join(code);
    socket.emit("room-created", code);
  });

  socket.on("join-room", ({ code, name }) => {
    const room = rooms[code];
    if (!room) return socket.emit("join-error", "Room not found. Check the code.");
    if (room.guest) return socket.emit("join-error", "Room is full.");
    if (room.started) return socket.emit("join-error", "Game already in progress.");

    room.guest = { id: socket.id, name, score: 0, correct: 0, streak: 0 };
    myRoom = code;
    myRole = "guest";
    socket.join(code);

    // Tell both players about each other
    io.to(code).emit("players-ready", {
      host: room.host.name,
      guest: room.guest.name,
    });
  });

  socket.on("start-game", () => {
    if (!myRoom || myRole !== "host") return;
    const room = rooms[myRoom];
    if (!room || !room.guest) return;
    room.started = true;
    room.host.score = 0; room.host.correct = 0; room.host.streak = 0;
    room.guest.score = 0; room.guest.correct = 0; room.guest.streak = 0;
    io.to(myRoom).emit("game-start");
  });

  socket.on("score-update", (data) => {
    if (!myRoom) return;
    const room = rooms[myRoom];
    if (!room) return;
    const me = room[myRole];
    if (me) {
      me.score = data.score;
      me.correct = data.correct;
      me.streak = data.streak;
    }
    // Broadcast updated scores to both
    io.to(myRoom).emit("scores", {
      host: { name: room.host.name, score: room.host.score, correct: room.host.correct, streak: room.host.streak },
      guest: room.guest ? { name: room.guest.name, score: room.guest.score, correct: room.guest.correct, streak: room.guest.streak } : null,
    });
  });

  socket.on("game-ended", () => {
    if (!myRoom || myRole !== "host") return;
    const room = rooms[myRoom];
    if (!room) return;
    io.to(myRoom).emit("show-score", {
      host: { name: room.host.name, score: room.host.score, correct: room.host.correct },
      guest: room.guest ? { name: room.guest.name, score: room.guest.score, correct: room.guest.correct } : null,
    });
  });

  socket.on("disconnect", () => {
    if (!myRoom) return;
    const room = rooms[myRoom];
    if (!room) return;
    // Notify the other player
    socket.to(myRoom).emit("opponent-left");
    // Clean up room
    delete rooms[myRoom];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Quiz server running on port ${PORT}`));
