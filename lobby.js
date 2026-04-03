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
        this.socket = io(this.website, {
            path: '/socket.io/',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 30000,
        });
        this.gameCode = null;

        this.setupSocketListeners();

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

        this.recoverSession();

        window.addEventListener('beforeunload', () => this.handlePageUnload());
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
        document.getElementById('big-filter-header').addEventListener('click', () => this.toggleFilters());
        document.querySelectorAll('.filter-header').forEach(id => {
            id.addEventListener('click', function() {
                const header = this;
                this.toggleSection(header);
            })
        });
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


    }

    setupSocketListeners(){
        this.socket.on('connect', () => {
            console.log('Socket connected with ID: ', this.socket.id);

            if(this.gameCode && this.playerName && this.token){
                this.joinGameRoom();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket connection error: ', error);
        });

        this.socket.on('disconnect', (reason) => {
            console.log("Socket disconnected: ", reason);
        });

        this.socket.on('error', (data) => {
            console.error('Socket error: ', data);
            alert(data.message || "Socket connection error.");
        });


        this.socket.on('new_chat_message', (data) => {
            console.log('New chat message sent');
            this.addChatMessage(data.player, data.message, data.timestamp);
        });

        this.socket.on('player_joined', (data) => {
            this.updatePlayersList(data.players);
            this.addChatMessage('system', `${data.playerName} joined the game`);
        });

        this.socket.on('player_left', (data) => {
            this.updatePlayersList(data.players);
            if(data.newHost){
                this.isHost = (this.playerName === data.newHost);
                document.getElementById('start-game-btn').style.display = this.isHost ? 'block' : 'none';
                this.addChatMessage('system', `${data.playerName} left. New host: ${data.newHost}`);
            } else {
                this.addChatMessage('system', `${data.playerName} left the game`);
            }
        });

        this.socket.on('player_ready_update', (data) => {
            console.log('playerReadyUpdate')
            this.updatePlayersList(data.players);
            this.checkAllReady();
        });

        this.socket.on('all_players_ready', (data) => {
            if(this.isHost){
                this.addChatMessage('system', 'All players ready! You can start the game now!');
                document.getElementById('start-game-btn').disabled = false;
            }
        });

        this.socket.on('game_starting', (data) => {
            localStorage.setItem('multiplayerGame', JSON.stringify({
                code: this.gameCode,
                rounds: data.rounds,
                hardMode: data.hardMode,
                timeLimit: data.timeLimit,
                players: data.players,
                host: data.host
            }));

            localStorage.setItem('multiplayerGameCode', this.currentGame.code);
            this.showGameStarting();
            window.location.href = `multiplayerGame.html?code=${this.currentGame.code}`;
        });

        this.socket.on('update_active_games', (data) => {
            this.availableGames = data.available_games;
            this.displayGamesList();
        });

    }
    
    joinGameRoom(){
        if(this.socket && this.socket.connected && this.gameCode && this.playerName && this.token){
            console.log("Joining game room: ", this.gameCode, "sessionId: ", this.sessionId);
            this.socket.emit('join_game_room', {
                token: this.token,
                gameCode: this.gameCode,
                playerName: this.playerName,
                sessionId: this.sessionId
            });
        }
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
        return sessionId;
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
                this.populateFilters('filter-options');
            }
        } catch (error) {
            console.error('Failed to load filters: ', error);
        }
    }

    populateFilters(containerId){
        const filterSelections = ['tags-list', 'languages-list', 'decades-list', 'difficulties-list', 'genres-list', 'production-companies-list', 'networks-list', 'countries-list'];
        const container = document.getElementById(containerId);
        if (!container || !this.filterMetadata) return;

        filterSelections.forEach(id => {
            document.getElementById(id).innerHTML = '';
        })

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

        categories.forEach(key => {
            if(!container || !containerId[key]) return;

            containerId[key].forEach(item => {
                const div = document.createElement('div');
                div.className = 'tristate-item';

                const value = item.trim().toLowerCase();

                div.innerHTML = `
                    <label class="tristate-container">
                        <input type="checkbox" class="tristate-checkbox" value="${value}" data-tristate="null">
                        <span class="tristate-label">${item}</span>
                        <span class="tristate-state>(null)</span>
                    </label>
                `;

                container.appendChild(div);

                const checkbox = div.querySelector('.tristate-checkbox');
                const stateSpan = div.querySelector('.tristate-state');

                checkbox.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.cycleTristate(checkbox);

                    const state = checkbox.dataset.tristate || 'null';

                    if(state === 'include'){
                        stateSpan.textContent = '(include)';
                    } else if (state === 'exclude'){
                        stateSpan.textContent = '(exclude)';
                    } else {
                        stateSpan.textContent = '(null)';
                    }
                });
            });
        });

        const specialCheckbox = document.getElementById('special-checkbox');

        if(specialCheckbox){
            specialCheckbox.dataset.tristate = 'null';
            specialCheckbox.addEventListener('click', (e) => {
                e.preventDefault();
                this.cycleTristate(specialCheckbox);

                const specialCheckboxState = document.getElementById('special-checkbox-state');

                const state = specialCheckbox.dataset.tristate || 'null';

                if (state === 'include'){
                    specialCheckboxState.textContent = '(include)';
                } else if (state === 'exclude'){
                    specialCheckboxState.textContent = '(exclude)';
                } else {
                    specialCheckboxState.textContent = '(null)';
                }
            });
        }
    }

    cycleTristate(checkbox){
        const currentState = checkbox.dataset.tristate || 'null';
        let newState;

        switch(currentState){
            case 'null':
                newState = 'include';
                break;
            case 'include':
                newState = 'exclude';
                break;
            case 'exclude':
                newState = 'null';
                break;
            default:
                newState = 'include';
        }

        this.setTristateState(checkbox, newState);
    }

    setTristateState(checkbox, state){
        checkbox.dataset.tristate = state;
        checkbox.classList.remove('indeterminate');
        checkbox.checked = false;

        if (state === 'include'){
            checkbox.classList.add('checked');
        } else if (state === 'exclude'){
            checkbox.classList.remove('checked');
            checkbox.classList.add('indeterminate');
        } else {
            checkbox.classList.remove('indeterminate');
        }
    }

    toggleFilters() {
        const content = document.getElementById('filter-options');
        const arrow = document.querySelector('.advanced-filter-header .arrow');

        if(content.style.display === 'none' || !content.style.display){
            console.log("content showing")
            content.style.display = 'block';
            arrow.textContent = '▲';
        } else {
            content.style.display = 'none';
            arrow.textContent = '▼';
        }
    }

    toggleSection(header){
        const content = header.nextElementSibling;
        content.classList.toggle('active');
        const arrow = header.querySelector('.arrow');
        arrow.textContent = content.classList.contains('active') ? '▲' : '▼';
    }


    collectFilterSelections(){
        const selections = {
            tags: {include: [], exclude: []},
            languages: { include: [], exclude: [] },
            decades: { include: [], exclude: [] },
            difficulties: { include: [], exclude: [] },
            genres: { include: [], exclude: [] },
            production_companies: { include: [], exclude: [] },
            networks: { include: [], exclude: [] },
            countries: { include: [], exclude: [] },
            special_openings: {include: [], exclude: []},            
        }

        const listIds = ['tags-list', 'languages-list', 'decades-list', 'difficulties-list', 'genres-list', 'production-companies-list', 'networks-list', 'countries-list'];

        listIds.forEach(listId => {
            const section = listId.split('-')[0];
            let target;

            if(section === 'production') target = 'production_companies';
            else target = section;

            const list = document.getElementById(listId);
            if(!list) return;

            list.querySelectorAll('.tristate-checkbox').forEach(checkbox => {
                const value = checkbox.value;
                const state = checkbox.dataset.tristate || 'null';

                if(state === 'include'){
                    selections[target].include.push(value);
                } else if (state === 'exclude'){
                    selections[target].exclude.push(value);
                }
            });
        });

        const special_openings = document.getElementById('special-checkbox');
        if(!special_openings) return;
        const value = special_openings.value;
        const state = special_openings.dataset.tristate || 'null';

        if(state === 'include'){
            selections['special_openings'].include.push(value);
        } else if (state === 'exclude'){
            selections['special_openings'].exclude.push(value);
        }

        return selections
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
                        this.gameCode = game.code;
                        this.showGameLobby(gameData);
                        this.startHeartbeat();
                        this.joinGameRoom();
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
        this.stopHeartbeat();
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

        document.getElementById('chat-messages').innerHTML = '';
        this.addChatMessage('system', `Welcome to ${gameData.name}`);

        document.getElementById('ready-checkbox').checked = false;
        this.isReady = false;

        this.currentScreen = 'lobby';
    }

    updatePlayersList(players){
        console.log('Running UpdatePlayersList')
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
        if (this.playerName === undefined || this.playerName === ''){
            alert('Must set username first.');
            return;
        }

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
                this.gameCode = gameData.code;

                localStorage.setItem('lastGame', JSON.stringify({
                    code: gameData.code,
                    name: gameData.name,
                    players: gameData.players
                }));
                this.showGameLobby(gameData);
                this.joinGameRoom();
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

        const filters = this.collectFilterSelections();

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
                console.log('GameData.code: ', gameData.code);
                this.gameCode = gameData.code;
                console.log('this.gameCode: ', this.gameCode)
                localStorage.setItem('lastGame', JSON.stringify({
                    code: gameData.code,
                    name: gameData.name
                }));

                this.showGameLobby(gameData);

                this.joinGameRoom();
            } else {
                const error = await response.json();
                alert(error.message || 'Failed to create game');
            }
        } catch (error) {
            console.error('Failed to create game: ', error);
            alert('Failed to create game');
        }
    }

    async toggleReady(ready){
        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if (!this.token) return [];
        }
        if(!this.currentGame) return;
        
        this.socket.emit('player_ready', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName,
            ready: ready
        });
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
        
        this.socket.emit('leave_game', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName,
            sessionId: this.sessionId
        });

        this.cleanupGameSession();
    }

    cleanupGameSession(){
        this.stopHeartbeat();
        this.currentGame = null;
        this.isHost = false;
        localStorage.removeItem('lastGame');
        this.showMainMenu();
    }

    async startGame(){
        if(!this.isHost) return;

        if(!this.token || Date.now() > this.tokenExpiry){
            await this.refreshToken();
            if(!this.token) return
        }

        this.socket.emit('start_game', {
            token: this.token,
            gameCode: this.gameCode,
            playerName: this.playerName
        });

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