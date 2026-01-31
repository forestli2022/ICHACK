from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

# Authentication Schemas
class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserSignUp(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: int

# User Schemas
class UserCreate(BaseModel):
    name: str
    age: int
    interests: List[str]

class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    age: int
    reading_level: str
    interests: List[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Assessment Schemas
class AssessmentQuestion(BaseModel):
    question_number: int
    question_text: str
    options: List[str]
    correct_answer: str

class AssessmentAnswer(BaseModel):
    question_number: int
    user_answer: str

class AssessmentResult(BaseModel):
    reading_level: str
    score: float
    recommendations: List[str]

# Story Schemas
class StoryRequest(BaseModel):
    user_id: int
    difficulty: Optional[str] = None

class StoryResponse(BaseModel):
    session_id: int
    title: str
    content: str
    difficulty: str

# Quiz Schemas
class QuizQuestion(BaseModel):
    id: int
    question_type: str
    question_text: str
    options: Optional[List[str]] = None
    
    class Config:
        from_attributes = True

class QuizAnswer(BaseModel):
    quiz_id: int
    user_answer: str
    time_taken_seconds: int

class QuizResult(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: Optional[str] = None

class QuizBatch(BaseModel):
    session_id: int
    questions: List[QuizQuestion]

class QuizTypeAccuracy(BaseModel):
    question_type: str
    correct: int
    total: int
    accuracy: float

class QuizSessionResult(BaseModel):
    session_id: int
    total_questions: int
    correct_answers: int
    accuracy: float
    question_breakdown: List[QuizTypeAccuracy]

# Agent Schemas
class AgentRunRequest(BaseModel):
    user_id: int
    difficulty: Optional[str] = None

class AgentRunResponse(BaseModel):
    session_id: int
    title: str
    content: str
    difficulty: str
    questions: List[QuizQuestion]

# Report Schemas
class WordProgress(BaseModel):
    word: str
    familiarity_score: float
    times_seen: int
    times_correct: int

class SessionSummary(BaseModel):
    session_id: int
    story_title: str
    started_at: datetime
    completed_at: Optional[datetime]
    total_questions: int
    correct_answers: int
    accuracy: float

class UserReport(BaseModel):
    user: UserResponse
    total_sessions: int
    total_questions_answered: int
    overall_accuracy: float
    reading_level_progress: str
    recent_sessions: List[SessionSummary]
    word_mastery: List[WordProgress]
    strengths: List[str]
    areas_for_improvement: List[str]
