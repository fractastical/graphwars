// GraphWarsFirebase.js
const firebaseConfig = {
  apiKey: "AIzaSyCvgdn8c6D8RusKRr4vHAzFj1x4FNxrXVE",
  authDomain: "infinite-games-9c69e.firebaseapp.com",
  projectId: "infinite-games-9c69e",
  storageBucket: "infinite-games-9c69e.appspot.com",
  messagingSenderId: "602022483888",
  appId: "1:602022483888:web:f967a6c1cb236ae66ba875",
  measurementId: "G-9LE6E1BKZ7"
};

const GAME_ID = "graph-wars";
let userId = null;
let userNickname = "Guest";
let isLoggedIn = false;

document.addEventListener('DOMContentLoaded', () => {
  firebase.initializeApp(firebaseConfig);
  setupDOMReferences();
  checkAuthState();
  setupAuthListeners();
  loadLeaderboard();
});

function setupDOMReferences() {
  if (!document.getElementById('loginContainer')) {
    createAuthUI();
  }
}

function createAuthUI() {
  const loginContainer = document.createElement('div');
  loginContainer.id = 'loginContainer';
  loginContainer.classList.add('top-right');
  loginContainer.innerHTML = `
    <button id="loginButton">Login / Sign Up</button>
  `;

  const userInfo = document.createElement('div');
  userInfo.id = 'userInfo';
  userInfo.classList.add('top-right', 'hidden');
  userInfo.innerHTML = `
    <span id="userNickname"></span>
    <button id="logoutButton">Logout</button>
  `;

  const loginModal = document.createElement('div');
  loginModal.id = 'loginModal';
  loginModal.classList.add('modal');
  loginModal.innerHTML = `
    <div class="modal-content">
      <h2>Login</h2>
      <form id="loginForm">
        <input type="email" id="email" placeholder="Email" required>
        <input type="password" id="password" placeholder="Password" required>
        <button type="submit">Login</button>
      </form>
      <div id="loginError" class="error-message"></div>
      <h2>Sign Up</h2>
      <form id="signupForm">
        <input type="text" id="signupNickname" placeholder="Nickname" required>
        <input type="email" id="signupEmail" placeholder="Email" required>
        <input type="password" id="signupPassword" placeholder="Password" required>
        <button type="submit">Sign Up</button>
      </form>
      <div id="signupError" class="error-message"></div>
      <button id="closeLoginModal">Close</button>
    </div>
  `;

  const leaderboardContainer = document.createElement('div');
  leaderboardContainer.id = 'leaderboard-container';
  leaderboardContainer.innerHTML = `
    <div id="leaderboard">
      <h2>Leaderboard</h2>
      <ol id="leaderboard-list"></ol>
    </div>
  `;

  document.body.appendChild(loginContainer);
  document.body.appendChild(userInfo);
  document.body.appendChild(loginModal);
  document.body.appendChild(leaderboardContainer);

  addStyles();
}

function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .top-right { position: absolute; top: 10px; right: 10px; z-index: 100; }
    .hidden { display: none; }
    .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); }
    .modal-content { background-color: #f4f4f4; margin: 15% auto; padding: 20px; border-radius: 5px; width: 300px; max-width: 80%; }
    .error-message { color: red; margin: 10px 0; }
    #leaderboard-container { position: fixed; right: 10px; top: 50px; background-color: rgba(0, 0, 0, 0.7); color: white; padding: 10px; border-radius: 5px; max-width: 250px; max-height: 400px; overflow-y: auto; }
    input { display: block; margin: 10px 0; padding: 8px; width: 100%; box-sizing: border-box; }
    button { padding: 8px 12px; margin: 5px 0; cursor: pointer; }
  `;
  document.head.appendChild(style);
}

function setupAuthListeners() {
  document.getElementById('loginButton')?.addEventListener('click', () => {
    document.getElementById('loginModal').style.display = 'block';
  });
  document.getElementById('closeLoginModal')?.addEventListener('click', () => {
    document.getElementById('loginModal').style.display = 'none';
  });
  document.getElementById('loginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    loginUser(document.getElementById('email').value, document.getElementById('password').value);
  });
  document.getElementById('signupForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    signupUser(
      document.getElementById('signupNickname').value,
      document.getElementById('signupEmail').value,
      document.getElementById('signupPassword').value
    );
  });
  document.getElementById('logoutButton')?.addEventListener('click', logoutUser);
}

function checkAuthState() {
  firebase.auth().onAuthStateChanged(user => {
    if (user) {
      userId = user.uid;
      loadUserData(userId);
      isLoggedIn = true;
      document.getElementById('loginContainer')?.classList.add('hidden');
      document.getElementById('userInfo')?.classList.remove('hidden');
    } else {
      userId = null;
      userNickname = "Guest";
      isLoggedIn = false;
      document.getElementById('loginContainer')?.classList.remove('hidden');
      document.getElementById('userInfo')?.classList.add('hidden');
    }
  });
}

async function loginUser(email, password) {
  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginForm').reset();
  } catch (error) {
    document.getElementById('loginError').textContent = error.message;
  }
}

async function signupUser(nickname, email, password) {
  try {
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    await saveInitialUserData(userCredential.user.uid, email, nickname);
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('signupForm').reset();
  } catch (error) {
    document.getElementById('signupError').textContent = error.message;
  }
}

async function saveInitialUserData(userId, email, nickname) {
  await firebase.firestore().collection('users').doc(userId).set({
    email,
    nickname,
    createdAt: new Date(),
    games: {
      [GAME_ID]: {
        bestScores: {},
        totalGames: 0,
        lastPlayed: new Date()
      }
    }
  });
}

async function loadUserData(userId) {
  const userDoc = await firebase.firestore().collection('users').doc(userId).get();
  if (userDoc.exists) {
    const userData = userDoc.data();
    userNickname = userData.nickname || "Player";
    document.getElementById('userNickname').textContent = userNickname;
  }
}

async function saveScore(difficulty, score) {
  if (!isLoggedIn || !userId) return;
  const timestamp = new Date();
  const scoreData = {
    userId,
    nickname: userNickname,
    gameId: GAME_ID,
    difficulty,
    score,
    timestamp
  };

  try {
    await firebase.firestore().collection('scores').add(scoreData);
    const userDoc = await firebase.firestore().collection('users').doc(userId).get();
    const userData = userDoc.data();
    const currentBest = userData.games[GAME_ID]?.bestScores[difficulty] || 0;
    if (score > currentBest) {
      await firebase.firestore().collection('users').doc(userId).update({
        [`games.${GAME_ID}.bestScores.${difficulty}`]: score,
        [`games.${GAME_ID}.totalGames`]: firebase.firestore.FieldValue.increment(1),
        [`games.${GAME_ID}.lastPlayed`]: timestamp
      });
    } else {
      await firebase.firestore().collection('users').doc(userId).update({
        [`games.${GAME_ID}.totalGames`]: firebase.firestore.FieldValue.increment(1),
        [`games.${GAME_ID}.lastPlayed`]: timestamp
      });
    }
    loadLeaderboard();
  } catch (error) {
    console.error('Error saving score:', error);
  }
}

async function loadLeaderboard(limit = 10) {
  try {
    const snapshot = await firebase.firestore()
      .collection('scores')
      .where("gameId", "==", GAME_ID)
      .orderBy('score', 'desc')
      .limit(limit)
      .get();
    const scores = snapshot.docs.map(doc => ({
      nickname: doc.data().nickname,
      score: doc.data().score,
      difficulty: doc.data().difficulty,
      isCurrentUser: doc.data().userId === userId
    }));
    displayLeaderboard(scores);
  } catch (error) {
    console.error('Error loading leaderboard:', error);
  }
}

function displayLeaderboard(scores) {
  const leaderboardList = document.getElementById('leaderboard-list');
  if (!leaderboardList) return;
  leaderboardList.innerHTML = scores.length === 0 ? '<li>No scores yet!</li>' : '';
  scores.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `${entry.nickname} - Level ${entry.difficulty}: ${entry.score}`;
    if (entry.isCurrentUser) {
      li.style.fontWeight = 'bold';
      li.style.color = '#FFD700';
    }
    leaderboardList.appendChild(li);
  });
}

window.GraphWarsFirebase = {
  saveScore,
  loadLeaderboard,
  isLoggedIn: () => isLoggedIn,
  getUserId: () => userId,
  getUserNickname: () => userNickname
};