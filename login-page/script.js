const form = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');

const DEMO_USER = 'admin';
const DEMO_PASS = 'password123';

form.addEventListener('submit', (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    errorMsg.textContent = 'Please enter both username and password.';
    errorMsg.hidden = false;
    return;
  }

  if (username === DEMO_USER && password === DEMO_PASS) {
    errorMsg.hidden = true;
    alert('Login successful! Welcome back, ' + username + '!');
    form.reset();
  } else {
    errorMsg.textContent = 'Invalid username or password. Try admin / password123.';
    errorMsg.hidden = false;
  }
});
