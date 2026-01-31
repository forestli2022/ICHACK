from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from database import get_db
from models import User, ReadingSession, Quiz, QuizResponse, WordKnowledge
from schemas import QuizQuestion, QuizAnswer, QuizResult, QuizBatch
from ai_service import generate_quizzes

router = APIRouter()

@router.post("/generate", response_model=QuizBatch)
def generate_quiz_endpoint(session_id: int, db: Session = Depends(get_db)):
    """Generate quizzes for a reading session"""
    session = db.query(ReadingSession).filter(ReadingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    user = db.query(User).filter(User.id == session.user_id).first()
    
    # Get user's recent performance
    recent_responses = db.query(QuizResponse).filter(
        QuizResponse.user_id == session.user_id
    ).order_by(QuizResponse.answered_at.desc()).limit(20).all()
    
    # Generate quizzes using AI
    quiz_data = generate_quizzes(
        story_content=session.story_content,
        reading_level=session.story_difficulty,
        user_age=user.age,
        recent_performance=[{
            "correct": r.is_correct,
            "question_type": db.query(Quiz).filter(Quiz.id == r.quiz_id).first().question_type
        } for r in recent_responses]
    )
    
    # Store quizzes in database
    quiz_questions = []
    for quiz_item in quiz_data:
        quiz = Quiz(
            session_id=session_id,
            question_type=quiz_item["type"],
            question_text=quiz_item["question"],
            correct_answer=quiz_item["answer"],
            options=quiz_item.get("options")
        )
        db.add(quiz)
        db.commit()
        db.refresh(quiz)
        
        quiz_questions.append(QuizQuestion(
            id=quiz.id,
            question_type=quiz.question_type,
            question_text=quiz.question_text,
            options=quiz.options
        ))
    
    return QuizBatch(session_id=session_id, questions=quiz_questions)

@router.post("/submit", response_model=QuizResult)
def submit_quiz_answer(
    session_id: int,
    answer: QuizAnswer,
    db: Session = Depends(get_db)
):
    """Submit a quiz answer"""
    session = db.query(ReadingSession).filter(ReadingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    quiz = db.query(Quiz).filter(Quiz.id == answer.quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    # Check if answer is correct
    is_correct = answer.user_answer.strip().lower() == quiz.correct_answer.strip().lower()
    
    # Store response
    response = QuizResponse(
        user_id=session.user_id,
        session_id=session_id,
        quiz_id=answer.quiz_id,
        user_answer=answer.user_answer,
        is_correct=is_correct,
        time_taken_seconds=answer.time_taken_seconds
    )
    db.add(response)
    
    # Update word knowledge if applicable
    if quiz.question_type in ["fill_blank", "reading"]:
        words = quiz.correct_answer.split()
        for word in words:
            word_clean = word.strip().lower()
            word_knowledge = db.query(WordKnowledge).filter(
                WordKnowledge.user_id == session.user_id,
                WordKnowledge.word == word_clean
            ).first()
            
            if word_knowledge:
                word_knowledge.times_seen += 1
                if is_correct:
                    word_knowledge.times_correct += 1
                word_knowledge.familiarity_score = word_knowledge.times_correct / word_knowledge.times_seen
                word_knowledge.last_seen = datetime.utcnow()
            else:
                word_knowledge = WordKnowledge(
                    user_id=session.user_id,
                    word=word_clean,
                    times_seen=1,
                    times_correct=1 if is_correct else 0,
                    familiarity_score=1.0 if is_correct else 0.0
                )
                db.add(word_knowledge)
    
    db.commit()
    
    return QuizResult(
        is_correct=is_correct,
        correct_answer=quiz.correct_answer,
        explanation=f"The correct answer is '{quiz.correct_answer}'"
    )

@router.post("/{session_id}/complete")
def complete_session(session_id: int, db: Session = Depends(get_db)):
    """Mark a reading session as complete"""
    session = db.query(ReadingSession).filter(ReadingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session.completed_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Session completed successfully", "session_id": session_id}
