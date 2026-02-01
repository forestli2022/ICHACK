from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import datetime

from database import get_db
from models import WordDifficulty, User

router = APIRouter()

class WordDifficultyCreate(BaseModel):
    word: str
    difficulty_type: str  # "pronunciation", "spelling", "meaning"
    session_id: int = None
    description: str = None

class WordDifficultyResponse(BaseModel):
    id: int
    user_id: int
    word: str
    difficulty_type: str
    session_id: int = None
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.post("/difficulty", response_model=WordDifficultyResponse)
def record_word_difficulty(
    user_id: int,
    difficulty: WordDifficultyCreate,
    db: Session = Depends(get_db)
):
    """Record a word difficulty for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_difficulty = WordDifficulty(
        user_id=user_id,
        word=difficulty.word,
        difficulty_type=difficulty.difficulty_type,
        session_id=difficulty.session_id,
        description=difficulty.description
    )
    db.add(db_difficulty)
    db.commit()
    db.refresh(db_difficulty)
    
    return db_difficulty

@router.get("/difficulties/{user_id}", response_model=List[WordDifficultyResponse])
def get_user_word_difficulties(
    user_id: int,
    difficulty_type: str = None,
    db: Session = Depends(get_db)
):
    """Get all word difficulties for a user, optionally filtered by type"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    query = db.query(WordDifficulty).filter(WordDifficulty.user_id == user_id)
    
    if difficulty_type:
        query = query.filter(WordDifficulty.difficulty_type == difficulty_type)
    
    difficulties = query.order_by(WordDifficulty.created_at.desc()).all()
    return difficulties

@router.get("/difficulties/{user_id}/summary")
def get_word_difficulties_summary(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Get summary of word difficulties grouped by type"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    pronunciation = db.query(WordDifficulty).filter(
        WordDifficulty.user_id == user_id,
        WordDifficulty.difficulty_type == "pronunciation"
    ).count()
    
    spelling = db.query(WordDifficulty).filter(
        WordDifficulty.user_id == user_id,
        WordDifficulty.difficulty_type == "spelling"
    ).count()
    
    meaning = db.query(WordDifficulty).filter(
        WordDifficulty.user_id == user_id,
        WordDifficulty.difficulty_type == "meaning"
    ).count()
    
    return {
        "user_id": user_id,
        "pronunciation_difficulties": pronunciation,
        "spelling_difficulties": spelling,
        "meaning_difficulties": meaning,
        "total_difficulties": pronunciation + spelling + meaning
    }

@router.get("/difficulty-words/{user_id}")
def get_unique_words_with_difficulties(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Get list of unique words user had difficulty with"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    words = db.query(WordDifficulty.word).filter(
        WordDifficulty.user_id == user_id
    ).distinct().all()
    
    return {
        "user_id": user_id,
        "unique_difficult_words": [w[0] for w in words],
        "total_unique_words": len(words)
    }
