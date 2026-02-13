class MusicQuizGame {
  constructor() {
    this.players = [];
    this.currentPlayerIndex = 0;
    self.currentRound = 1;
    this.maxRounds = 4;
    this.seelctedPlaylist = 'family';
    self.currentSong = null;
    self.replaysLeft = 1;

    self.spotifyPlayer = null;
    self.deviceId = null;
    self.token = null;

    self.recognition = null;

    this.init()
  }

  init() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    self.token = params.get('access_token');

    if (self.token) {
      this.initSpotifyPlayer();
      document.getElementById('connection-status').innerHTML = "Connected to Spotify";
      document.getElementById('connection-status').classList.add('connected');
    }

    this.setupEventListeners();

    this.initVoiceRecognition();
  }

  initVoiceRecognition() {
    if('webkitSpeechRecognition' in window) {
      self.recognition = new webkitSpeechRecognition();
      self.recognition.continuous = false;
      self.recognition.interimResults = false;
      self.recognition.lang = 'en-US';

      self.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('voice-status').textContent = 'Heard: "' + transcript + '"';
        this.processVoiceGuess(transcript);
      };

      self.recognition.onstart = () => {
        document.getElementById('voice-status').classList.add('listening');
        document.getElementById('voice-status').textContent = 'Listening...";
      };

      self.recognition.onend = () => {
        document.getElementById('voice-status').classList.remove('listening');
      }      
    }
  }

  setupEventListeners() {
    document.getElementById('login-spotify').addEventListener('click', () => {
      const clientId = '73cebf4091ea4699bb90518b005d610b';
      const redirectUri = 'https://bluethsprojectsite.fun/callback.html';
      const scope = 'streaming';

      window.location.href = 'https://accoutns.spotify.com/authorize?' + 
        'client_id=' + clientId + '&response_type=token' + '&redirect_uri=' + encodeURIComponent(redirectUri) + 
        '&scope=' + encodeURIComponent(scope);
    });

    document.getElementById('start-game').addEventListener('click', () => {
      if (!self.token) {
        alert('Please connect Spotify first!');
        return;
      }
      this.showScreen('player-screen');
    });

    document.querySelectorAll('.player-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.player-btn').forEach(b => b.classList.remove('selected'));
        e.target.classList.add('selected');
        const numPlayers = parseInt(e.target.dataset.players);
        this.createPlayerInputs(numPlayers);
        document.getElementById('confirm-players').disabled = false;
      });
    });

    document.getElementById('confirm-players').addEventListener('click', () => {
      this.players = [];
      for (let i = 1; i <= document.querySelectorAll('.player-name-input').length; i++) {
        const nameInput = document.getElementById('player' + i);
        this.players.push({
          name: nameInput.value || 'Player ' + i,
          score: 0
        });
      }
      this.showScreen('playlist-screen');
    });

    document.querySelectorAll('.playlist-card').forEach(card => {
      card.addEventListener('click', (e) => {
        document.querySelectorAll('.playlist-card').forEach(c => c.classList.remove('selected'));
        e.currentTarget.classList.add('selected');
        self.selectedPlaylist = e.currentTarget.dataset.playlist;
        document.getElementById('start-round').disabled = false;
      });
    });

    document.getElementById('start-round').addEventListener('click', () => {
      this.startNewRound();
      this.showScreen('game-screen');
    });

    document.getElementById('play-snippet').addEventListener('click', () => {
      this.playCurrentSong();
    });

    document.getElementById('replay-snippet').addEventListener('click', () => {
      if (self.replaysLeft > 0) {
        this.playCurrentSong();
        self.replaysLeft--;
        document.getElementById('replay-count').textContent = self.replaysLeft + ' replay(s) remaining';
        if (self.replaysLeft === 0) {
          document.getElementById('replay-snippet').disabled = true;
        }
      }
    });

    document.getElementById('voice-input').addEventListener('click', () => {
      if (self.recognition) {
        self.recognition.start();
      }  else {
        alert('Voice recognition not supported in this browser. Try Chrome.');
      }
    });

    document.getElementById('submit-guess').addEventListener('click', () => {
      const titleGuess = document.getElementById('title-guess').value;
      const artistGuess = document.getElementById('artist-guess').value;
      this.processTextGuess(titleGuess, artistGuess);
    });
    
  }

  initSpotifyPlayer() {
    window.onSpotifyWebPlaybackSDKReady = () => {
      self.spotifyPlayer = new Spotify.Player({
        name: 'Family Music Game',
        getOAuthToken: cb => { cb(self.token); },
        volume: 0.7
      });

      self.spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('Spotify Player Ready: ', device_id);
        self.deviceId = device_id;
        document.getElementById('connection-status').innerHTML = 'Spotify ready to play!';
      });

      self.spotifyPlayer.connect();
    };
  }

  playCurrentSong() {
    if (!self.currentSong || !self.deviceId || !self.token) return;

    fetch('https://api.spotify.com/v1/me/player/play?device_id=' + self.deviceId, {
      method: 'PUT',
      body: JSON.stringify({
        uris: [self.currentSong.uri],
        position_ms: self.currentSong.startTime * 1000
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + self.token
      }
    });

    setTimeout(() => {
      fetch('https://api.spotify.com/v1/me/player/pause', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + self.token }
      });
    }, 10000);
  }

  startNewRound() {
    self.replaysLeft = 1;
    document.getElementById('replay-snippet').disabled = false;
    document.getElementById('replay-count').textContent = '1 replay remaining';

    document.getElementById('title-guess').value = '';
    document.getElementById('artist-guess').value = '';
    document.getElementById('result-message').innerHTML = '';

    document.getElementById('round-number').textContent = self.currentRound;

    let difficulty;
    switch(self.currentRound) {
      case 1: difficulty = 'easy'; break;
      case 2: difficulty = 'medium'; break;
      case 3: difficulty = 'hard'; break;
      case 4: difficulty = 'expert'; break;
    }

    document.getElementById('difficulty').textContent = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

    const songs = songDatabase[difficulty];
    self.currentSong = songs[Math.floor(Math.random() * songs.length)];

    document.getElementById('current-player').innerHTML = `${self.players[self.currentPlayerIndex].name}'s turn`;
  }

  processTextGuess(title, artist) {
    if(!self.currentSong) return;

    let points = 0;
    let message = '';

    const titleCorrect = title.toLowerCase().includes(self.currentSong.title.toLowerCase()) || self.currentSong.title.toLowerCase().includes(title.toLowerCase());
    const artistCorrect = artist.toLowerCase().includes(self.currentSong.artist.toLowerCase()) || self.currentSong.artist.toLowerCase().includes(artist.toLowerCase());

    if (titleCorrect && artistCorrect) {
      points = 20;
      message = 'Perfect! +20 Points'
    } else if (titleCorrect || artistCorrect) {
      points = 10;
      message = 'Good! +10 Points (' + (titleCorrect ? 'Song' : 'Artist') + ' correct';
    }
    else {
      points = 0;
      message = 'Not this time. It was ' + self.currentSong.title + ' by ' + self.currentSong.artist;
    }

    this.players[self.currentPlayerIndex].score += points

    document.getElementById('result-message').innerHTML = message;

    setTimeout(() => this.nextTurn(), 3000);
  }

  processVoiceGuess(transcript) {
    const titleMatch = transcript.toLowerCase().includes(self.currentSong.title.toLowerCase());
    const artistMatch = transcript.toLowerCase().includes(self.currentSong.artist.toLowerCase());

    this.processTextGuess(
      titleMatch ? self.currentSong.title : '';
      artistMatch ? self.currentSong.artist : '';
    );
  }

  nextTurn() {
    self.currentPlayerIndex++;

    if(self.currentPlayerIndex >= this.players.length) {
      self.currentPlayerIndex = 0;
      self.currentRound++;

      if (self.currentRound >  this.maxRounds) {
        this.endGame();
        return;
      }
    }

    this.startNewRound();
  }

  endGame() {
    const sorted = [...this.players].sort((a,b) => b.score - a.score);

    const scoresHtml = sorted.map((p, i) => `
      <div class="score-row">
        <span>${i+1}. ${p.name}</span>
        <span>${p.score} points</span>
      </div>
    `).join('');

    document.getElementById('final-scores').innerHTML = scoresHtml;

    document.getElementById('winner-announcement').innerHTML = `Winner: ${sorted[0].name} with ${sorted[0].score} points!`;
    this.showScreen('scoreboard-screen');
  }

  createPlayerInputs(numPlayers) {
    const container = document.getElementById('player-names');
    container.innerHTML = '';

    for(let i = 1; i <= numPlayers; i++) {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'player' + i;
      input.className = 'player-name-input';
      input.placeholder = 'Player ' + i + ' name';
      container.appendChild(input);
    }
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.game = new MusicQuizGame();
  document.querySelectorAll('.screen').forEach(screen => {
    screen.classList.remove('active');
  });
  document.getElementById('landing-screen').classList.add('active');
});
