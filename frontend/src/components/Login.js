import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { authAPI } from '../api';

function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await authAPI.login(email, password);
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('userId', response.data.user_id);
      onLoginSuccess(response.data.user_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await authAPI.signup(email, password);
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('userId', response.data.user_id);
      onLoginSuccess(response.data.user_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="card-container"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="card-content">
        <h1>📚 Reading Academy</h1>
        <p>Learn to read with fun stories and quizzes!</p>

        <form onSubmit={mode === 'login' ? handleLogin : handleSignup}>
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="input-group">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
              />
            </div>
          )}

          {error && (
            <div className="feedback incorrect">
              {error}
            </div>
          )}

          <button type="submit" className="button-primary" disabled={loading}>
            {loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Create Account')}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          {mode === 'login' ? (
            <>
              <p style={{ color: '#666', marginBottom: '10px' }}>Don't have an account?</p>
              <button 
                className="button-secondary" 
                onClick={() => { setMode('signup'); setError(''); }}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              <p style={{ color: '#666', marginBottom: '10px' }}>Already have an account?</p>
              <button 
                className="button-secondary" 
                onClick={() => { setMode('login'); setError(''); }}
              >
                Login
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default Login;
