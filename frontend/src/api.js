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
  getAssessmentQuestions: () => api.get('/auth/assessment/questions'),
  submitAssessment: (userId, answers) => 
    api.post('/auth/assessment/submit', { answers }, { params: { user_id: userId } }),
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
};

export const reportAPI = {
  getUserReport: (userId) => api.get(`/reports/${userId}`),
  getWordProgress: (userId) => api.get(`/reports/words/${userId}`),
};

export default api;
