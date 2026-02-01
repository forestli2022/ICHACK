import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import ProfileSetup from './components/ProfileSetup';
import Home from './components/Home';
import ReadingSession from './components/ReadingSession';
import Report from './components/Report';

function App() {
  const [userId, setUserId] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [profileComplete, setProfileComplete] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const storedUserId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');
    const profileCompleteFlag = localStorage.getItem('profileComplete');
    
    if (storedUserId && token) {
      setUserId(parseInt(storedUserId));
      setProfileComplete(profileCompleteFlag === 'true');
    }
    setLoading(false);
  }, []);

  const handleLoginSuccess = (newUserId) => {
    setUserId(newUserId);
    setProfileComplete(false); // Need to complete profile setup
    localStorage.setItem('profileComplete', 'false');
  };

  const handleProfileComplete = () => {
    setProfileComplete(true);
    localStorage.setItem('profileComplete', 'true');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    setUserId(null);
    setProfileComplete(false);
  };

  if (loading) {
    return (
      <div className="app-container">
        <div className="card-container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="app-container">
        <Routes>
          {/* Login/Signup Route */}
          <Route 
            path="/" 
            element={
              !userId ? (
                <Login onLoginSuccess={handleLoginSuccess} />
              ) : profileComplete ? (
                <Navigate to="/home" />
              ) : (
                <Navigate to="/profile" />
              )
            } 
          />

          {/* Profile Setup Route */}
          <Route 
            path="/profile" 
            element={
              userId && !profileComplete ? (
                <ProfileSetup userId={userId} onComplete={handleProfileComplete} />
              ) : <Navigate to="/" />
            } 
          />

          {/* Home Route */}
          <Route 
            path="/home" 
            element={
              userId && profileComplete ? (
                <Home userId={userId} />
              ) : <Navigate to="/" />
            } 
          />

          {/* Reading Session Route */}
          <Route 
            path="/reading" 
            element={
              userId && profileComplete ? (
                <ReadingSession 
                  userId={userId} 
                  sessionId={currentSessionId}
                  setSessionId={setCurrentSessionId}
                />
              ) : <Navigate to="/" />
            } 
          />

          {/* Report Route */}
          <Route 
            path="/report" 
            element={
              userId && profileComplete ? (
                <Report userId={userId} />
              ) : <Navigate to="/" />
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
