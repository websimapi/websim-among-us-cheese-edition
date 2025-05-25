class AmongUsGame {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.gameMap = null;
        this.rooms = [];
        this.players = [];
        this.currentPlayer = null;
        this.gameState = 'loading'; // loading, playing, meeting, gameOver
        this.tasks = [];
        this.deadBodies = [];
        this.isImpostor = false;
        
        this.init();
    }
    
    async init() {
        await this.generateMap();
        await this.generateCharacters();
        this.setupCanvas();
        this.setupControls();
        this.setupGame();
        this.startGame();
    }
    
    async generateMap() {
        console.log('Generating spaceship map...');
        
        // Generate the Among Us spaceship map with AI
        const mapResult = await websim.imageGen({
            prompt: "Top-down view of an Among Us spaceship interior map, showing connected rooms like cafeteria, medical bay, electrical, navigation, weapons, shields, communications, reactor, upper engine, lower engine, security, admin, storage. Clean, bright colors, game-style 2D map with clear room boundaries and corridors. No characters or text labels.",
            aspect_ratio: "16:9"
        });
        
        this.gameMap = new Image();
        this.gameMap.crossOrigin = "anonymous";
        
        return new Promise((resolve) => {
            this.gameMap.onload = async () => {
                console.log('Map loaded, analyzing room boundaries...');
                await this.analyzeMapRooms();
                resolve();
            };
            this.gameMap.src = mapResult.url;
        });
    }
    
    async analyzeMapRooms() {
        // Use AI to analyze the generated map and identify room coordinates
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Analyze this Among Us spaceship map image and identify the rooms and their approximate coordinates. 
                    Respond with JSON containing an array of rooms, each with name, x, y coordinates (as percentages of image width/height), and approximate width/height.
                    JSON format: {
                        "rooms": [
                            {"name": "Cafeteria", "x": 0.5, "y": 0.3, "width": 0.15, "height": 0.12},
                            ...
                        ]
                    }`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Please identify all the rooms in this Among Us map and their coordinates"
                        },
                        {
                            type: "image_url",
                            image_url: { url: this.gameMap.src }
                        }
                    ]
                }
            ],
            json: true
        });
        
        try {
            const roomData = JSON.parse(completion.content);
            this.rooms = roomData.rooms || [];
            console.log('Detected rooms:', this.rooms);
        } catch (error) {
            console.log('AI analysis failed, using fallback room layout');
            // Fallback room layout if AI analysis fails
            this.rooms = [
                {name: "Cafeteria", x: 0.5, y: 0.3, width: 0.15, height: 0.12},
                {name: "Weapons", x: 0.2, y: 0.2, width: 0.12, height: 0.1},
                {name: "Navigation", x: 0.8, y: 0.2, width: 0.12, height: 0.1},
                {name: "Shields", x: 0.8, y: 0.4, width: 0.12, height: 0.1},
                {name: "Communications", x: 0.8, y: 0.6, width: 0.12, height: 0.1},
                {name: "Storage", x: 0.5, y: 0.7, width: 0.12, height: 0.1},
                {name: "Electrical", x: 0.2, y: 0.6, width: 0.12, height: 0.1},
                {name: "Lower Engine", x: 0.1, y: 0.8, width: 0.12, height: 0.1},
                {name: "Upper Engine", x: 0.1, y: 0.4, width: 0.12, height: 0.1},
                {name: "Medical Bay", x: 0.3, y: 0.4, width: 0.12, height: 0.1},
                {name: "Security", x: 0.3, y: 0.5, width: 0.12, height: 0.1},
                {name: "Reactor", x: 0.05, y: 0.6, width: 0.1, height: 0.1},
                {name: "Admin", x: 0.6, y: 0.5, width: 0.12, height: 0.1}
            ];
        }
    }
    
    async generateCharacters() {
        console.log('Generating Among Us characters...');
        
        // Generate cheese-eating Among Us character
        const characterResult = await websim.imageGen({
            prompt: "Among Us crewmate character sprite eating a piece of cheese, side view, colorful space suit (red, blue, green, yellow, pink, orange, purple, white), cute cartoon style, transparent background, game sprite art",
            transparent: true,
            aspect_ratio: "1:1"
        });
        
        this.characterImage = new Image();
        this.characterImage.crossOrigin = "anonymous";
        
        return new Promise((resolve) => {
            this.characterImage.onload = () => {
                console.log('Character sprites loaded');
                resolve();
            };
            this.characterImage.src = characterResult.url;
        });
    }
    
    setupCanvas() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size to fill screen
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Hide loading screen and show game
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    setupControls() {
        // Mobile joystick controls
        this.setupJoystick();
        
        // Button controls
        document.getElementById('useButton').addEventListener('click', () => this.handleUseButton());
        document.getElementById('reportButton').addEventListener('click', () => this.handleReportButton());
        document.getElementById('emergencyButton').addEventListener('click', () => this.startMeeting());
        
        // Meeting controls
        document.getElementById('sendMessage').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        document.getElementById('skipVote').addEventListener('click', () => this.vote('skip'));
        document.getElementById('playAgain').addEventListener('click', () => this.restartGame());
    }
    
    setupJoystick() {
        const joystick = document.getElementById('joystick');
        const knob = document.getElementById('joystickKnob');
        let isDragging = false;
        let joystickCenter = { x: 60, y: 60 };
        
        this.playerVelocity = { x: 0, y: 0 };
        
        const handleStart = (e) => {
            isDragging = true;
            e.preventDefault();
        };
        
        const handleMove = (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            const rect = joystick.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            
            const x = touch.clientX - rect.left - joystickCenter.x;
            const y = touch.clientY - rect.top - joystickCenter.y;
            
            const distance = Math.sqrt(x * x + y * y);
            const maxDistance = 40;
            
            if (distance <= maxDistance) {
                knob.style.transform = `translate(${x - 20}px, ${y - 20}px)`;
                this.playerVelocity.x = x / maxDistance;
                this.playerVelocity.y = y / maxDistance;
            } else {
                const angle = Math.atan2(y, x);
                const limitedX = Math.cos(angle) * maxDistance;
                const limitedY = Math.sin(angle) * maxDistance;
                
                knob.style.transform = `translate(${limitedX - 20}px, ${limitedY - 20}px)`;
                this.playerVelocity.x = Math.cos(angle);
                this.playerVelocity.y = Math.sin(angle);
            }
        };
        
        const handleEnd = () => {
            isDragging = false;
            knob.style.transform = 'translate(-20px, -20px)';
            this.playerVelocity.x = 0;
            this.playerVelocity.y = 0;
        };
        
        joystick.addEventListener('touchstart', handleStart);
        joystick.addEventListener('touchmove', handleMove);
        joystick.addEventListener('touchend', handleEnd);
        joystick.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    }
    
    setupGame() {
        // Create players
        this.players = [];
        const colors = ['red', 'blue', 'green', 'yellow', 'pink', 'orange', 'purple', 'white'];
        
        for (let i = 0; i < 8; i++) {
            this.players.push({
                id: i,
                name: `Player ${i + 1}`,
                color: colors[i],
                x: 0.5 * this.canvas.width + (Math.random() - 0.5) * 100,
                y: 0.3 * this.canvas.height + (Math.random() - 0.5) * 100,
                isAlive: true,
                isImpostor: i === 0, // First player is impostor for demo
                tasks: []
            });
        }
        
        this.currentPlayer = this.players[0];
        this.isImpostor = this.currentPlayer.isImpostor;
        
        // Update HUD
        document.getElementById('playerName').textContent = this.currentPlayer.name;
        document.getElementById('playerRole').textContent = this.isImpostor ? 'Impostor' : 'Crewmate';
        
        // Generate tasks for crewmates
        this.generateTasks();
    }
    
    generateTasks() {
        const taskTypes = ['Fix Wiring', 'Clear Asteroids', 'Swipe Card', 'Fuel Engines', 'Calibrate Distributor'];
        
        this.players.forEach(player => {
            if (!player.isImpostor) {
                for (let i = 0; i < 5; i++) {
                    const randomRoom = this.rooms[Math.floor(Math.random() * this.rooms.length)];
                    player.tasks.push({
                        type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
                        room: randomRoom.name,
                        x: randomRoom.x * this.canvas.width,
                        y: randomRoom.y * this.canvas.height,
                        completed: false
                    });
                }
            }
        });
        
        this.updateTaskCounter();
    }
    
    updateTaskCounter() {
        const completedTasks = this.currentPlayer.tasks.filter(task => task.completed).length;
        const totalTasks = this.currentPlayer.tasks.length;
        document.getElementById('taskCount').textContent = `${completedTasks}/${totalTasks}`;
    }
    
    startGame() {
        this.gameState = 'playing';
        this.gameLoop();
    }
    
    gameLoop() {
        if (this.gameState === 'playing') {
            this.update();
            this.render();
            requestAnimationFrame(() => this.gameLoop());
        }
    }
    
    update() {
        // Update current player position based on joystick input
        const speed = 3;
        this.currentPlayer.x += this.playerVelocity.x * speed;
        this.currentPlayer.y += this.playerVelocity.y * speed;
        
        // Keep player in bounds
        this.currentPlayer.x = Math.max(30, Math.min(this.canvas.width - 30, this.currentPlayer.x));
        this.currentPlayer.y = Math.max(30, Math.min(this.canvas.height - 30, this.currentPlayer.y));
        
        // Update other players (basic AI movement)
        this.players.forEach(player => {
            if (player !== this.currentPlayer && player.isAlive) {
                // Simple random movement for AI players
                player.x += (Math.random() - 0.5) * 2;
                player.y += (Math.random() - 0.5) * 2;
                
                // Keep in bounds
                player.x = Math.max(30, Math.min(this.canvas.width - 30, player.x));
                player.y = Math.max(30, Math.min(this.canvas.height - 30, player.y));
            }
        });
        
        // Check for task completion
        this.checkTaskInteraction();
        
        // Check win conditions
        this.checkWinConditions();
    }
    
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw map
        if (this.gameMap) {
            this.ctx.drawImage(this.gameMap, 0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Draw room labels
        this.drawRoomLabels();
        
        // Draw tasks
        this.drawTasks();
        
        // Draw players
        this.drawPlayers();
        
        // Draw dead bodies
        this.drawDeadBodies();
    }
    
    drawRoomLabels() {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        this.rooms.forEach(room => {
            const x = room.x * this.canvas.width;
            const y = room.y * this.canvas.height;
            
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(x - 30, y - 10, 60, 20);
            
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(room.name, x, y + 5);
        });
    }
    
    drawTasks() {
        if (!this.isImpostor) {
            this.currentPlayer.tasks.forEach(task => {
                if (!task.completed) {
                    this.ctx.fillStyle = '#ffff00';
                    this.ctx.beginPath();
                    this.ctx.arc(task.x, task.y, 8, 0, Math.PI * 2);
                    this.ctx.fill();
                    
                    // Task exclamation mark
                    this.ctx.fillStyle = 'black';
                    this.ctx.font = 'bold 12px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.fillText('!', task.x, task.y + 4);
                }
            });
        }
    }
    
    drawPlayers() {
        this.players.forEach(player => {
            if (player.isAlive) {
                // Draw character (cheese-eating Among Us character)
                if (this.characterImage) {
                    this.ctx.save();
                    this.ctx.translate(player.x, player.y);
                    
                    // Color tint based on player color
                    if (player.color !== 'white') {
                        this.ctx.globalCompositeOperation = 'multiply';
                        this.ctx.fillStyle = player.color;
                        this.ctx.fillRect(-20, -25, 40, 50);
                        this.ctx.globalCompositeOperation = 'source-over';
                    }
                    
                    this.ctx.drawImage(this.characterImage, -20, -25, 40, 50);
                    this.ctx.restore();
                }
                
                // Draw player name
                this.ctx.fillStyle = 'white';
                this.ctx.font = '10px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(player.name, player.x, player.y - 35);
                
                // Draw impostor indicator (only visible to current player if they're impostor)
                if (this.isImpostor && player.isImpostor && player !== this.currentPlayer) {
                    this.ctx.fillStyle = 'red';
                    this.ctx.beginPath();
                    this.ctx.arc(player.x + 15, player.y - 15, 5, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        });
    }
    
    drawDeadBodies() {
        this.deadBodies.forEach(body => {
            this.ctx.fillStyle = 'darkred';
            this.ctx.beginPath();
            this.ctx.arc(body.x, body.y, 15, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('💀', body.x, body.y + 3);
        });
    }
    
    checkTaskInteraction() {
        if (this.isImpostor) return;
        
        this.currentPlayer.tasks.forEach(task => {
            if (!task.completed) {
                const distance = Math.sqrt(
                    Math.pow(this.currentPlayer.x - task.x, 2) + 
                    Math.pow(this.currentPlayer.y - task.y, 2)
                );
                
                if (distance < 30) {
                    // Show use button highlight
                    document.getElementById('useButton').style.background = '#4CAF50';
                    document.getElementById('useButton').style.boxShadow = '0 0 20px #4CAF50';
                } else {
                    document.getElementById('useButton').style.background = '#4CAF50';
                    document.getElementById('useButton').style.boxShadow = 'none';
                }
            }
        });
    }
    
    handleUseButton() {
        if (this.isImpostor) {
            this.attemptKill();
        } else {
            this.attemptTask();
        }
    }
    
    attemptTask() {
        this.currentPlayer.tasks.forEach(task => {
            if (!task.completed) {
                const distance = Math.sqrt(
                    Math.pow(this.currentPlayer.x - task.x, 2) + 
                    Math.pow(this.currentPlayer.y - task.y, 2)
                );
                
                if (distance < 30) {
                    task.completed = true;
                    this.updateTaskCounter();
                    console.log(`Completed task: ${task.type} in ${task.room}`);
                }
            }
        });
    }
    
    attemptKill() {
        this.players.forEach(player => {
            if (player !== this.currentPlayer && player.isAlive && !player.isImpostor) {
                const distance = Math.sqrt(
                    Math.pow(this.currentPlayer.x - player.x, 2) + 
                    Math.pow(this.currentPlayer.y - player.y, 2)
                );
                
                if (distance < 50) {
                    player.isAlive = false;
                    this.deadBodies.push({
                        x: player.x,
                        y: player.y,
                        player: player
                    });
                    console.log(`${player.name} was eliminated!`);
                }
            }
        });
    }
    
    handleReportButton() {
        // Check if near a dead body
        this.deadBodies.forEach(body => {
            const distance = Math.sqrt(
                Math.pow(this.currentPlayer.x - body.x, 2) + 
                Math.pow(this.currentPlayer.y - body.y, 2)
            );
            
            if (distance < 50) {
                this.startMeeting(`${body.player.name}'s body was reported!`);
            }
        });
    }
    
    startMeeting(reason = "Emergency meeting called!") {
        this.gameState = 'meeting';
        document.getElementById('gameScreen').style.display = 'none';
        document.getElementById('meetingScreen').style.display = 'block';
        
        // Add meeting message
        this.addChatMessage('System', reason);
        
        // Setup player voting list
        this.setupVoting();
    }
    
    setupVoting() {
        const playerList = document.getElementById('playerList');
        playerList.innerHTML = '';
        
        this.players.forEach(player => {
            if (player.isAlive) {
                const playerCard = document.createElement('div');
                playerCard.className = 'player-card';
                playerCard.innerHTML = `
                    <div style="width: 30px; height: 30px; background: ${player.color}; border-radius: 50%; margin: 0 auto 5px;"></div>
                    <div>${player.name}</div>
                `;
                
                playerCard.addEventListener('click', () => {
                    document.querySelectorAll('.player-card').forEach(card => card.classList.remove('selected'));
                    playerCard.classList.add('selected');
                });
                
                playerList.appendChild(playerCard);
            }
        });
    }
    
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message) {
            this.addChatMessage(this.currentPlayer.name, message);
            input.value = '';
            
            // Simulate AI responses from other players
            setTimeout(() => {
                const responses = [
                    "I was in electrical doing tasks",
                    "That's suspicious...",
                    "I saw someone near the body",
                    "Vote them out!",
                    "I was with someone else",
                    "Emergency meeting was necessary"
                ];
                
                const randomPlayer = this.players.find(p => p.isAlive && p !== this.currentPlayer);
                if (randomPlayer) {
                    const response = responses[Math.floor(Math.random() * responses.length)];
                    this.addChatMessage(randomPlayer.name, response);
                }
            }, 1000 + Math.random() * 2000);
        }
    }
    
    addChatMessage(sender, message) {
        const messages = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
        messages.appendChild(messageDiv);
        messages.scrollTop = messages.scrollHeight;
    }
    
    vote(target) {
        // Simple voting mechanism
        setTimeout(() => {
            this.endMeeting();
        }, 2000);
    }
    
    endMeeting() {
        this.gameState = 'playing';
        document.getElementById('meetingScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        
        // Clear dead bodies after meeting
        this.deadBodies = [];
        
        this.gameLoop();
    }
    
    checkWinConditions() {
        const aliveCrew = this.players.filter(p => p.isAlive && !p.isImpostor).length;
        const aliveImpostors = this.players.filter(p => p.isAlive && p.isImpostor).length;
        
        if (aliveImpostors >= aliveCrew) {
            this.endGame('Impostors Win!');
        } else if (aliveImpostors === 0) {
            this.endGame('Crewmates Win!');
        } else if (!this.isImpostor) {
            const allTasksComplete = this.players
                .filter(p => !p.isImpostor && p.isAlive)
                .every(p => p.tasks.every(t => t.completed));
            
            if (allTasksComplete) {
                this.endGame('Crewmates Win by Tasks!');
            }
        }
    }
    
    endGame(result) {
        this.gameState = 'gameOver';
        document.getElementById('gameScreen').style.display = 'none';
        document.getElementById('gameResult').textContent = result;
        document.getElementById('gameOverScreen').style.display = 'block';
    }
    
    restartGame() {
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('loadingScreen').style.display = 'block';
        
        // Reset game state
        this.players = [];
        this.deadBodies = [];
        this.gameState = 'loading';
        
        // Restart the game
        setTimeout(() => {
            this.setupGame();
            document.getElementById('loadingScreen').style.display = 'none';
            document.getElementById('gameScreen').style.display = 'block';
            this.startGame();
        }, 1000);
    }
}

// Start the game when page loads
window.addEventListener('load', () => {
    new AmongUsGame();
});

