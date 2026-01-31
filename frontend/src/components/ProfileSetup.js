import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { authAPI } from '../api';

function ProfileSetup({ userId, onComplete }) {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    loadQuestion(1);
  }, []);

  const loadQuestion = async (step) => {
    setLoading(true);
    try {
      const response = await authAPI.getProfileQuestion(userId, step);
      setQuestion(response.data);
      setAnswer('');
      setSelectedInterests([]);
    } catch (error) {
      console.error('Error loading question:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleInterest = (interest) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const handleNext = async () => {
    let answerValue = answer;

    if (currentStep === 1 && !answer) {
      alert('Please enter your name');
      return;
    }

    if (currentStep === 2) {
      if (!answer || isNaN(answer) || parseInt(answer) < 4 || parseInt(answer) > 12) {
        alert('Please enter a valid age between 4 and 12');
        return;
      }
      answerValue = parseInt(answer);
    }

    if (currentStep === 3 && selectedInterests.length === 0) {
      alert('Please select at least one interest');
      return;
    }

    if (currentStep === 3) {
      answerValue = selectedInterests;
    }

    try {
      await authAPI.updateProfileStep(userId, currentStep, answerValue);

      if (currentStep < 3) {
        setCurrentStep(currentStep + 1);
        loadQuestion(currentStep + 1);
      } else {
        // Complete profile setup
        await authAPI.completeProfile(userId);
        localStorage.setItem('profileComplete', 'true'); // Mark profile as complete
        if (onComplete) {
          onComplete(); // Update parent App state
        }
        setCompleted(true);
        setTimeout(() => {
          navigate('/home');
        }, 2000);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to save your answer. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="card-container">
        <div className="loading">Setting up your profile...</div>
      </div>
    );
  }

  if (completed) {
    return (
      <motion.div
        className="card-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="card-content">
          <h2>🎉 Profile Complete!</h2>
          <p>Redirecting to your reading assessment...</p>
        </div>
      </motion.div>
    );
  }

  if (!question) {
    return (
      <div className="card-container">
        <div className="feedback incorrect">Error loading profile setup</div>
      </div>
    );
  }

  const progress = (currentStep / 3) * 100;

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

        <h2>Complete Your Profile</h2>
        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '20px' }}>
          Step {currentStep} of 3
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <p style={{ fontSize: '1.3rem', marginBottom: '30px' }}>
              {question.question_text}
            </p>

            {question.question_type === 'text' && (
              <div className="input-group">
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Your answer"
                  autoFocus
                />
              </div>
            )}

            {question.question_type === 'number' && (
              <div className="input-group">
                <input
                  type="number"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Your age"
                  min="4"
                  max="12"
                  autoFocus
                />
              </div>
            )}

            {question.question_type === 'select_multiple' && (
              <div className="checkbox-group">
                {question.options.map((option) => (
                  <label key={option} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedInterests.includes(option)}
                      onChange={() => toggleInterest(option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <button
          className="button-primary"
          onClick={handleNext}
          disabled={
            (currentStep === 1 && !answer) ||
            (currentStep === 2 && !answer) ||
            (currentStep === 3 && selectedInterests.length === 0)
          }
        >
          {currentStep < 3 ? 'Next →' : 'Complete Profile'}
        </button>
      </div>
    </motion.div>
  );
}

export default ProfileSetup;
