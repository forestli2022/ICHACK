import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { storyAPI, quizAPI, agentAPI } from '../api';
import TextFollower from './TextFollower.tsx';

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
  const [sessionResults, setSessionResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      generateNewStory();
    } else {
      loadStory();
    }
  }, []);

  const generateNewStory = async () => {
    console.log('=== GENERATE NEW STORY ===');
    console.log('User ID:', userId);
    setStage('loading');
    try {
      console.log('Calling agentAPI.runAgent...');
      const response = await agentAPI.runAgent(userId);
      console.log('Agent response received:', response.data);
      setSessionId(response.data.session_id);
      setStory({
        session_id: response.data.session_id,
        title: response.data.title,
        content: response.data.content,
        difficulty: response.data.difficulty,
        exploration_words: response.data.exploration_words || [],
        exploitation_words: response.data.exploitation_words || []
      });
      // Store quizzes from agent response
      setQuizzes(response.data.questions || []);
      setSessionResults(null);
      setStage('story');
      console.log('Story generation successful!');
      console.log('Exploration words:', response.data.exploration_words);
    } catch (error) {
      console.error('=== GENERATE STORY ERROR ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error response status:', error.response?.status);
      console.error('Error response data:', error.response?.data);
      console.error('Full error object:', error);
      alert(`Failed to generate story: ${error.response?.data?.detail || error.message}`);
    }
  };

  const loadStory = async () => {
    try {
      const response = await storyAPI.getStory(sessionId);
      setStory(response.data);
      setSessionResults(null);
      setStage('story');
    } catch (error) {
      console.error('Error loading story:', error);
      generateNewStory();
    }
  };

  const startQuiz = async () => {
    setStage('loading');
    try {
      // Use quizzes from agent if already available
      if (quizzes.length > 0) {
        // Reorder: pronunciation first, then other questions
        const pronunciationQuiz = quizzes.find(q => q.question_type === 'pronunciation');
        const otherQuizzes = quizzes.filter(q => q.question_type !== 'pronunciation');
        const reorderedQuizzes = pronunciationQuiz ? [pronunciationQuiz, ...otherQuizzes] : quizzes;
        setQuizzes(reorderedQuizzes);
        setCurrentQuizIndex(0);
        setScore({ correct: 0, total: 0 });
        setSessionResults(null);
        setStage('quiz');
        setStartTime(Date.now());
      } else {
        // Fallback to generating quizzes separately if not available
        const response = await quizAPI.generateQuizzes(sessionId || story.session_id);
        // Reorder: pronunciation first, then other questions
        const allQuizzes = response.data.questions;
        const pronunciationQuiz = allQuizzes.find(q => q.question_type === 'pronunciation');
        const otherQuizzes = allQuizzes.filter(q => q.question_type !== 'pronunciation');
        const reorderedQuizzes = pronunciationQuiz ? [pronunciationQuiz, ...otherQuizzes] : allQuizzes;
        setQuizzes(reorderedQuizzes);
        setCurrentQuizIndex(0);
        setScore({ correct: 0, total: 0 });
        setSessionResults(null);
        setStage('quiz');
        setStartTime(Date.now());
      }
    } catch (error) {
      console.error('Error starting quizzes:', error);
      alert('Failed to start quizzes');
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
      // If this was the last question, auto-complete the session shortly
      if (currentQuizIndex >= quizzes.length - 1) {
        setTimeout(() => {
          try {
            completeSession();
          } catch (e) {
            console.error('Auto-complete failed:', e);
          }
        }, 800);
      }
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
      setResultsLoading(true);
      const results = await quizAPI.getResults(sessionId || story.session_id);
      setSessionResults(results.data);
      setStage('complete');
    } catch (error) {
      console.error('Error completing session:', error);
      setStage('complete');
    } finally {
      setResultsLoading(false);
    }
  };

  const startNewSession = () => {
    setSessionId(null);
    setStory(null);
    setQuizzes([]);
    setCurrentQuizIndex(0);
    setScore({ correct: 0, total: 0 });
    setSessionResults(null);
    generateNewStory();
  };

  const retakeQuiz = async () => {
    setStage('loading');
    try {
      const response = await quizAPI.retakeQuiz(sessionId || story.session_id);
      setSessionId(response.data.session_id);
      setQuizzes(response.data.questions);
      setCurrentQuizIndex(0);
      setScore({ correct: 0, total: 0 });
      setSessionResults(null);
      setStartTime(Date.now());
      setStage('quiz');
    } catch (error) {
      console.error('Error retaking quiz:', error);
      alert('Failed to retake quiz');
      setStage('complete');
    }
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
    // Function to highlight exploration and exploitation words
    const highlightWords = (text, explorationWords, exploitationWords) => {
      if ((!explorationWords || explorationWords.length === 0) && 
          (!exploitationWords || exploitationWords.length === 0)) {
        return text;
      }

      const allWords = [
        ...(explorationWords || []).map(w => ({ word: w, type: 'exploration' })),
        ...(exploitationWords || []).map(w => ({ word: w, type: 'exploitation' }))
      ];

      if (allWords.length === 0) return text;

      // Create regex pattern for all words
      const pattern = new RegExp(`\\b(${allWords.map(w => w.word).join('|')})\\b`, 'gi');
      
      // Create lookup map (lowercase)
      const wordTypeMap = {};
      allWords.forEach(({ word, type }) => {
        wordTypeMap[word.toLowerCase()] = type;
      });

      const parts = [];
      let lastIndex = 0;
      let match;
      
      const regex = new RegExp(pattern);
      while ((match = regex.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }
        
        // Determine word type
        const wordType = wordTypeMap[match[0].toLowerCase()];
        const isExploration = wordType === 'exploration';
        
        // Add highlighted match
        parts.push(
          <span 
            key={match.index} 
            style={{ 
              backgroundColor: isExploration ? '#ffd700' : '#ffcccc',
              color: '#000',
              padding: '2px 4px',
              borderRadius: '3px',
              fontWeight: '500',
              borderBottom: isExploration ? 'none' : '2px solid #e74c3c'
            }}
            title={isExploration ? "✨ New word!" : "🔄 Practice word"}
          >
            {match[0]}
          </span>
        );
        lastIndex = regex.lastIndex;
      }
      
      // Add remaining text
      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }
      
      return parts.length > 0 ? parts : text;
    };

    return (
      <motion.div
        className="card-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="card-content">
          <h2>{story.title}</h2>
          {((story.exploration_words && story.exploration_words.length > 0) ||
            (story.exploitation_words && story.exploitation_words.length > 0)) && (
            <div style={{ marginBottom: '15px' }}>
              {story.exploration_words && story.exploration_words.length > 0 && (
                <div style={{ 
                  marginBottom: '10px',
                  padding: '10px', 
                  backgroundColor: '#fff9e6', 
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#856404',
                  borderLeft: '4px solid #ffd700'
                }}>
                  ✨ <strong>New words to discover:</strong> {story.exploration_words.join(', ')}
                </div>
              )}
              {story.exploitation_words && story.exploitation_words.length > 0 && (
                <div style={{ 
                  padding: '10px', 
                  backgroundColor: '#ffe6e6', 
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#721c24',
                  borderLeft: '4px solid #e74c3c'
                }}>
                  🔄 <strong>Words to practice:</strong> {story.exploitation_words.join(', ')}
                </div>
              )}
            </div>
          )}
          <div className="story-content">
            {highlightWords(story.content, story.exploration_words, story.exploitation_words)}
          </div>
          <button className="button-primary" onClick={startQuiz}>
            Start Reading →
          </button>
        </div>
      </motion.div>
    );
  }

  if (stage === 'quiz' || stage === 'feedback') {
    const currentQuiz = quizzes[currentQuizIndex];
    const progress = ((currentQuizIndex + 1) / quizzes.length) * 100;

    // Special handling for pronunciation quiz type
    if (currentQuiz.question_type === 'pronunciation' && stage === 'quiz') {
      return (
        <motion.div
          className="card-container"
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="card-content" style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <h2>Step {currentQuizIndex + 1} of {quizzes.length}</h2>
            <h3 style={{ color: '#2ecc71', marginBottom: '20px' }}>📖 Read the Story Aloud</h3>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <TextFollower 
                text={story?.content || currentQuiz.correct_answer}
                onComplete={async (missedWords) => {
                  console.log('TextFollower completed with missed words:', missedWords);
                  
                  // Submit pronunciation result with missed words
                  // The TextFollower already called the AI agent and filtered them
                  try {
                    await quizAPI.submitAnswer(sessionId || story.session_id, {
                      quiz_id: currentQuiz.id,
                      user_answer: JSON.stringify({ 
                        missed_words: missedWords,
                        ai_filtered: true  // Flag indicating AI already analyzed
                      }),
                      time_taken_seconds: Math.floor((Date.now() - startTime) / 1000),
                    });
                  } catch (error) {
                    console.error('Error submitting pronunciation result:', error);
                  }
                  
                  // Move to next question (comprehension questions)
                  if (currentQuizIndex < quizzes.length - 1) {
                    setCurrentQuizIndex(currentQuizIndex + 1);
                    setSelectedAnswer('');
                    setFeedback(null);
                    setStage('quiz');
                    setStartTime(Date.now());
                  } else {
                    // All questions complete
                    completeSession();
                  }
                }}
              />
            </div>
          </div>
        </motion.div>
      );
    }

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
    const accuracy = sessionResults
      ? sessionResults.accuracy.toFixed(0)
      : (score.total > 0 ? (score.correct / score.total * 100).toFixed(0) : 0);
    const correctCount = sessionResults ? sessionResults.correct_answers : score.correct;
    const totalCount = sessionResults ? sessionResults.total_questions : score.total;

    return (
      <motion.div
        className="card-container"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="card-content">
          <h1>🎉 Session Complete!</h1>
          {resultsLoading && <p>Loading results...</p>}
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-value">{correctCount}</div>
              <div className="stat-label">Correct</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{totalCount}</div>
              <div className="stat-label">Total</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{accuracy}%</div>
              <div className="stat-label">Accuracy</div>
            </div>
          </div>

          {sessionResults && sessionResults.question_breakdown.length > 0 && (
            <div className="stat-grid" style={{ marginTop: '20px' }}>
              {sessionResults.question_breakdown.map((item) => (
                <div className="stat-card" key={item.question_type}>
                  <div className="stat-value">{item.accuracy.toFixed(0)}%</div>
                  <div className="stat-label">{item.question_type.replace('_', ' ')}</div>
                </div>
              ))}
            </div>
          )}

          <button className="button-primary" onClick={startNewSession}>
            Read Another Story
          </button>
          <button className="button-primary" onClick={retakeQuiz}>
            Retake Quiz
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
