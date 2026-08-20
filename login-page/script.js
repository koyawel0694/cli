const form = document.getElementById('loginForm');
const formMsg = document.getElementById('formMsg');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const usernameError = document.getElementById('usernameError');
const passwordError = document.getElementById('passwordError');
const togglePass = document.getElementById('togglePass');
const submitBtn = document.getElementById('submitBtn');
const btnLabel = submitBtn.querySelector('.btn-label');
const spinner = submitBtn.querySelector('.spinner');
const rememberMe = document.getElementById('rememberMe');

const DEMO_USER = 'admin';
const DEMO_PASS = 'password123';
const REMEMBER_KEY = 'hermesLoginRemember';

// Restore remembered username
const remembered = localStorage.getItem(REMEMBER_KEY);
if (remembered) {
  usernameInput.value = remembered;
  rememberMe.checked = true;
}

// Show / hide password toggle
togglePass.addEventListener('click', () => {
  const isHidden = passwordInput.type === 'password';
  passwordInput.type = isHidden ? 'text' : 'password';
  togglePass.classList.toggle('visible', isHidden);
  togglePass.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
});

// Clear field errors while typing
usernameInput.addEventListener('input', () => clearError(usernameInput, usernameError));
passwordInput.addEventListener('input', () => clearError(passwordInput, passwordError));

function showMessage(text, type = '') {
  formMsg.textContent = text;
  formMsg.className = 'message ' + type;
}

function setFieldError(input, errorEl, text) {
  errorEl.textContent = text;
  errorEl.hidden = false;
  input.classList.add('invalid');
}

function clearError(input, errorEl) {
  errorEl.hidden = true;
  input.classList.remove('invalid');
}

function setLoading(loading) {
  btnLabel.textContent = loading ? 'Signing in...' : 'Sign In';
  spinner.hidden = !loading;
  submitBtn.disabled = loading;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  formMsg.className = 'message';

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  let valid = true;
  if (!username) {
    setFieldError(usernameInput, usernameError, 'Username is required.');
    valid = false;
  } else {
    clearError(usernameInput, usernameError);
  }

  if (!password) {
    setFieldError(passwordInput, passwordError, 'Password is required.');
    valid = false;
  } else {
    clearError(passwordInput, passwordError);
  }

  if (!valid) return;

  setLoading(true);

  // Simulated request delay
  setTimeout(() => {
    if (username === DEMO_USER && password === DEMO_PASS) {
      const shouldRemember = rememberMe.checked;
      if (shouldRemember) {
        localStorage.setItem(REMEMBER_KEY, username);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      showMessage('Login successful! Welcome back, ' + username + '.', 'success');
      form.reset();
      if (shouldRemember) rememberMe.checked = true;
      setLoading(false);
    } else {
      showMessage('Invalid username or password. Try admin / password123.', 'error');
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 500);
      setLoading(false);
    }
  }, 600);
});
