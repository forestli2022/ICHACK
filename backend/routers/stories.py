from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User, ReadingSession, Quiz, QuizResponse, WordKnowledge
from schemas import StoryRequest, StoryResponse, QuizQuestion, QuizAnswer, QuizResult, QuizBatch
from ai_service import generate_story, generate_quizzes, analyze_word_familiarity

router = APIRouter()

@router.post("/generate", response_model=StoryResponse)
def generate_story_endpoint(request: StoryRequest, db: Session = Depends(get_db)):
    """Generate a new story for the user"""
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Use user's reading level if difficulty not specified
    difficulty = request.difficulty or user.reading_level
    
    # Get user's word knowledge for context
    known_words = db.query(WordKnowledge).filter(
        WordKnowledge.user_id == request.user_id,
        WordKnowledge.familiarity_score > 0.7
    ).all()

    focus_words = db.query(WordKnowledge).filter(
        WordKnowledge.user_id == request.user_id,
        WordKnowledge.familiarity_score < 0.4
    ).order_by(WordKnowledge.familiarity_score.asc()).limit(8).all()
    
    # Generate story using AI
    story_data = generate_story(
        reading_level=difficulty,
        interests=user.interests,
        age=user.age,
        known_words=[w.word for w in known_words],
        focus_words=[w.word for w in focus_words]
    )
    
    # Create new reading session
    session = ReadingSession(
        user_id=request.user_id,
        story_content=story_data["content"],
        story_title=story_data["title"],
        story_difficulty=difficulty
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return StoryResponse(
        session_id=session.id,
        title=story_data["title"],
        content=story_data["content"],
        difficulty=difficulty
    )

@router.get("/{session_id}", response_model=StoryResponse)
def get_story(session_id: int, db: Session = Depends(get_db)):
    """Get a story by session ID"""
    session = db.query(ReadingSession).filter(ReadingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return StoryResponse(
        session_id=session.id,
        title=session.story_title,
        content=session.story_content,
        difficulty=session.story_difficulty
    )
