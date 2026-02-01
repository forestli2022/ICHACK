import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { authAPI } from '../api';

function Assessment({ userId }) {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    try {
      const response = await authAPI.getAssessmentQuestions();
      setQuestions(response.data);
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Failed to load questions');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (!selectedAnswer) {
      alert('Please select an answer!');
      return;
    }

    const newAnswers = [
      ...answers,
      {
        question_number: currentIndex + 1,
        user_answer: selectedAnswer,
      },
    ];
    setAnswers(newAnswers);
    setSelectedAnswer('');

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      submitAssessment(newAnswers);
    }
  };

  const submitAssessment = async (allAnswers) => {
    setLoading(true);
    try {
      const response = await authAPI.submitAssessment(userId, allAnswers);
      setResult(response.data);
      setTimeout(() => {
        navigate('/reading');
      }, 3000);
    } catch (error) {
      console.error('Error submitting assessment:', error);
      alert('Failed to submit assessment');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (result) {
    return (
      <motion.div
        className="card-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="card-content">
          <h2>🎉 Great Job!</h2>
          <p>Your reading level: <strong>{result.reading_level}</strong></p>
          <p>Score: {(result.score * 100).toFixed(0)}%</p>
          <div className="feedback correct">
            <p>Starting your reading adventure...</p>
          </div>
        </div>
      </motion.div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  return (
    <motion.div
      className="card-container"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.3 }}
    >
      <div className="card-content">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <h2>Question {currentIndex + 1} of {questions.length}</h2>
        
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <p style={{ fontSize: '1.3rem', marginBottom: '30px' }}>
              {currentQuestion.question_text}
            </p>

            <div className="options-grid">
              {currentQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  className={`option-button ${selectedAnswer === option ? 'selected' : ''}`}
                  onClick={() => setSelectedAnswer(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        <button
          className="button-primary"
          onClick={handleNext}
          disabled={!selectedAnswer}
        >
          {currentIndex < questions.length - 1 ? 'Next →' : 'Finish'}
        </button>
      </div>
    </motion.div>
  );
}

export default Assessment;
