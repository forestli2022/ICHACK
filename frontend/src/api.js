import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  signup: (email, password) => api.post('/auth/signup', { email, password }),
  getProfileQuestion: (userId, step) => 
    api.get(`/auth/profile/setup/${userId}?step=${step}`),
  updateProfileStep: (userId, step, answer) => 
    api.post(`/auth/profile/setup/${userId}?step=${step}`, { value: answer }),
  completeProfile: (userId) => api.post(`/auth/profile/complete/${userId}`),
  getUser: (userId) => api.get(`/auth/users/${userId}`),
};

export const storyAPI = {
  generateStory: (userId, difficulty = null) => 
    api.post('/stories/generate', { user_id: userId, difficulty }),
  getStory: (sessionId) => api.get(`/stories/${sessionId}`),
};

export const quizAPI = {
  generateQuizzes: (sessionId) => 
    api.post('/quizzes/generate', null, { params: { session_id: sessionId } }),
  submitAnswer: (sessionId, answer) => 
    api.post('/quizzes/submit', answer, { params: { session_id: sessionId } }),
  completeSession: (sessionId) => 
    api.post(`/quizzes/${sessionId}/complete`),
  getResults: (sessionId) => 
    api.get(`/quizzes/${sessionId}/results`),
  retakeQuiz: (sessionId) => 
    api.post(`/quizzes/${sessionId}/retake`),
};

export const reportAPI = {
  getUserReport: (userId) => api.get(`/reports/${userId}`),
  getWordProgress: (userId) => api.get(`/reports/words/${userId}`),
};

export const agentAPI = {
  runAgent: async (userId, difficulty = null) => {
    console.log('=== AGENT API CALL ===');
    console.log('User ID:', userId);
    console.log('Difficulty:', difficulty);
    console.log('Request URL:', `${API_BASE_URL}/agent/run`);
    console.log('Request Body:', { user_id: userId, difficulty });
    try {
      const response = await api.post('/agent/run', { user_id: userId, difficulty });
      console.log('Agent Response Success:', response.data);
      return response;
    } catch (error) {
      console.error('=== AGENT API ERROR ===');
      console.error('Error Status:', error.response?.status);
      console.error('Error Data:', error.response?.data);
      console.error('Error Message:', error.message);
      console.error('Full Error:', error);
      throw error;
    }
  },
};

export default api;
