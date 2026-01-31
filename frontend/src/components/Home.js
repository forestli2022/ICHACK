import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

function Home({ userId }) {
  const navigate = useNavigate();

  return (
    <motion.div
      className="card-container"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="card">
        <h1>HOME</h1>
        <motion.button
          onClick={() => navigate('/assessment')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="btn-primary"
        >
          Start Reading
        </motion.button>
      </div>
    </motion.div>
  );
}

export default Home;
