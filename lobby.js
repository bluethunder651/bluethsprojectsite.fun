class MultiplayerLobby{
    constructor() {
        this.playerName = localStorage.getItem('playerName') || '';
        this.currentScreen = 'main-menu';
        this.currentGame = null;
        this.isHost = false;
        this.isReady = false;
        this.availableGames = [];
        this.selectedGame = null;
        this.filterMetadata = null;
        this.token = null;
        this.website = 'https://julia.bluethsprojectsite.fun';
        this.sessionId = this.generateSessionId();
        this.lastChatTimestamp = 0;
        this.chatPollInterval = null;
        this.maxRounds = false;
        this.timeLimitCheck = false;
        this.socket = io()

        this.init = this.init.bind(this);

        if(document.readyState === 'loading'){
            document.addEventListener('DOMContentLoaded', this.init);
        } else {
            this.init();
        }
    }

    init(){
        this.setupEventListeners();
        this.loadSavedName();
        this.loadFilterMetadata();
        this.startPolling();

        this.recoverSession();

        window.addEventListener('beforeunload', () => this.handlePageUnload());

        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
    }

    setupEventListeners(){
        document.getElementById('set-name-btn').addEventListener('click', () => this.setPlayerName());
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.setPlayerName();
        });
        document.getElementById('host-game-btn').addEventListener('click', () => this.showHostScreen());
        document.getElementById('refresh-games').addEventListener('click', () => this.fetchGames());
        document.getElementById('back-to-menu-from-host').addEventListener('click', () => this.showMainMenu());
        document.getElementById('create-game-btn').addEventListener('click', () => this.createGame());
        document.getElementById('leave-game-btn').addEventListener('click', () => this.leaveGame());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('ready-checkbox').addEventListener('change', (e) => this.toggleReady(e.target.checked));
        document.getElementById('send-chat-btn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        document.querySelector('.filter-header').addEventListener('click', () => this.toggleFilters());
        document.getElementById('max-rounds').addEventListener('click', () => {
            this.maxRounds = document.getElementById('max-rounds').checked;
            if(this.maxRounds){
                document.getElementById('game-rounds-div').style.display = 'block';
            } else {
                document.getElementById('game-rounds-div').style.display = 'none';
            }
        });

        document.getElementById('time-limit-checkbox').addEventListener('click', () => {
            this.timeLimitCheck = document.getElementById('time-limit-checkbox').checked;
            if(this.timeLimitCheck){
                document.getElementById('time-limit-div').style.display = 'block';
            } else {
                document.getElementById('time-limit-div').style.display = 'none';
            }
        });

        this.socket.on('update_messages', function(data){
            const message = data.chat_message;
            game.addChatMessage(message.player, message.message, message.timestamp);
        })

    }

    loadSavedName() {
        if(this.playerName){
            document.getElementById('player-name').value = this.playerName;
            this.enableGameButtons(true);
        }
    }

    setPlayerName() {
        const nameInput = document.getElementById('player-name');
        const name = nameInput.value.trim();

        if (name.length < 3) {
            alert('Name must be at least 3 characters');
            return;
        }
        if (name.length > 25){
            alert('Name must be less than 25 characters');
            return;
        }

        this.playerName = name;
        localStorage.setItem('playerName', name);
        this.enableGameButtons(true);

        if(this.socket && this.socket.connected){
            this.socket.emit('update_player_name', {name});
        }
    }

    enableGameButtons(enable){
        document.getElementById('host-game-btn').disabled = !enable
    }

    generateSessionId(){
        let sessionId = localStorage.getItem('sessionId');
        if(!sessionId){
            sessionId = 'session_' + Math.random().toString(36).substr(2,9);
            localStorage.setItem('sessionId', sessionId);
        }
    }

    async loadFilterMetadata() {
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        try{
            const response = await fetch('https://julia.bluethsprojectsite.fun/api/local/metadata/filters', {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });
            if(response.ok){
                this.filterMetadata = await response.json();
                this.populateFilters('host-filters');
            }
        } catch (error) {
            console.error('Failed to load filters: ', error);
        }
    }

    populateFilters(containerId){
        const container = document.getElementById(containerId);
        if (!container || !this.filterMetadata) return;

        container.innerHTML = '';

        const categories = [
            { name: 'tags', title: 'Tags'},
            { name: 'languages', title: 'Languages' },
            { name: 'decades', title: 'Decades' },
            { name: 'difficulties', title: 'Difficulties' },
            { name: 'genres', title: 'Genres' },
            { name: 'production_companies', title: 'Production Companies'},
            { name: 'networks', title: 'Networks'},
            { name: 'countries', title: 'Countries'}
        ]

        categories.forEach(category => {
            if(this.filterMetadata[category.name] && this.filterMetadata[category.name].length > 0){
                const section = document.createElement('div');
                section.className = 'filter-category';
                section.innerHTML = `<h4>${category.title}</h4>`;

                const itemsDiv = document.createElement('div');
                itemsDiv.className = 'filter-items';

                this.filterMetadata[category.name].forEach(item => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'filter-item';
                    itemDiv.innerHTML = `
                        <input type="checkbox" class="filter-checkbox" data-category="${category.name}" value=${item.toLowerCase()}">
                        <label>${item}</label>
                    `;
                    itemsDiv.appendChild(itemDiv);
                });

                section.appendChild(itemsDiv);
                container.appendChild(section);
            }
        });

        const specialSection = document.createElement('div');
        specialSection.className = 'filter-category';
        specialSection.innerHTML = `
            <h4>Special Openings</h4>
            <div class="filter-item">
                <input type="checkbox" id="special-openings-filter" class="filter-checkbox" data-category="special">
                <label>Include Special Openings</label>
            </div>
        `;
        container.appendChild(specialSection)
    }

    toggleFilters() {
        const content = document.getElementById('host-filters');
        const arrow = document.querySelector('.filter-header .arrow');

        if(content.style.display === 'none'){
            content.style.display = 'block';
            arrow.textContent = '▲';
        } else {
            content.style.display = 'none';
            arrow.textContent = '▼';
        }
    }

    async fetchGames() {
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        try{
            const response = await fetch('https://julia.bluethsprojectsite.fun/api/local/multiplayer/games', {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                this.availableGames = await response.json();
                this.displayGamesList();
            }
        } catch(error) {
            console.error('Failed to fetch games: ', error);
        }
    }

    async handlePageUnload() {
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }        
        if (this.currentGame){
            const data = JSON.stringify({
                gameCode: this.currentGame.code,
                playerName: this.playerName,
                sessionId: this.sessionId
            });

            navigator.sendBeacon('https://julia.bluethsprojectsite.fun/api/local/multiplayer/leave', new Blob([data], {type: 'application/json'}));
        }
    }

    handleVisibilityChange() {
        if(document.hidden){
            this.throttlePolling();
        } else {
            this.restorePolling();

            if(this.currentGame){
                this.verifyGameMembership();
            }
        }
    }

    throttlePolling() {
        if(this.pollInterval){
            clearInterval(this.pollInterval);
            this.pollInterval = setInterval(() => this.fetchGames(), 10000);
        }
        if(this.gamePollInterval){
            clearInterval(this.gamePollInterval);
            this.gamePollInterval = setInterval(() => this.fetchGameStatus(this.currentGame.code), 5000);
        }
        if(this.chatPollInterval){
            clearInterval(this.chatPollInterval);
            this.chatPollInterval = setInterval(() => this.fetchChatMessages(this.currentGame.code), 5000);
        }
    }

    restorePolling(){
        if(this.pollInterval){
            clearInterval(this.pollInterval);
            this.pollInterval = setInterval(() => this.fetchGames(), 3000);
        } 
        if(this.gamePollInterval && this.currentGame){
            clearInterval(this.gamePollInterval);
            this.gamePollInterval = setInterval(() => this.fetchGameStatus(this.currentGame.code), 2000);
        }
        if(this.chatPollInterval){
            clearInterval(this.chatPollInterval);
            this.chatPollInterval = setInterval(() => this.fetchChatMessages(this.currentGame.code), 1000);
        }
    }

    async recoverSession(){
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }   
        
        const lastGame = localStorage.getItem('lastGame');

        if(lastGame){
            try{
                const gameData = JSON.parse(lastGame);
                console.log(`lastGame: ${lastGame}, gameData: ${gameData}`);
                const response = await fetch(`${this.website}/api/local/multiplayer/game/${gameData.code}?player=${encodeURIComponent(this.playerName)}&session=${this.sessionId}`, {
                    headers: {
                        'X-Auth-Token': this.token,
                        'Referer': window.location.origin
                    }
                });

                if(response.ok){
                    const game = await response.json();
                    if(game && game.players.some(p => p.name === this.playerName)){
                        this.currentGame = game;
                        this.isHost = (game.host === this.playerName);
                        this.showGameLobby(gameData);
                        this.startGamePolling(game.code);
                        this.startHeartbeat();
                    } else {
                        localStorage.removeItem('lastGame');
                    }
                } else {
                    localStorage.removeItem('lastGame');
                }

            } catch (error) {
                console.error('Failed to recover session: ', error);
                localStorage.removeItem('lastGame');
            }
        }
    }

    async verifyGameMembership(){
        if(!this.currentGame) return;

        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }   

        try{
            const response = await fetch(`${this.website}/api/local/multiplayer/game/${this.currentGame.code}?player=${encodeURIComponent(this.playerName)}&verify=true`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if(response.ok){
                const data = await response.json();
                if(!data.isMember){
                    this.handleForcedLeave();
                }
            }
        } catch (error) {
            console.error('Failed to verify membership: ', error);
        }
    }

    handleForcedLeave(){
        alert('You have been removed from the game or the game has ended.');
        this.stopGamePolling();
        this.stopHeartbeat();
        this.stopChatPolling();
        this.currentGame = null;
        this.isHost = false;
        localStorage.removeItem('lastGame');
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval){
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async sendHeartbeat() {
        if(!this.currentGame) return;
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }   
        
        try{
            await fetch(`${this.website}/api/local/multiplayer/heartbeat`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                }, 
                body: JSON.stringify({
                    gameCode: this.currentGame.code,
                    playerName: this.playerName,
                    sessionId: this.sessionId
                })
            });
        } catch (error) {
            console.error('Heartbeat failed: ', error);
        }
    }

    displayGamesList(){
        const gamesList = document.getElementById('games-list');
        if(!this.availableGames || this.availableGames.length === 0){
            gamesList.innerHTML = '<div class="loading-message">No active games found. Host a game to get started!</div?';
            return;
        }

        gamesList.innerHTML = '';

        this.availableGames.forEach(game => {
            const gameElement = document.createElement('div');
            gameElement.className = 'game-item';
            gameElement.dataset.gameCode = game.code;

            gameElement.innerHTML = `
                <div class="game-info">
                    <h4>${game.name}</h4>
                    <p>Host: ${game.host}</p>
                </div>
                <div class="game-status">
                    <div class="player-count">${game.playerCount}/${game.maxPlayers}</div>
                    <span class="status-badge ${game.status}">${game.status}</span>
                </div>
            `;

            gameElement.addEventListener('click', () => this.joinGame(game.code));
            gamesList.appendChild(gameElement);
        });
    }

    selectGame(gameCode){
        this.selectedGame = gameCode;

        document.querySelectorAll('.game-item').forEach(item => {
            item.classList.remove('selected');
            if(item.dataset.gameCode === gameCode){
                item.classList.add('selected');
            }
        });

        document.getElementById("confirm-join-btn").disabled = false;

        const game = this.availableGames.find(g => g.code === gameCode);
        if(game){
            this.displayGameDetails(game);
        }
    }

    displayGameDetails(game){
        const detailsDiv = document.getElementById('join-game-details');
        detailsDiv.innerHTML = `'
            <h3>${game.name}</h3>
            <p><strong>Host:</strong> ${game.host}</p>
            <p><strong>Players:</strong> ${game.playerCount}/${game.maxPlayers}</p>
            <p><strong>Rounds:</strong> ${game.rounds}</p>
            <p><strong>Status:</strong> <span class="status-badge ${game.status}">${game.status}</span></p>
        `;
    }

    showMainMenu() {
        document.getElementById('host-screen').style.display = 'none';
        document.getElementById('game-lobby-screen').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'block';
        this.currentScreen = 'main-menu';
    }

    showHostScreen(){
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('host-screen').style.display = 'block';
        this.currentScreen = 'host';
    }

    showGameLobby(gameData){
        document.getElementById('host-screen').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'none';
        document.getElementById('game-lobby-screen').style.display = 'block';

        document.getElementById('lobby-game-name').textContent = gameData.name;
        document.getElementById('game-code').textContent = gameData.code;
        document.getElementById('game-host').textContent = gameData.host;
        document.getElementById('max-players-display').textContent = gameData.maxPlayers;

        document.getElementById('start-game-btn').style.display = this.isHost ? 'block' : 'none';

        this.updatePlayersList(gameData.players);
        this.startChatPolling(gameData.code);

        document.getElementById('chat-messages').innerHTML = '';
        this.addChatMessage('system', `Welcome to ${gameData.name}`);

        document.getElementById('ready-checkbox').checked = false;
        this.isReady = false;

        this.currentScreen = 'lobby';
    }

    updatePlayersList(players){
        const playersList = document.getElementById('players-list');
        const playerCount = document.getElementById('player-count');

        playerCount.textContent = players.length;

        playersList.innerHTML = '';

        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'player-name';
            nameSpan.textContent = player.name;

            if(player.name === this.currentGame.host){
                const hostBadge = document.createElement('span');
                hostBadge.className = 'player-host';
                hostBadge.textContent = 'HOST';
                nameSpan.appendChild(hostBadge);
            }

            const statusSpan = document.createElement('span');
            statusSpan.className = `player-status ${player.ready ? 'ready' : 'not-ready'}`;
            statusSpan.textContent = player.ready ? 'READY' : 'NOT READY';

            playerElement.appendChild(nameSpan);
            playerElement.appendChild(statusSpan);

            playersList.appendChild(playerElement);
        });

        this.checkAllReady();
    }

    updatePlayerReady(playerName, ready){
        const players = this.currentGame.players;
        const player = players.find(p => p.name === playerName);
        if(player){
            player.ready = ready;
            this.updatePlayersList(players);
        }
    }

    checkAllReady(){
        if(!this.currentGame || !this.isHost) return;

        const allReady = this.currentGame.players.every(p => p.ready);
        document.getElementById('start-game-btn').disabled = !allReady;
    }



    async joinGame(gameCode){
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        
        try{
            const response = await fetch(`${this.website}/api/local/multiplayer/join`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameCode: gameCode,
                    playerName: this.playerName,
                    sessionId: this.sessionId
                })
            });
            if(response.ok){
                const gameData = await response.json();
                this.currentGame = gameData;
                this.isHost = (gameData.host === this.playerName);

                localStorage.setItem('lastGame', JSON.stringify({
                    code: gameData.code,
                    name: gameData.name,
                    players: gameData.players
                }));
                this.showGameLobby(gameData);
                this.startGamePolling(gameCode);
            } else {
                const error = await response.json();
                alert(error.message || 'Failed to join game');
            }
        } catch(error) {
            console.error('Failed to join game: ', error);
            alert('Failed to join game');
        }
    }

    async createGame(){
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        
        const gameName = document.getElementById('game-name').value.trim() || `${this.playerName}'s Game`;

        const maxPlayers = parseInt(document.getElementById('max-players').value);
        this.maxRounds = document.getElementById('max-rounds').checked;
        const rounds = parseInt(document.getElementById('game-rounds').value);
        const hardMode = document.getElementById('host-hard-mode').checked;
        this.timeLimitCheck = document.getElementById('time-limit-checkbox').checked;
        const timeLimit = parseInt(document.getElementById('time-limit').value);

        console.log(`Max Players: ${maxPlayers}, Rounds: ${rounds}, Hard Mode: ${hardMode}, Time Limit: ${timeLimit}`);

        const filters = this.gatherFilters();

        try {
            const response = await fetch(`${this.website}/api/local/multiplayer/create`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: gameName,
                    maxPlayers: maxPlayers,
                    maxRounds: this.maxRounds,
                    rounds: rounds,
                    hardMode: hardMode,
                    timeLimitCheck: this.timeLimitCheck,
                    timeLimit: timeLimit,
                    filters: filters,
                    host: this.playerName
                })
            });
            if(response.ok){
                const gameData = await response.json();
                this.currentGame = gameData;
                this.isHost = true;

                localStorage.setItem('lastGame', JSON.stringify({
                    code: gameData.code,
                    name: gameData.name
                }));

                this.showGameLobby(gameData);
                this.startGamePolling(gameData.code);
            } else {
                const error = await response.json();
                alert(error.message || 'Failed to create game');
            }
        } catch (error) {
            console.error('Failed to create game: ', error);
            alert('Failed to create game');
        }
    }

    gatherFilters(){
        const filters = {
            tags: { include: [], exclude: [] },
            languages: { include: [], exclude: [] },
            decades: { include: [], exclude: [] },
            difficulties: { include: [], exclude: [] },
            genres: { include: [], exclude: [] },
            production_companies: { include: [], exclude: [] },
            networks: { include: [], exclude: [] },
            countries: { include: [], exclude: [] },
            special_openings: { include: [], exclude: [] }           
        }

        document.querySelectorAll('#host-filters .filter-checkbox:checked').forEach(checkbox => {
            const category = checkbox.dataset.category;
            const value = checkbox.value;

            if (category === 'special'){
                filters.special_openings.include = ['special'];
            } else {
                filters[category].include.push(value);
            }
        });

        return filters;
    }

    async toggleReady(ready){
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        if(!this.currentGame) return;
        
        try{
            await fetch(`${this.website}/api/local/multiplayer/ready`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameCode: this.currentGame.code,
                    playerName: this.playerName,
                    ready: ready
                })
            });
        } catch (error) {
            console.error('Fialed to set ready status: ', error);
        }
    }

    async fetchGameStatus(gameCode){
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        try{
            const response = await fetch(`${this.website}/api/local/multiplayer/game/${gameCode}`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });

            if(response.ok){
                const gameData = await response.json();
                this.updateGameLobby(gameData);

                if(gameData.status === 'starting' || gameData.status === 'in-progress'){
                    localStorage.setItem('multiplayerGame', JSON.stringify({
                        code: gameData.code,
                        rounds: gameData.rounds,
                        hardMode: gameData.hardMode,
                        timeLimit: gameData.timeLimit,
                        players: gameData.players.map(p => p.name),
                        host: gameData.host
                    }));   

                    localStorage.setItem('multiplayerGameCode', gameData.code);
                    window.location.href = `multiplayerGame.html?code=${gameData.code}`
                }
            }
        } catch (error) {
            console.error('Failed to fetch game status: ', error);
        }
    } 

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if(!message || !this.currentGame) return;

        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return;
        }
        try{      
            this.socket.emit('multiplayer_chat_send', {
                'token': this.token,
                'gameCode': this.gameCode,
                'playerName': this.playerName,
                'message': message
            })
            input.value = "";
        } catch (error) {
            console.error('Failed to send chat message: ', error);
            alert('Failed to send message');
        }
    }

    addChatMessage(sender, message, timestamp = null){
        const chatMessages = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';

        let timeString = '';
        if(timestamp){
            const date = new Date(timestamp * 1000);
            timeString = `<span class="chat-time">[${date.toLocaleTimeString()}]</span>`;
        }
        if(sender === 'system'){
            messageElement.classList.add('system');
            messageElement.innerHTML = message;
        } else {
            messageElement.innerHTML = `
                <span class="sender">${sender}:</span>
                <span class="text">${this.escapeHtml(message)}</span>
            `;
        }

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    escapeHtml(text){
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateGameLobby(gameData){
        this.currentGame = gameData;

        this.updatePlayersList(gameData.players);

        if(gameData.status === 'starting' || gameData.status === 'in-progress'){
            localStorage.setItem('multiplayerGame', JSON.stringify({
                code: gameData.code,
                rounds: gameData.rounds,
                hardMode: gameData.hardMode,
                timeLimit: gameData.timeLimit,
                players: gameData.players,
                host: gameData.host               
            }));

            localStorage.setItem('multiplayerGameCode', gameData.code);

            window.location.href = `multiplayerGame.html?code=${gameData.code}`
        }
    }

    async fetchChatMessages(gameCode){
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return;
        }
        try{
            const response = await fetch(`${this.website}/api/local/multiplayer/chat/messages?gameCode=${gameCode}&since=${this.lastChatTimestamp}`, {
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin
                }
            });
            if(response.ok){
                const data = await response.json();
                this.lastChatTimestamp = data.timestamp || Date.now() / 1000;
                data.messages.forEach(msg => {
                    this.addChatMessage(msg.player, msg.message);
                });
            }
        } catch (error) {
            console.error('Failed to fetch chat messages: ', error);
        }        
    }

    async leaveGame() {
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        if(!this.currentGame) return;
        
        try{
            await fetch(`${this.website}/api/local/multiplayer/leave`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameCode: this.currentGame.code,
                    playerName: this.playerName,
                    sessionId: this.sessionId
                })
            });

            this.cleanupGameSession();
        } catch (error) {
            console.error('Failed to leave game: ', error);
            this.cleanupGameSession();
        }
    }

    cleanupGameSession(){
        this.stopGamePolling();
        this.stopHeartbeat();
        this.stopChatPolling();
        this.currentGame = null;
        this.isHost = false;
        localStorage.removeItem('lastGame');
        this.showMainMenu();
    }

    startPolling(){
        this.pollInterval = setInterval(() => this.fetchGames(), 3000);
        this.fetchGames();
    }

    startChatPolling(gameCode){
        this.lastChatTimestamp = 0;
        this.chatPollInterval = setInterval(() => this.fetchChatMessages(gameCode), 1000);
    }

    stopChatPolling(){
        if(this.chatPollInterval){
            clearInterval(this.chatPollInterval);
            this.chatPollInterval = null;
        }
    }

    startGamePolling(gameCode){
        this.gamePollInterval = setInterval(() => this.fetchGameStatus(gameCode), 2000);
    }

    stopGamePolling(){
        if(this.gamePollInterval){
            clearInterval(this.gamePollInterval);
            this.gamePollInterval = null;
        }
    }

    async startGame(){
        if(!this.isHost) return;

        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return
        }

        try{
            const response = await fetch(`${this.website}/api/local/multiplayer/start`, {
                method: 'POST',
                headers: {
                    'X-Auth-Token': this.token,
                    'Referer': window.location.origin,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameCode: this.currentGame.code
                })
            });
            if(response.ok){
                const gameData = await response.json();

                localStorage.setItem('multiplayerGame', JSON.stringify({
                    code: this.currentGame.code,
                    rounds: gameData.rounds,
                    hardMode: gameData.hardMode,
                    timeLimit: gameData.timeLimit,
                    players: gameData.players,
                    host: this.currentGame.host
                }));

                localStorage.setItem('multiplayerGameCode', this.currentGame.code);

                this.showGameStarting();

                window.location.href = `multiplayerGame.html?code=${this.currentGame.code}`
            } else {
                const error = await response.json();
                alert(error.message || 'Failed to start game')
            }
        } catch (error) {
            console.error('Failed to start game: ', error);
        }
    }

    showGameStarting(){
        const startBtn = document.getElementById('start-game-btn');
        if(startBtn){
            startBtn.textContent = 'Starting...';
            startBtn.disabled = true;
        }

        this.addChatMessage('system', 'Game starting! Redirecting to game screen...');
    }

    async refreshToken(){
        try{
            const response = await fetch(`${this.website}/api/local/token`, {
                headers: {
                    'Referer': window.location.origin
                }
            });

            if (response.ok){
                const data = await response.json();
                this.token = data.token;
                this.tokenExpiry = Date.now() + (data.expires_in * 1000);
                return true;
            }
        } catch (error){
            console.log('Server not available');
            return false;
        }
    }

}

const lobby = new MultiplayerLobby();