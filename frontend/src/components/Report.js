import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { reportAPI } from '../api';

function Report({ userId }) {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      const response = await reportAPI.getUserReport(userId);
      setReport(response.data);
    } catch (error) {
      console.error('Error loading report:', error);
      alert('Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card-container">
        <div className="loading">Loading report...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="card-container">
        <div className="card-content">
          <h2>No data available yet</h2>
          <p>Complete some reading sessions to see your progress!</p>
          <button className="button-primary" onClick={() => navigate('/reading')}>
            Start Reading
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="card-container"
      style={{ maxWidth: '800px' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="card-content">
        <h1>📊 Progress Report</h1>
        <h2>{report.user.name}'s Reading Journey</h2>

        <div className="report-container">
          {/* Overall Stats */}
          <div className="report-section">
            <h3>Overall Statistics</h3>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-value">{report.total_sessions}</div>
                <div className="stat-label">Sessions Completed</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{report.total_questions_answered}</div>
                <div className="stat-label">Questions Answered</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{report.overall_accuracy.toFixed(0)}%</div>
                <div className="stat-label">Overall Accuracy</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{report.user.reading_level}</div>
                <div className="stat-label">Reading Level</div>
              </div>
            </div>
          </div>

          {/* Strengths */}
          <div className="report-section">
            <h3>💪 Strengths</h3>
            {report.strengths.map((strength, idx) => (
              <div key={idx} className="feedback correct" style={{ marginBottom: '10px' }}>
                {strength}
              </div>
            ))}
          </div>

          {/* Areas for Improvement */}
          {report.areas_for_improvement.length > 0 && (
            <div className="report-section">
              <h3>📈 Areas to Practice</h3>
              {report.areas_for_improvement.map((area, idx) => (
                <div key={idx} className="feedback incorrect" style={{ marginBottom: '10px' }}>
                  {area}
                </div>
              ))}
            </div>
          )}

          {/* Word Mastery */}
          {report.word_mastery.length > 0 && (
            <div className="report-section">
              <h3>📚 Words You're Learning</h3>
              <div className="word-list">
                {report.word_mastery.slice(0, 15).map((word, idx) => (
                  <div key={idx} className="word-chip">
                    {word.word} ({(word.familiarity_score * 100).toFixed(0)}%)
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Sessions */}
          {report.recent_sessions.length > 0 && (
            <div className="report-section">
              <h3>📖 Recent Stories</h3>
              {report.recent_sessions.map((session) => (
                <div key={session.session_id} style={{ marginBottom: '15px', padding: '15px', background: 'white', borderRadius: '8px' }}>
                  <h4>{session.story_title}</h4>
                  <p style={{ fontSize: '0.9rem', color: '#666' }}>
                    {session.correct_answers} / {session.total_questions} correct 
                    ({session.accuracy.toFixed(0)}%)
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#999' }}>
                    {new Date(session.started_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="button-primary" onClick={() => navigate('/reading')}>
          Continue Reading
        </button>
      </div>
    </motion.div>
  );
}

export default Report;
