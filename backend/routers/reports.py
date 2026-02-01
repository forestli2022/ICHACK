from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from database import get_db
from models import User, ReadingSession, Quiz, QuizResponse, WordKnowledge
from schemas import UserReport, SessionSummary, WordProgress

router = APIRouter()

@router.get("/{user_id}", response_model=UserReport)
def get_user_report(user_id: int, db: Session = Depends(get_db)):
    """Generate a comprehensive report for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all sessions
    sessions = db.query(ReadingSession).filter(
        ReadingSession.user_id == user_id
    ).order_by(ReadingSession.started_at.desc()).all()
    
    # Calculate overall statistics
    total_responses = db.query(QuizResponse).filter(
        QuizResponse.user_id == user_id
    ).all()
    
    total_questions = len(total_responses)
    correct_answers = len([r for r in total_responses if r.is_correct])
    overall_accuracy = (correct_answers / total_questions * 100) if total_questions > 0 else 0
    
    # Get recent sessions with details
    recent_sessions = []
    for session in sessions[:5]:  # Last 5 sessions
        # Query responses for this specific session
        session_responses = db.query(QuizResponse).filter(
            QuizResponse.session_id == session.id
        ).all()
        session_correct = len([r for r in session_responses if r.is_correct])
        session_total = len(session_responses)
        
        recent_sessions.append(SessionSummary(
            session_id=session.id,
            story_title=session.story_title,
            started_at=session.started_at,
            completed_at=session.completed_at,
            total_questions=session_total,
            correct_answers=session_correct,
            accuracy=(session_correct / session_total * 100) if session_total > 0 else 0
        ))
    
    # Get word mastery
    word_knowledge = db.query(WordKnowledge).filter(
        WordKnowledge.user_id == user_id
    ).order_by(WordKnowledge.familiarity_score.desc()).limit(20).all()
    
    word_mastery = [
        WordProgress(
            word=wk.word,
            familiarity_score=wk.familiarity_score,
            times_seen=wk.times_seen,
            times_correct=wk.times_correct
        ) for wk in word_knowledge
    ]
    
    # Analyze strengths and weaknesses
    question_types = {}
    for response in total_responses:
        quiz = db.query(Quiz).filter(Quiz.id == response.quiz_id).first()
        if quiz:
            q_type = quiz.question_type
            if q_type not in question_types:
                question_types[q_type] = {"correct": 0, "total": 0}
            question_types[q_type]["total"] += 1
            if response.is_correct:
                question_types[q_type]["correct"] += 1
    
    strengths = []
    areas_for_improvement = []
    
    for q_type, stats in question_types.items():
        accuracy = (stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0
        if accuracy >= 70:
            strengths.append(f"{q_type.replace('_', ' ').title()} ({accuracy:.1f}%)")
        else:
            areas_for_improvement.append(f"{q_type.replace('_', ' ').title()} ({accuracy:.1f}%)")
    
    # Determine reading level progress
    first_level = "beginner"
    current_level = user.reading_level
    
    if first_level != current_level:
        level_progress = f"Progressed from {first_level} to {current_level}"
    else:
        level_progress = f"Currently at {current_level} level"
    
    return UserReport(
        user=user,
        total_sessions=len(sessions),
        total_questions_answered=total_questions,
        overall_accuracy=overall_accuracy,
        reading_level_progress=level_progress,
        recent_sessions=recent_sessions,
        word_mastery=word_mastery,
        strengths=strengths if strengths else ["Keep practicing!"],
        areas_for_improvement=areas_for_improvement if areas_for_improvement else ["Doing great overall!"]
    )

@router.get("/words/{user_id}", response_model=List[WordProgress])
def get_word_progress(user_id: int, db: Session = Depends(get_db)):
    """Get word familiarity progress for a user"""
    word_knowledge = db.query(WordKnowledge).filter(
        WordKnowledge.user_id == user_id
    ).order_by(WordKnowledge.last_seen.desc()).all()
    
    return [
        WordProgress(
            word=wk.word,
            familiarity_score=wk.familiarity_score,
            times_seen=wk.times_seen,
            times_correct=wk.times_correct
        ) for wk in word_knowledge
    ]
