import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './styles.css'; // Import the stylesheet

const GraphWarsGame = () => {
  const NEUTRAL = 0;
  const NODE_SIZE = 10;

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
    0: { nodes: 10, enemies: 1, players: 2, connProb: 0.15, playerTroops: 8, aiTroops: 4 },
    1: { nodes: 20, enemies: 1, players: 2, connProb: 0.14, playerTroops: 8, aiTroops: 5 },
    2: { nodes: 30, enemies: 2, players: 3, connProb: 0.13, playerTroops: 7, aiTroops: 5 },
    3: { nodes: 35, enemies: 2, players: 3, connProb: 0.12, playerTroops: 7, aiTroops: 6 },
    4: { nodes: 40, enemies: 3, players: 4, connProb: 0.11, playerTroops: 7, aiTroops: 6 },
    5: { nodes: 45, enemies: 3, players: 4, connProb: 0.10, playerTroops: 6, aiTroops: 7 },
    6: { nodes: 50, enemies: 4, players: 5, connProb: 0.09, playerTroops: 6, aiTroops: 7 },
    7: { nodes: 55, enemies: 5, players: 6, connProb: 0.08, playerTroops: 8, aiTroops: 8 },
    8: { nodes: 70, enemies: 6, players: 7, connProb: 0.07, playerTroops: 8, aiTroops: 8 },
    9: { nodes: 80, enemies: 7, players: 8, connProb: 0.06, playerTroops: 8, aiTroops: 8 }
  };

  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [teamCounts, setTeamCounts] = useState({});
  const [selectedNode, setSelectedNode] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [gameMessage, setGameMessage] = useState("Select mode...");
  const [turnNumber, setTurnNumber] = useState(1);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [difficulty, setDifficulty] = useState(0);
  const [score, setScore] = useState(0);
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [socket, setSocket] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [players, setPlayers] = useState({});
  const [isReady, setIsReady] = useState(false);
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isRotating, setIsRotating] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isMultiplayer && !socket) {
      const newSocket = io('http://localhost:3001');
      setSocket(newSocket);

      newSocket.on('gameState', ({ nodes, connections, players, team, turn, difficulty }) => {
        setNodes(nodes);
        setConnections(connections);
        setPlayers(players);
        setMyTeam(team);
        setTurnNumber(turn);
        setDifficulty(difficulty);
        updateTeamCounts(nodes);
        setGameMessage(turn === team ? "Your turn!" : "Waiting for other players...");
      });

      newSocket.on('playerJoined', ({ players }) => {
        setPlayers(players);
        setGameMessage("Waiting for players to ready up...");
      });

      newSocket.on('gameStart', ({ turn }) => {
        setTurnNumber(turn);
        setGameMessage(turn === myTeam ? "Your turn!" : "Waiting for other players...");
      });

      newSocket.on('gameOver', ({ winner }) => {
        setGameOver(true);
        setWinner(winner);
        setGameMessage(winner === myTeam ? "You Win!" : "Game Over!");
      });

      newSocket.on('playerEliminated', ({ team }) => {
        if (team === myTeam) {
          setGameOver(true);
          setGameMessage("You've been eliminated!");
        }
      });

      newSocket.on('gameFull', () => {
        setGameMessage("Game is full!");
      });

      return () => newSocket.disconnect();
    } else if (!isMultiplayer) {
      initializeNetwork();
      window.GraphWarsFirebase?.loadLeaderboard();
    }
  }, [isMultiplayer]);

  useEffect(() => {
    const renderLoop = () => {
      renderNetwork();
      requestAnimationFrame(renderLoop);
    };
    const animationId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationId);
  }, [nodes, connections, selectedNode, turnNumber, rotation]);

  const initializeNetwork = () => {
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const newNodes = [];
    for (let i = 0; i < settings.nodes; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const radius = Math.random() * 100 + 100;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);
      newNodes.push({
        position: { x, y, z },
        team: NEUTRAL,
        troops: Math.floor(Math.random() * 3) + 1,
        connections: [],
        resourceValue: Math.random() * 0.7 + 0.3
      });
    }

    const newConnections = [];
    for (let i = 0; i < newNodes.length; i++) {
      for (let j = i + 1; j < newNodes.length; j++) {
        if (Math.random() < settings.connProb) {
          newConnections.push({ nodeA: i, nodeB: j });
          newNodes[i].connections.push(newConnections.length - 1);
          newNodes[j].connections.push(newConnections.length - 1);
        }
      }
    }

    const isolatedNodes = newNodes.map((n, i) => n.connections.length === 0 ? i : -1).filter(i => i !== -1);
    isolatedNodes.forEach(i => {
      const nearest = newNodes.reduce((min, n, idx) => {
        if (idx === i) return min;
        const d = Math.sqrt(
          Math.pow(n.position.x - newNodes[i].position.x, 2) +
          Math.pow(n.position.y - newNodes[i].position.y, 2) +
          Math.pow(n.position.z - newNodes[i].position.z, 2)
        );
        return d < min.d ? { d, idx } : min;
      }, { d: Infinity, idx: -1 });
      newConnections.push({ nodeA: i, nodeB: nearest.idx });
      newNodes[i].connections.push(newConnections.length - 1);
      newNodes[nearest.idx].connections.push(newConnections.length - 1);
    });

    const usedIndices = new Set();
    const addTeam = (team, troops) => {
      let idx;
      do { idx = Math.floor(Math.random() * newNodes.length); } while (usedIndices.has(idx));
      usedIndices.add(idx);
      newNodes[idx].team = team;
      newNodes[idx].troops = troops;
    };
    addTeam(1, settings.playerTroops);
    for (let i = 0; i < settings.enemies; i++) {
      addTeam(2 + i, settings.aiTroops);
    }

    setNodes(newNodes);
    setConnections(newConnections);
    updateTeamCounts(newNodes);
    setScore(0);
    setGameOver(false);
    setWinner(null);
    setTurnNumber(1);
    setPlayerTurn(true);
    setGameMessage("Your turn! Select a node to move from.");
  };

  const updateTeamCounts = (currentNodes) => {
    const counts = { 0: 0 };
    const maxTeams = isMultiplayer ? DIFFICULTY_SETTINGS[difficulty].players : DIFFICULTY_SETTINGS[difficulty].enemies + 1;
    for (let i = 1; i <= maxTeams; i++) {
      counts[i] = 0;
    }
    currentNodes.forEach(node => counts[node.team] = (counts[node.team] || 0) + 1);
    setTeamCounts(counts);

    if (!isMultiplayer) {
      const enemyCount = Object.keys(counts).reduce((sum, key) => 
        parseInt(key) >= 2 ? sum + counts[key] : sum, 0);
      if (counts[1] === currentNodes.length) {
        setGameOver(true);
        setWinner(1);
        const finalScore = calculateScore();
        setScore(finalScore);
        window.GraphWarsFirebase?.saveScore(difficulty, finalScore);
      } else if (counts[1] === 0) {
        setGameOver(true);
        setWinner(2);
      }
    }
  };

  const calculateScore = () => {
    return Math.floor((teamCounts[1] * 100) / turnNumber * (difficulty + 1));
  };

  const joinGame = () => {
    if (socket && roomId) {
      socket.emit('joinGame', { roomId, difficulty });
    }
  };

  const readyUp = () => {
    if (socket && roomId) {
      socket.emit('playerReady', { roomId });
      setIsReady(true);
    }
  };

  const handleMouseDown = (e) => {
    if (e.button === 2) {
      setIsRotating(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      e.preventDefault();
      return;
    }
    handleCanvasClick(e);
  };

  const handleMouseMove = (e) => {
    if (!isRotating) return;
    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;
    setRotation({
      x: rotation.x + deltaY * 0.005,
      y: rotation.y + deltaX * 0.005
    });
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsRotating(false);
  const handleMouseLeave = () => setIsRotating(false);
  const handleContextMenu = (e) => e.preventDefault();

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodeProjections = nodes.map((node, index) => {
      const projected = rotatePoint(node.position.x, node.position.y, node.position.z);
      return { node, index, projected };
    }).sort((a, b) => b.projected.z - a.projected.z);

    for (const { node, index, projected } of nodeProjections) {
      if (projected.z < -300) continue;
      const nodeX = projected.x;
      const nodeY = projected.y;
      const scaledSize = NODE_SIZE * projected.scale;
      const dx = x - nodeX;
      const dy = y - nodeY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= scaledSize) {
        handleNodeClick(index);
        break;
      }
    }
  };

  const handleNodeClick = (nodeIndex) => {
    if (gameOver || (isMultiplayer && turnNumber !== myTeam) || (!isMultiplayer && !playerTurn)) return;

    const clickedNode = nodes[nodeIndex];
    if (selectedNode === null) {
      if (clickedNode.team === (isMultiplayer ? myTeam : 1) && clickedNode.troops >= 2) {
        setSelectedNode(nodeIndex);
        setGameMessage("Select a target node.");
      }
    } else {
      if (selectedNode === nodeIndex) {
        setSelectedNode(null);
        setGameMessage(isMultiplayer ? (turnNumber === myTeam ? "Your turn!" : "Waiting...") : "Your turn!");
        return;
      }

      const sourceNode = nodes[selectedNode];
      const isConnected = sourceNode.connections.some(connIdx => {
        const conn = connections[connIdx];
        return (conn.nodeA === selectedNode && conn.nodeB === nodeIndex) ||
               (conn.nodeB === selectedNode && conn.nodeA === nodeIndex);
      });

      if (isConnected) {
        if (isMultiplayer) {
          socket.emit('move', { roomId, sourceIdx: selectedNode, targetIdx: nodeIndex });
        } else {
          executeTroopMovement(selectedNode, nodeIndex);
        }
        setSelectedNode(null);
      }
    }
  };

  const executeTroopMovement = (sourceIdx, targetIdx) => {
    const updatedNodes = [...nodes];
    const sourceNode = updatedNodes[sourceIdx];
    const targetNode = updatedNodes[targetIdx];
    const troopsToMove = Math.max(1, Math.floor(sourceNode.troops / 2));
    sourceNode.troops -= troopsToMove;

    if (targetNode.team === 1) {
      targetNode.troops += troopsToMove;
    } else {
      const attackStrength = troopsToMove;
      const defenseStrength = targetNode.troops;
      if (attackStrength > defenseStrength) {
        targetNode.team = 1;
        targetNode.troops = Math.max(1, troopsToMove - Math.floor(defenseStrength * 0.8));
        setScore(prev => prev + 10 * (difficulty + 1));
      } else {
        targetNode.troops = Math.max(1, defenseStrength - Math.floor(attackStrength * 0.8));
      }
    }
    setNodes(updatedNodes);
    updateTeamCounts(updatedNodes);
  };

  const endTurn = () => {
    setPlayerTurn(false);
    setTurnNumber(prev => prev + 1);
    setGameMessage("AI taking their turns...");
    const updatedNodes = [...nodes];
    updatedNodes.forEach(node => {
      if (node.team === 1) node.troops += 1;
      else if (node.team >= 2) node.troops += Math.floor(1 + difficulty / 3);
    });
    setNodes(updatedNodes);
    setTimeout(simulateAITurns, 500);
  };

  const simulateAITurns = () => {
    let updatedNodes = [...nodes];
    const settings = DIFFICULTY_SETTINGS[difficulty];
    for (let i = 0; i < settings.enemies; i++) {
      makeAIMove(2 + i, updatedNodes);
    }
    setNodes(updatedNodes);
    setPlayerTurn(true);
    setGameMessage("Your turn! Select a node to move from.");
    updateTeamCounts(updatedNodes);
  };

  const makeAIMove = (team, nodesRef) => {
    const teamNodes = nodesRef.map((node, index) => ({ node, index }))
      .filter(({ node }) => node.team === team && node.troops >= 2);
    if (teamNodes.length === 0) return;

    const moves = Math.min(1 + Math.floor(difficulty / 4), teamNodes.length);
    for (let move = 0; move < moves; move++) {
      const sourceNodeData = teamNodes[Math.floor(Math.random() * teamNodes.length)];
      const sourceIndex = sourceNodeData.index;
      const sourceNode = sourceNodeData.node;

      const connectedNodeIndices = sourceNode.connections.map(connIndex => {
        const conn = connections[connIndex];
        return conn.nodeA === sourceIndex ? conn.nodeB : conn.nodeA;
      });

      const attackableIndices = connectedNodeIndices.filter(idx => nodesRef[idx].team !== team);
      if (attackableIndices.length > 0 && Math.random() < (0.5 + difficulty * 0.03)) {
        const targetIndex = attackableIndices[Math.floor(Math.random() * attackableIndices.length)];
        const targetNode = nodesRef[targetIndex];
        const troopsToMove = Math.max(1, Math.floor(sourceNode.troops * (0.5 + difficulty * 0.02)));
        sourceNode.troops -= troopsToMove;

        const adjustedAttackStrength = troopsToMove * (0.8 + difficulty * 0.04);
        if (adjustedAttackStrength > targetNode.troops) {
          targetNode.team = team;
          targetNode.troops = Math.max(1, troopsToMove - Math.floor(targetNode.troops * 0.8));
        } else {
          targetNode.troops = Math.max(1, targetNode.troops - Math.floor(troopsToMove * 0.8));
        }
      }
    }
  };

  const rotatePoint = (x, y, z) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0, z: 0, scale: 1 };
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);
    const x2 = x * cosY - z * sinY;
    const z2 = z * cosY + x * sinY;
    const cosX = Math.cos(rotation.x);
    const sinX = Math.sin(rotation.x);
    const y3 = y * cosX - z2 * sinX;
    const z3 = z2 * cosX + y * sinX;
    const scale = 600 / (600 + z3);
    return { x: centerX + x2 * scale, y: centerY + y3 * scale, z: z3, scale };
  };

  const renderNetwork = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#aaaaaa';
    ctx.textAlign = 'left';
    ctx.fillText(`Turn: ${turnNumber}`, 10, 20);
    if (isMultiplayer) {
      ctx.fillStyle = TEAM_COLORS[myTeam]?.fill || '#aaaaaa';
      ctx.fillText(turnNumber === myTeam ? "Your Turn" : "Waiting", 10, 45);
    } else {
      ctx.fillStyle = playerTurn ? TEAM_COLORS[1].fill : '#aaaaaa';
      ctx.fillText(playerTurn ? "Your Turn" : "AI Turn", 10, 45);
    }

    for (const connection of connections) {
      const nodeA = nodes[connection.nodeA];
      const nodeB = nodes[connection.nodeB];
      if (!nodeA || !nodeB) continue;
      const projectedA = rotatePoint(nodeA.position.x, nodeA.position.y, nodeA.position.z);
      const projectedB = rotatePoint(nodeB.position.x, nodeB.position.y, nodeB.position.z);
      if (projectedA.z < -300 || projectedB.z < -300) continue;

      ctx.strokeStyle = nodeA.team === nodeB.team ? TEAM_COLORS[nodeA.team].stroke : (nodeA.team === NEUTRAL || nodeB.team === NEUTRAL ? '#999999' : '#ffff00');
      ctx.lineWidth = 1 * (projectedA.scale + projectedB.scale) / 2;
      ctx.beginPath();
      ctx.moveTo(projectedA.x, projectedA.y);
      ctx.lineTo(projectedB.x, projectedB.y);
      ctx.stroke();
    }

    if (selectedNode !== null) {
      const selectedNodeObj = nodes[selectedNode];
      const projectedSelected = rotatePoint(selectedNodeObj.position.x, selectedNodeObj.position.y, selectedNodeObj.position.z);
      if (projectedSelected.z >= -300) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * projectedSelected.scale;
        ctx.setLineDash([5, 3]);
        for (const connIndex of selectedNodeObj.connections) {
          const conn = connections[connIndex];
          const targetNodeIndex = conn.nodeA === selectedNode ? conn.nodeB : conn.nodeA;
          const targetNode = nodes[targetNodeIndex];
          const projectedTarget = rotatePoint(targetNode.position.x, targetNode.position.y, targetNode.position.z);
          if (projectedTarget.z < -300) continue;

          ctx.beginPath();
          ctx.moveTo(projectedSelected.x, projectedSelected.y);
          ctx.lineTo(projectedTarget.x, projectedTarget.y);
          ctx.stroke();

          const angle = Math.atan2(projectedTarget.y - projectedSelected.y, projectedTarget.x - projectedSelected.x);
          const arrowSize = 8 * projectedTarget.scale;
          ctx.beginPath();
          ctx.moveTo(projectedTarget.x, projectedTarget.y);
          ctx.lineTo(projectedTarget.x - arrowSize * Math.cos(angle - Math.PI/6), projectedTarget.y - arrowSize * Math.sin(angle - Math.PI/6));
          ctx.lineTo(projectedTarget.x - arrowSize * Math.cos(angle + Math.PI/6), projectedTarget.y - arrowSize * Math.sin(angle + Math.PI/6));
          ctx.closePath();
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
        ctx.setLineDash([]);
      }
    }

    const nodeProjections = nodes.map((node, index) => {
      const projected = rotatePoint(node.position.x, node.position.y, node.position.z);
      return { node, index, projected };
    }).sort((a, b) => b.projected.z - a.projected.z);

    for (const { node, index, projected } of nodeProjections) {
      if (projected.z < -300) continue;
      const x = projected.x;
      const y = projected.y;
      const scale = projected.scale;
      const scaledNodeSize = NODE_SIZE * scale;

      let isValidTarget = false;
      if (selectedNode !== null && index !== selectedNode) {
        const selectedNodeObj = nodes[selectedNode];
        isValidTarget = selectedNodeObj.connections.some(connIdx => {
          const conn = connections[connIdx];
          return (conn.nodeA === selectedNode && conn.nodeB === index) || (conn.nodeB === selectedNode && conn.nodeA === index);
        });
      }

      if (selectedNode === index) {
        ctx.beginPath();
        ctx.arc(x, y, scaledNodeSize + 4 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();
      } else if (isValidTarget) {
        ctx.beginPath();
        ctx.arc(x, y, scaledNodeSize + 4 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
        ctx.fill();
        const pulseSize = (2 * Math.sin(Date.now() / 200) + 2) * scale;
        ctx.beginPath();
        ctx.arc(x, y, scaledNodeSize + pulseSize, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2 * scale;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(x, y, scaledNodeSize, 0, Math.PI * 2);
      ctx.fillStyle = TEAM_COLORS[node.team].fill;
      ctx.lineWidth = index === selectedNode ? 3 * scale : 1 * scale;
      ctx.strokeStyle = index === selectedNode ? '#ffffff' : '#000000';
      ctx.fill();
      ctx.stroke();

      ctx.font = `bold ${Math.max(8, Math.floor(12 * scale))}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(node.troops.toString(), x, y);

      ctx.font = `${Math.max(6, Math.floor(9 * scale))}px Arial`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(index.toString(), x + scaledNodeSize - 3 * scale, y - scaledNodeSize + 3 * scale);
    }
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 text-white h-full">
      <h2 className="text-2xl font-bold mb-2">Graph Wars {isMultiplayer ? `- Room: ${roomId}` : `- Level ${difficulty}`}</h2>
      <div className="mb-4 text-lg">
        {!isMultiplayer && <span className="mr-4">Score: <span className="font-bold">{score}</span></span>}
        {Object.entries(teamCounts).map(([team, count]) => (
          TEAM_COLORS[team] && (
            <span key={team} className="mr-4">
              {TEAM_COLORS[team].name}: <span style={{color: TEAM_COLORS[team].fill}}>{count}</span>
            </span>
          )
        ))}
      </div>
      {gameOver && (
        <div className="text-xl mb-2">
          {isMultiplayer 
            ? (winner === myTeam ? "You Win!" : "Game Over!")
            : (winner === 1 ? `You Win! Score: ${score}` : "You Lose!")}
        </div>
      )}
      <div className="text-lg mb-2">{gameMessage}</div>
      {!isMultiplayer ? (
        <>
          <canvas 
            ref={canvasRef} 
            width={800} 
            height={500} 
            className="border border-gray-700 bg-black mb-4"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
          />
          <div className="flex flex-wrap gap-2 mb-2 justify-center">
            <button 
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
              onClick={() => setSelectedNode(null)}
              disabled={!playerTurn || selectedNode === null}
            >
              Clear Selection
            </button>
            <button 
              className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded"
              onClick={endTurn}
              disabled={!playerTurn}
            >
              End Turn
            </button>
            <button 
              className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded"
              onClick={() => setRotation({ x: 0, y: 0 })}
            >
              Reset View
            </button>
            <button 
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded" 
              onClick={initializeNetwork}
            >
              New Game
            </button>
            <button 
              className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded"
              onClick={() => setIsMultiplayer(true)}
            >
              Multiplayer
            </button>
          </div>
	    <div className="flex flex-wrap gap-2 mb-2 justify-center">
	      <span className="text-lg mr-2">Level:</span>
	      {Array.from({ length: 10 }, (_, i) => (
	        <button
	          key={i}
	          className={`px-3 py-1 rounded ${difficulty === i ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
	          onClick={() => { setDifficulty(i); initializeNetwork(); }}
	        >
	          {i}
	        </button>
	      ))}
	    </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Enter Room ID"
              className="px-2 py-1 text-black"
            />
            <button onClick={joinGame} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded ml-2">
              Join Game
            </button>
            {!isReady && myTeam && (
              <button onClick={readyUp} className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded ml-2">
                Ready
              </button>
            )}
            <button 
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded ml-2"
              onClick={() => { setIsMultiplayer(false); socket?.disconnect(); setSocket(null); }}
            >
              Back to Single Player
            </button>
          </div>
          {myTeam && (
            <canvas 
              ref={canvasRef} 
              width={800} 
              height={500} 
              className="border border-gray-700 bg-black mb-4"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onContextMenu={handleContextMenu}
            />
          )}
          <div>Players: {Object.keys(players).length}/{DIFFICULTY_SETTINGS[difficulty].players}</div>
        </>
      )}
      <div className="text-sm text-gray-400 mb-2">
        Right-click and drag to rotate the graph
      </div>
      <div className="mt-4 text-sm text-gray-400">
        <p>How to play: Click on one of your nodes to select it (needs at least 2 troops).</p>
        <p>Then click a connected node to move/attack (highlighted in yellow).</p>
        <p>In single-player, click End Turn to let AI play. In multiplayer, turns cycle automatically.</p>
      </div>
    </div>
  );
};

export default GraphWarsGame;