import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

function Home({ userId }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    wordsRead: 342,
    sessionsCompleted: 12,
    readingStreak: 5,
    currentLevel: 'Intermediate'
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <motion.div
      className="home-container"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Welcome Header */}
      <motion.div className="welcome-section" variants={itemVariants}>
        <h1 className="welcome-title">Welcome Back!</h1>
        <p className="welcome-subtitle">Keep improving your reading skills</p>
      </motion.div>

      {/* Stats Grid */}
      <motion.div className="stats-grid" variants={itemVariants}>
        <div className="stat-card">
          <div className="stat-icon">📖</div>
          <div className="stat-value">{stats.wordsRead}</div>
          <div className="stat-label">Words Read</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{stats.sessionsCompleted}</div>
          <div className="stat-label">Sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-value">{stats.readingStreak}</div>
          <div className="stat-label">Day Streak</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-value">{stats.currentLevel}</div>
          <div className="stat-label">Your Level</div>
        </div>
      </motion.div>

      {/* Action Buttons */}
      <motion.div className="action-buttons" variants={itemVariants}>
        <motion.button
          onClick={() => navigate('/reading', { state: { userId } })}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="btn-primary btn-large"
        >
          <span className="btn-icon">📚</span>
          Start Reading
        </motion.button>
        <motion.button
          onClick={() => navigate('/report', { state: { userId } })}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="btn-secondary btn-large"
        >
          <span className="btn-icon">📊</span>
          View Stats
        </motion.button>
      </motion.div>

      {/* Quick Tips */}
      <motion.div className="tips-section" variants={itemVariants}>
        <h3 className="tips-title">💡 Quick Tips</h3>
        <ul className="tips-list">
          <li>Read for at least 15 minutes daily to maintain your streak</li>
          <li>Try different topics to expand your vocabulary</li>
          <li>Check your reports to track your progress over time</li>
        </ul>
      </motion.div>
    </motion.div>
  );
}

export default Home;
