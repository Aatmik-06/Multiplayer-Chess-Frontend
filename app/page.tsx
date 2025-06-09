'use client';

import { useState, useEffect } from 'react';
import io, { Socket } from 'socket.io-client';
import { Chess } from 'chess.js';
import dynamic from 'next/dynamic';
import { Crown, Users, Clock, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BackgroundBeams } from "../components/ui/background-beams";


// Dynamically import Chessboard to avoid SSR issues
const Chessboard = dynamic(() => import('chessboardjsx'), { ssr: false });



interface GameState {
  fen: string;
  currentTurn: 'white' | 'black';
  playerCount: number;
  gameStarted: boolean;
}

interface MoveData {
  move: any;
  fen: string;
  currentTurn: 'white' | 'black';
  gameOver: boolean;
  inCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
}

export default function ChessGame() {
  // Add this state for tracking selected square
const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
const [highlightedSquares, setHighlightedSquares] = useState<{ [key: string]: { background: string; } }>({});

  const [socket, setSocket] = useState<Socket | null>(null);
  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);
  const [gameState, setGameState] = useState<GameState>({
    fen: chess.fen(),
    currentTurn: 'white',
    playerCount: 0,
    gameStarted: false
  });
  const [gameStatus, setGameStatus] = useState<string>('Waiting for players...');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string>('');
  const [gameOver, setGameOver] = useState(false);

  
const [boardWidth, setBoardWidth] = useState(400); // default size

useEffect(() => {
  const updateSize = () => {
      const screenWidth = window.innerWidth;
      if (screenWidth < 640) setBoardWidth(screenWidth - 32);         // mobile
      else if (screenWidth < 1024) setBoardWidth(Math.min((screenWidth - 96) / 2, 480));    // tablet
      else setBoardWidth(480);                                        // desktop
    };

  updateSize();
  window.addEventListener("resize", updateSize);
  return () => window.removeEventListener("resize", updateSize);
}, []);

  useEffect(() => {
    // Connect to backend
    const newSocket = io('https://multiplayer-chess-backend-pxe2.onrender.com/');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      setError('');
      newSocket.emit('join-game');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      setGameStatus('Disconnected from server');
    });

    newSocket.on('player-assigned', (data) => {
      setPlayerColor(data.color);
      setGameState(data.gameState);
      chess.load(data.gameState.fen);
      setFen(data.gameState.fen);
      
      if (data.gameState.gameStarted) {
        setGameStatus('Game in progress');
      } else {
        setGameStatus(`You are ${data.color}. Waiting for opponent...`);
      }
    });

    newSocket.on('game-start', (data) => {
      setGameState(prev => ({ ...prev, gameStarted: true }));
      setGameStatus('Game started! Good luck!');
      chess.load(data.fen);
      setFen(data.fen);
    });

    newSocket.on('player-count-update', (data) => {
      setGameState(prev => ({ ...prev, ...data }));
      if (!data.gameStarted && data.playerCount === 1) {
        setGameStatus(`You are ${playerColor}. Waiting for opponent...`);
      }
    });

    newSocket.on('move-made', (data: MoveData) => {
      chess.load(data.fen);
      setFen(data.fen);
      setGameState(prev => ({ ...prev, currentTurn: data.currentTurn }));
      
      if (data.gameOver) {
        setGameOver(true);
        if (data.isCheckmate) {
          const winner = data.currentTurn === 'white' ? 'Black' : 'White';
          setGameStatus(`Checkmate! ${winner} wins!`);
        } else if (data.isDraw) {
          setGameStatus('Game ended in a draw');
        }
      } else if (data.inCheck) {
        setGameStatus(`${data.currentTurn === 'white' ? 'White' : 'Black'} is in check!`);
      } else {
        setGameStatus(`${data.currentTurn === 'white' ? 'White' : 'Black'}'s turn`);
      }
    });

    newSocket.on('game-over', (data) => {
      setGameOver(true);
      if (data.result === 'draw') {
        setGameStatus('Game ended in a draw');
      } else {
        setGameStatus(`${data.result === 'white' ? 'White' : 'Black'} wins by ${data.reason}!`);
      }
    });

    newSocket.on('game-full', () => {
      setError('Game is full. Only 2 players allowed.');
    });

    newSocket.on('move-error', (errorMsg) => {
      setError(errorMsg);
    });

    newSocket.on('player-disconnected', (data) => {
      setGameState(prev => ({ ...prev, ...data }));
      setGameStatus('Opponent disconnected. Waiting for new player...');
      setGameOver(false);
    });

    newSocket.on('game-reset', () => {
      chess.reset();
      setFen(chess.fen());
      setGameState({
        fen: chess.fen(),
        currentTurn: 'white',
        playerCount: 0,
        gameStarted: false
      });
      setGameStatus('Game reset. Waiting for players...');
      setGameOver(false);
      setError('');
    });

    return () => {
      newSocket.close();
    };
  }, [chess, playerColor]);

  const handleMove = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string }) => {
    if (!socket || !playerColor || gameState.currentTurn !== playerColor || gameOver) {
      return;
    }

    // Clear any previous errors
    setError('');

    // Send move to server
    socket.emit('make-move', {
      from: sourceSquare,
      to: targetSquare
    });
  };

  const handleNewGame = () => {
    if (socket) {
      socket.emit('new-game');
    }
  };

  const isMyTurn = playerColor === gameState.currentTurn && gameState.gameStarted && !gameOver;

const highlightLegalMoves = (square: string) => {
  const moves = chess.moves({ square: square as any, verbose: true });
  if (moves.length === 0) return;

  const highlights: { [key: string]: { background: string; boxShadow?: string } } = {};
  moves.forEach(move => {
    highlights[move.to] = {
  background: 'rgb(209, 213, 219, 0.8)', 
  boxShadow: 'inset 0 0 0 2px rgb(37, 99, 235)'    };
  });
 highlightedSquares[square] = {
  background: '#a0aec0', 
};
  setHighlightedSquares(highlights);
};


const handleSquareClick = (square: string) => {
  if (!playerColor || gameState.currentTurn !== playerColor || gameOver) return;

  if (selectedSquare) {
    const moves = chess.moves({ square: selectedSquare as any, verbose: true });
    const move = moves.find(m => m.to === square);
    if (move) {
      handleMove({ sourceSquare: selectedSquare, targetSquare: square });
      setSelectedSquare(null);
      setHighlightedSquares({});
    } else {
    
      if (chess.get(square as any)?.color === (playerColor === 'white' ? 'w' : 'b')) {
        setSelectedSquare(square);
        highlightLegalMoves(square);
      } else {
        setSelectedSquare(null);
        setHighlightedSquares({});
      }
    }
  } else {
    const piece = chess.get(square as any);
    if (piece?.color === (playerColor === 'white' ? 'w' : 'b')) {
      setSelectedSquare(square);
      highlightLegalMoves(square);
    }
  }
};


  return (
    
  <div className="min-h-screen bg-[rgba(102,116,146,0.1)]  text-white p-1 sm:p-4">

      <div className="max-w-7xl mx-auto px-1  ">
        {/* Header */}
      <div className="text-center mb-6">
      <h1 className="text-3xl sm:text-4xl font-bold mb-2 flex items-center justify-center gap-2">
        <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500" />
        Multiplayer Chess
      </h1>
      <p className="text-gray-400 text-sm sm:text-base">Play chess in real-time with a friend</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Chessboard Section */}
      <div className="lg:col-span-2 w-full">
              <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-2 sm:p-6">
                  <div className="aspect-square w-full max-w-[calc(100vw-1rem)] sm:max-w-md md:max-w-lg mx-auto">
              {typeof window !== 'undefined' && (
             <Chessboard
  width={boardWidth}
  position={fen}
  orientation={playerColor || 'white'}
  onDrop={handleMove} // for drag
  onSquareClick={handleSquareClick} // for click-to-move
  squareStyles={highlightedSquares} // for highlighting
  allowDrag={({ piece }) => {
    if (!playerColor || gameOver) return false;
    return (
      gameState.gameStarted &&
      gameState.currentTurn === playerColor &&
      piece.charAt(0) === (playerColor === 'white' ? 'w' : 'b')
    );
  }}
  boardStyle={{
    borderRadius: '0.5rem',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
  }}
  darkSquareStyle={{ backgroundColor: '#4a5568' }}
  lightSquareStyle={{ backgroundColor: '#e2e8f0' }}
/>


              )}
            </div>
          </CardContent>
        </Card>
      </div>
 

      {/* Side Panel */}
      
    <div className="space-y-4 w-full px-4 max-sm:px-2 max-sm:space-y-3">

  {/* Error Display */}
  {error && (
    <Alert className="bg-red-900 border-red-700 text-sm max-sm:text-xs max-sm:p-4">
      <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-100" />
      <AlertDescription className="text-red-100">
        {error}
      </AlertDescription>
    </Alert>
  )}

  {/* Connection Status */}
  <Card className="bg-gray-800 border-gray-700">
    <CardHeader className="pt-2 pb-3 max-sm:pb-2 max-sm:px-3">
      <CardTitle className="flex items-center gap-2 text-base max-sm:text-sm">
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        Connection Status
      </CardTitle>
    </CardHeader>
    <CardContent className="max-sm:px-3 max-sm:pb-3">
      <p className="text-sm max-sm:text-xs text-gray-300">{isConnected ? 'Connected to server' : 'Disconnected from server'}</p>
    </CardContent>
  </Card>

  {/* Player Info */}
  <Card className="bg-gray-800 border-gray-700">
    <CardHeader className="pt-2 pb-3 max-sm:pb-2 max-sm:px-3">
      <CardTitle className="flex items-center gap-2 text-base max-sm:text-sm">
        <Crown className="w-4 h-4 text-yellow-500" />
        Player Info
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 max-sm:space-y-2 max-sm:px-3 max-sm:pb-3">
      {playerColor && (
        <div className="flex items-center justify-between">
          <span className="text-sm max-sm:text-xs text-gray-300">Your Color:</span>
          <Badge variant={playerColor === 'white' ? 'default' : 'secondary'} className="max-sm:text-xs">
            {playerColor.charAt(0).toUpperCase() + playerColor.slice(1)}
          </Badge>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm max-sm:text-xs text-gray-300">Players:</span>
        <Badge variant="outline" className="flex items-center gap-1 max-sm:text-xs">
          <Users className="w-3 h-3" />
          {gameState.playerCount}/2
        </Badge>
      </div>
      {gameState.gameStarted && (
        <div className="flex items-center justify-between">
          <span className="text-sm max-sm:text-xs text-gray-300">Current Turn:</span>
          <Badge variant={gameState.currentTurn === 'white' ? 'default' : 'secondary'} className="max-sm:text-xs">
            <Clock className="w-3 h-3 mr-1" />
            {gameState.currentTurn.charAt(0).toUpperCase() + gameState.currentTurn.slice(1)}
          </Badge>
        </div>
      )}
      {isMyTurn && (
        <Badge className="w-full justify-center bg-green-600 hover:bg-green-700 max-sm:text-xs max-sm:py-1">
          Your Turn!
        </Badge>
      )}
    </CardContent>
  </Card>

  {/* Game Status */}
  <Card className="bg-gray-800 border-gray-700">
    <CardHeader className="pt-2 pb-3 max-sm:pb-2 max-sm:px-3">
      <CardTitle className="text-base max-sm:text-sm">Game Status</CardTitle>
    </CardHeader>
    <CardContent className="max-sm:px-3 max-sm:pb-3">
      <p className="text-sm max-sm:text-xs text-gray-300">{gameStatus}</p>
    </CardContent>
  </Card>

  {/* Game Controls */}
  <Card className="bg-gray-800 border-gray-700">
    <CardHeader className="pt-2 pb-3 max-sm:pb-2 max-sm:px-3">
      <CardTitle className="text-base max-sm:text-sm">Game Controls</CardTitle>
    </CardHeader>
    <CardContent className="max-sm:px-3 max-sm:pb-3">
      <Button
        onClick={handleNewGame}
        className="w-full flex items-center gap-2 max-sm:text-xs max-sm:py-1"
        variant="outline"
      >
        <RotateCcw className="w-4 h-4" />
        New Game
      </Button>
    </CardContent>
  </Card>

  {/* Instructions */}
  <Card className="bg-gray-800 border-gray-700">
    <CardHeader className="pt-2 pb-3 max-sm:pb-2 max-sm:px-3">
      <CardTitle className="text-base max-sm:text-sm">How to Play</CardTitle>
    </CardHeader>
    <CardContent className="space-y-1 text-sm max-sm:text-xs text-gray-300 max-sm:px-3 max-sm:pb-3">
      <p>• Wait for another player to join</p>
      <p>• Drag and drop pieces to make moves</p>
      <p>• You can only move on your turn</p>
      <p>• White moves first</p>
      <p>• Share this URL with a friend to play!</p>
    </CardContent>
  </Card>
</div>

    </div>
  </div>
</div>

  );
}
