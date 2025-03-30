// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const games = {};

const TEAM_COLORS = {
  0: { fill: '#cccccc', stroke: '#666666', name: 'Neutral' },
  1: { fill: '#ff3333', stroke: '#ff6666', name: 'Red' },
  2: { fill: '#3333ff', stroke: '#6666ff', name: 'Blue' },
  3: { fill: '#33cc33', stroke: '#66ff66', name: 'Green' },
  4: { fill: '#cc33cc', stroke: '#ff66ff', name: 'Purple' },
  5: { fill: '#ff9933', stroke: '#ffcc66', name: 'Orange' },
  6: { fill: '#33cccc', stroke: '#66ffff', name: 'Cyan' }
};

const DIFFICULTY_SETTINGS = {
  0: { nodes: 20, players: 2, connProb: 0.15 },
  1: { nodes: 25, players: 2, connProb: 0.14 },
  2: { nodes: 30, players: 3, connProb: 0.13 },
  3: { nodes: 35, players: 3, connProb: 0.12 },
  4: { nodes: 40, players: 4, connProb: 0.11 },
  5: { nodes: 45, players: 4, connProb: 0.10 },
  6: { nodes: 50, players: 5, connProb: 0.09 },
  7: { nodes: 55, players: 5, connProb: 0.08 },
  8: { nodes: 60, players: 6, connProb: 0.07 },
  9: { nodes: 65, players: 6, connProb: 0.06 }
};

function initializeGame(difficulty) {
  const settings = DIFFICULTY_SETTINGS[difficulty];
  const nodes = [];
  for (let i = 0; i < settings.nodes; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const radius = Math.random() * 100 + 100;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    nodes.push({
      position: { x, y, z },
      team: 0,
      troops: Math.floor(Math.random() * 3) + 1,
      connections: []
    });
  }

  const connections = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (Math.random() < settings.connProb) {
        connections.push({ nodeA: i, nodeB: j });
        nodes[i].connections.push(connections.length - 1);
        nodes[j].connections.push(connections.length - 1);
      }
    }
  }

  const isolatedNodes = nodes.map((n, i) => n.connections.length === 0 ? i : -1).filter(i => i !== -1);
  isolatedNodes.forEach(i => {
    const nearest = nodes.reduce((min, n, idx) => {
      if (idx === i) return min;
      const d = Math.sqrt(
        Math.pow(n.position.x - nodes[i].position.x, 2) +
        Math.pow(n.position.y - nodes[i].position.y, 2) +
        Math.pow(n.position.z - nodes[i].position.z, 2)
      );
      return d < min.d ? { d, idx } : min;
    }, { d: Infinity, idx: -1 });
    connections.push({ nodeA: i, nodeB: nearest.idx });
    nodes[i].connections.push(connections.length - 1);
    nodes[nearest.idx].connections.push(connections.length - 1);
  });

  return { nodes, connections, turn: 1, players: {}, settings };
}

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinGame', ({ roomId, difficulty }) => {
    if (!games[roomId]) {
      games[roomId] = initializeGame(difficulty);
      games[roomId].host = socket.id;
    }

    const game = games[roomId];
    const playerCount = Object.keys(game.players).length;
    if (playerCount >= game.settings.players) {
      socket.emit('gameFull');
      return;
    }

    const team = playerCount + 1;
    game.players[socket.id] = { team, ready: false };
    socket.join(roomId);

    const usedIndices = new Set(Object.values(game.players).map(p => p.startNode));
    let startNode;
    do { startNode = Math.floor(Math.random() * game.nodes.length); } while (usedIndices.has(startNode));
    game.players[socket.id].startNode = startNode;
    game.nodes[startNode].team = team;
    game.nodes[startNode].troops = 8;

    socket.emit('gameState', {
      nodes: game.nodes,
      connections: game.connections,
      players: game.players,
      team,
      turn: game.turn,
      difficulty: game.settings
    });

    io.to(roomId).emit('playerJoined', { players: game.players });
  });

  socket.on('playerReady', ({ roomId }) => {
    const game = games[roomId];
    if (!game || !game.players[socket.id]) return;
    game.players[socket.id].ready = true;

    const allReady = Object.values(game.players).every(p => p.ready);
    if (allReady) {
      io.to(roomId).emit('gameStart', { turn: game.turn });
    }
  });

  socket.on('move', ({ roomId, sourceIdx, targetIdx }) => {
    const game = games[roomId];
    if (!game || game.turn !== game.players[socket.id].team) return;

    const sourceNode = game.nodes[sourceIdx];
    const targetNode = game.nodes[targetIdx];
    if (sourceNode.team !== game.players[socket.id].team || sourceNode.troops < 2) return;

    const isConnected = sourceNode.connections.some(connIdx => {
      const conn = game.connections[connIdx];
      return (conn.nodeA === sourceIdx && conn.nodeB === targetIdx) ||
             (conn.nodeB === sourceIdx && conn.nodeA === targetIdx);
    });
    if (!isConnected) return;

    const troopsToMove = Math.max(1, Math.floor(sourceNode.troops / 2));
    sourceNode.troops -= troopsToMove;

    if (targetNode.team === sourceNode.team) {
      targetNode.troops += troopsToMove;
    } else {
      const attackStrength = troopsToMove;
      const defenseStrength = targetNode.troops;
      if (attackStrength > defenseStrength) {
        targetNode.team = sourceNode.team;
        targetNode.troops = Math.max(1, troopsToMove - Math.floor(defenseStrength * 0.8));
      } else {
        targetNode.troops = Math.max(1, defenseStrength - Math.floor(attackStrength * 0.8));
      }
    }

    game.turn = (game.turn % game.settings.players) + 1;
    io.to(roomId).emit('gameState', {
      nodes: game.nodes,
      connections: game.connections,
      turn: game.turn,
      players: game.players
    });

    const teamCounts = game.nodes.reduce((counts, node) => {
      counts[node.team] = (counts[node.team] || 0) + 1;
      return counts;
    }, {});
    const activeTeams = new Set(Object.values(game.players).map(p => p.team));
    if (Object.keys(teamCounts).length === 2 && teamCounts[game.players[socket.id].team]) {
      io.to(roomId).emit('gameOver', { winner: game.players[socket.id].team });
    } else if (!teamCounts[game.players[socket.id].team]) {
      io.to(roomId).emit('playerEliminated', { team: game.players[socket.id].team });
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in games) {
      if (games[roomId].players[socket.id]) {
        delete games[roomId].players[socket.id];
        io.to(roomId).emit('playerLeft', { players: games[roomId].players });
        if (Object.keys(games[roomId].players).length === 0) {
          delete games[roomId];
        }
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log('Server running on port', process.env.PORT || 3001);
});

