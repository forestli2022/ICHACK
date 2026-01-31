from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    reading_level = Column(String, default="beginner")  # beginner, intermediate, advanced
    interests = Column(JSON)  # List of interests
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    sessions = relationship("ReadingSession", back_populates="user")
    word_knowledge = relationship("WordKnowledge", back_populates="user")
    quiz_responses = relationship("QuizResponse", back_populates="user")

class ReadingSession(Base):
    __tablename__ = "reading_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    story_content = Column(String)
    story_title = Column(String)
    story_difficulty = Column(String)
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="sessions")
    quiz_responses = relationship("QuizResponse", back_populates="session")

class WordKnowledge(Base):
    __tablename__ = "word_knowledge"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    word = Column(String, nullable=False)
    familiarity_score = Column(Float, default=0.0)  # 0-1 scale
    times_seen = Column(Integer, default=0)
    times_correct = Column(Integer, default=0)
    last_seen = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="word_knowledge")

class Quiz(Base):
    __tablename__ = "quizzes"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("reading_sessions.id"))
    question_type = Column(String)  # "reading", "general", "fill_blank"
    question_text = Column(String)
    correct_answer = Column(String)
    options = Column(JSON)  # For multiple choice
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    responses = relationship("QuizResponse", back_populates="quiz")

class QuizResponse(Base):
    __tablename__ = "quiz_responses"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(Integer, ForeignKey("reading_sessions.id"))
    quiz_id = Column(Integer, ForeignKey("quizzes.id"))
    user_answer = Column(String)
    is_correct = Column(Boolean)
    time_taken_seconds = Column(Integer)
    answered_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="quiz_responses")
    session = relationship("ReadingSession", back_populates="quiz_responses")
    quiz = relationship("Quiz", back_populates="responses")

class InitialAssessment(Base):
    __tablename__ = "initial_assessments"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    question_number = Column(Integer)
    question_text = Column(String)
    user_answer = Column(String)
    is_correct = Column(Boolean)
    completed_at = Column(DateTime, default=datetime.utcnow)

class WordDifficulty(Base):
    __tablename__ = "word_difficulties"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    word = Column(String, nullable=False)
    difficulty_type = Column(String, nullable=False)  # "pronunciation", "spelling", "meaning"
    session_id = Column(Integer, ForeignKey("reading_sessions.id"), nullable=True)
    description = Column(String)  # Optional additional context
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User")
    session = relationship("ReadingSession")
