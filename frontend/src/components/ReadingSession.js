import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { storyAPI, quizAPI } from '../api';

function ReadingSession({ userId, sessionId, setSessionId }) {
  const navigate = useNavigate();
  const [stage, setStage] = useState('loading'); // loading, story, quiz, feedback, complete
  const [story, setStory] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      generateNewStory();
    } else {
      loadStory();
    }
  }, []);

  const generateNewStory = async () => {
    setStage('loading');
    try {
      const response = await storyAPI.generateStory(userId);
      setSessionId(response.data.session_id);
      setStory(response.data);
      setStage('story');
    } catch (error) {
      console.error('Error generating story:', error);
      alert('Failed to generate story. Please try again.');
    }
  };

  const loadStory = async () => {
    try {
      const response = await storyAPI.getStory(sessionId);
      setStory(response.data);
      setStage('story');
    } catch (error) {
      console.error('Error loading story:', error);
      generateNewStory();
    }
  };

  const startQuiz = async () => {
    setStage('loading');
    try {
      const response = await quizAPI.generateQuizzes(sessionId || story.session_id);
      setQuizzes(response.data.questions);
      setCurrentQuizIndex(0);
      setStage('quiz');
      setStartTime(Date.now());
    } catch (error) {
      console.error('Error generating quizzes:', error);
      alert('Failed to generate quizzes');
      setStage('story');
    }
  };

  const submitAnswer = async () => {
    if (!selectedAnswer) {
      alert('Please select an answer!');
      return;
    }

    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    
    try {
      const response = await quizAPI.submitAnswer(sessionId || story.session_id, {
        quiz_id: quizzes[currentQuizIndex].id,
        user_answer: selectedAnswer,
        time_taken_seconds: timeTaken,
      });

      setFeedback(response.data);
      
      if (response.data.is_correct) {
        setScore(prev => ({ ...prev, correct: prev.correct + 1, total: prev.total + 1 }));
      } else {
        setScore(prev => ({ ...prev, total: prev.total + 1 }));
      }

      setStage('feedback');
    } catch (error) {
      console.error('Error submitting answer:', error);
      alert('Failed to submit answer');
    }
  };

  const nextQuestion = () => {
    setSelectedAnswer('');
    setFeedback(null);
    setStartTime(Date.now());

    if (currentQuizIndex < quizzes.length - 1) {
      setCurrentQuizIndex(currentQuizIndex + 1);
      setStage('quiz');
    } else {
      completeSession();
    }
  };

  const completeSession = async () => {
    try {
      await quizAPI.completeSession(sessionId || story.session_id);
      setStage('complete');
    } catch (error) {
      console.error('Error completing session:', error);
      setStage('complete');
    }
  };

  const startNewSession = () => {
    setSessionId(null);
    setStory(null);
    setQuizzes([]);
    setCurrentQuizIndex(0);
    setScore({ correct: 0, total: 0 });
    generateNewStory();
  };

  if (stage === 'loading') {
    return (
      <div className="card-container">
        <div className="loading">
          <h2>✨ Creating something special for you...</h2>
        </div>
      </div>
    );
  }

  if (stage === 'story') {
    return (
      <motion.div
        className="card-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="card-content">
          <h2>{story.title}</h2>
          <div className="story-content">
            {story.content}
          </div>
          <button className="button-primary" onClick={startQuiz}>
            Start Quiz →
          </button>
        </div>
      </motion.div>
    );
  }

  if (stage === 'quiz' || stage === 'feedback') {
    const currentQuiz = quizzes[currentQuizIndex];
    const progress = ((currentQuizIndex + 1) / quizzes.length) * 100;

    return (
      <motion.div
        className="card-container"
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="card-content">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <h2>Question {currentQuizIndex + 1} of {quizzes.length}</h2>
          
          <p style={{ fontSize: '1.3rem', marginBottom: '20px' }}>
            {currentQuiz.question_text}
          </p>

          {currentQuiz.options && (
            <div className="options-grid">
              {currentQuiz.options.map((option, idx) => (
                <button
                  key={idx}
                  className={`option-button ${selectedAnswer === option ? 'selected' : ''}`}
                  onClick={() => stage === 'quiz' && setSelectedAnswer(option)}
                  disabled={stage === 'feedback'}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          {!currentQuiz.options && stage === 'quiz' && (
            <div className="input-group">
              <input
                type="text"
                value={selectedAnswer}
                onChange={(e) => setSelectedAnswer(e.target.value)}
                placeholder="Type your answer"
                autoFocus
              />
            </div>
          )}

          {stage === 'feedback' && feedback && (
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`feedback ${feedback.is_correct ? 'correct' : 'incorrect'}`}
              >
                <p>
                  {feedback.is_correct ? '✅ Correct!' : '❌ Not quite right'}
                </p>
                {!feedback.is_correct && (
                  <p>The correct answer is: {feedback.correct_answer}</p>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {stage === 'quiz' && (
            <button className="button-primary" onClick={submitAnswer}>
              Submit Answer
            </button>
          )}

          {stage === 'feedback' && (
            <button className="button-primary" onClick={nextQuestion}>
              {currentQuizIndex < quizzes.length - 1 ? 'Next Question →' : 'Finish'}
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  if (stage === 'complete') {
    const accuracy = score.total > 0 ? (score.correct / score.total * 100).toFixed(0) : 0;

    return (
      <motion.div
        className="card-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="card-content">
          <h1>🎉 Session Complete!</h1>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{score.correct}</div>
              <div className="stat-label">Correct</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{score.total}</div>
              <div className="stat-label">Total</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{accuracy}%</div>
              <div className="stat-label">Accuracy</div>
            </div>
          </div>

          <button className="button-primary" onClick={startNewSession}>
            Read Another Story
          </button>
          <button className="button-secondary" onClick={() => navigate('/report')}>
            View Progress Report
          </button>
        </div>
      </motion.div>
    );
  }

  return null;
}

export default ReadingSession;
