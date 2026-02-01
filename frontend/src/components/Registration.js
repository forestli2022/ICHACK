import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { authAPI } from '../api';

const INTERESTS = ['Animals', 'Adventures', 'Science', 'Sports', 'Fantasy', 'Space', 'Nature', 'Music'];

function Registration({ setUserId }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(false);

  const toggleInterest = (interest) => {
    setInterests(prev => 
      prev.includes(interest) 
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !age || interests.length === 0) {
      alert('Please fill in all fields and select at least one interest!');
      return;
    }

    setLoading(true);
    try {
      const response = await authAPI.register({
        name,
        age: parseInt(age),
        interests,
      });
      setUserId(response.data.id);
      navigate('/assessment');
    } catch (error) {
      console.error('Registration error:', error);
      alert('Registration failed. Please try again.');
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
        <h1>📚 Welcome!</h1>
        <p>Let's start your reading journey</p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>What's your name?</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              required
            />
          </div>

          <div className="input-group">
            <label>How old are you?</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Enter your age"
              min="4"
              max="12"
              required
            />
          </div>

          <div className="input-group">
            <label>What do you like to read about?</label>
            <div className="checkbox-group">
              {INTERESTS.map((interest) => (
                <label key={interest} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={interests.includes(interest)}
                    onChange={() => toggleInterest(interest)}
                  />
                  {interest}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="button-primary" disabled={loading}>
            {loading ? 'Starting...' : "Let's Go! →"}
          </button>
        </form>
      </div>
    </motion.div>
  );
}

export default Registration;
