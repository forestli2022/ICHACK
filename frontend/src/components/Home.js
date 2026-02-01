import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { reportAPI, authAPI } from '../api';

function Home({ userId }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    wordsRead: 0,
    sessionsCompleted: 0,
    readingStreak: 0,
    currentLevel: 'Loading...'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [userId]);

  const loadStats = async () => {
    try {
      const [reportRes, userRes] = await Promise.all([
        reportAPI.getUserReport(userId),
        authAPI.getUser(userId),
      ]);

      const report = reportRes.data;
      const user = userRes.data;

      setStats({
        sessionsCompleted: report.total_sessions || 0,
        wordsRead: report.total_questions_answered || 0,
        readingStreak: calculateStreak(report.recent_sessions) || 0,
        currentLevel: user.reading_level || 'Beginner'
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      // Fall back to default stats on error
      setStats({
        wordsRead: 0,
        sessionsCompleted: 0,
        readingStreak: 0,
        currentLevel: 'Beginner'
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateStreak = (sessions) => {
    if (!sessions || sessions.length === 0) return 0;
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < sessions.length; i++) {
      const sessionDate = new Date(sessions[i].started_at);
      const expectedDate = new Date(today);
      expectedDate.setDate(today.getDate() - i);

      if (sessionDate.toDateString() === expectedDate.toDateString()) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

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
          <div className="stat-label">Questions Answered</div>
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
