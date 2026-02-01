from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta

from database import get_db
from models import User, ReadingSession, Quiz, QuizResponse, WordKnowledge
from schemas import QuizQuestion, QuizAnswer, QuizResult, QuizBatch, QuizSessionResult, QuizTypeAccuracy
from ai_service import generate_quizzes, validate_open_ended_answer
import json

router = APIRouter()

def _build_quiz_batch(session: ReadingSession, db: Session) -> QuizBatch:
    """Generate quizzes for a session, store them, and return the batch."""
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get user's recent performance
    recent_responses = db.query(QuizResponse, Quiz).join(
        Quiz, Quiz.id == QuizResponse.quiz_id
    ).filter(
        QuizResponse.user_id == session.user_id
    ).order_by(QuizResponse.answered_at.desc()).limit(20).all()

    # Generate quizzes using AI
    quiz_data = generate_quizzes(
        story_content=session.story_content,
        reading_level=session.story_difficulty,
        user_age=user.age,
        recent_performance=[{
            "correct": response.is_correct,
            "question_type": quiz.question_type
        } for response, quiz in recent_responses]
    )

    # Store quizzes in database
    quiz_questions = []
    for quiz_item in quiz_data:
        quiz = Quiz(
            session_id=session.id,
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

    return QuizBatch(session_id=session.id, questions=quiz_questions)

@router.post("/generate", response_model=QuizBatch)
def generate_quiz_endpoint(session_id: int, db: Session = Depends(get_db)):
    """Generate quizzes for a reading session"""
    session = db.query(ReadingSession).filter(ReadingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return _build_quiz_batch(session, db)

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
    
    # Check if answer is correct based on question type
    if quiz.question_type == "reading":  # Multiple choice
        is_correct = answer.user_answer.strip().lower() == quiz.correct_answer.strip().lower()
        explanation = f"The correct answer is '{quiz.correct_answer}'"
    elif quiz.question_type == "pronunciation":  # Pronunciation: user_answer is JSON with word confidences or already-filtered words
        import json
        try:
            pronunciation_data = json.loads(answer.user_answer) if answer.user_answer else {}
            
            # Check if words are already AI-filtered from frontend
            if pronunciation_data.get('ai_filtered'):
                # Words already filtered by AI agent on frontend
                difficult_words = pronunciation_data.get('missed_words', [])
            else:
                # Get word confidence scores from the data and run AI analysis
                word_confidences = pronunciation_data.get('word_confidences', [])
                missed_words_raw = pronunciation_data.get('missed_words', [])
                
                # Use AI agent to intelligently filter difficult words
                from ai_service import analyze_pronunciation_difficulties
                
                if word_confidences:
                    # Use the intelligent agent with confidence scores
                    difficult_words = analyze_pronunciation_difficulties(
                        word_confidences=word_confidences,
                        story_context=session.story_content[:500]  # Pass story context for better analysis
                    )
                else:
                    # Fallback to basic filtering if no confidence data
                    difficult_words = [w for w in missed_words_raw 
                                     if w.lower() not in ['um', 'uh', 'like', 'and', 'but', 'the', 'a', 'an']]
            
            is_correct = len(difficult_words) == 0
            
            # Record only genuinely difficult pronunciation words (avoid duplicates)
            from models import WordDifficulty
            
            for word in difficult_words:
                word_clean = word.strip().lower()
                
                # Check if this word was already marked as difficult recently (within last 24 hours)
                recent_difficulty = db.query(WordDifficulty).filter(
                    WordDifficulty.user_id == session.user_id,
                    WordDifficulty.word == word_clean,
                    WordDifficulty.difficulty_type == "pronunciation",
                    WordDifficulty.created_at >= datetime.utcnow() - timedelta(hours=24)
                ).first()
                
                if not recent_difficulty:
                    difficulty_record = WordDifficulty(
                        user_id=session.user_id,
                        word=word_clean,
                        difficulty_type="pronunciation",
                        session_id=session_id,
                        description=f"AI-identified pronunciation difficulty"
                    )
                    db.add(difficulty_record)
            
            if is_correct:
                explanation = "Great job! You read the passage perfectly."
            else:
                explanation = f"Good effort! Practice these words: {', '.join(difficult_words)}"
        except Exception as e:
            print(f"Error processing pronunciation: {e}")
            import traceback
            traceback.print_exc()
            is_correct = False
            explanation = "Pronunciation check failed"
    elif quiz.question_type in ["fill_blank", "general"]:  # Open-ended: use Gemini validation
        validation_result = validate_open_ended_answer(
            story_content=session.story_content,
            question_text=quiz.question_text,
            user_answer=answer.user_answer
        )
        is_correct = validation_result.get("is_valid", False)
        explanation = validation_result.get("reasoning", "Validation complete")
    else:
        is_correct = answer.user_answer.strip().lower() == quiz.correct_answer.strip().lower()
        explanation = f"The correct answer is '{quiz.correct_answer}'"
    
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
        explanation=explanation
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

@router.get("/{session_id}/results", response_model=QuizSessionResult)
def get_session_results(session_id: int, db: Session = Depends(get_db)):
    """Get quiz results summary for a reading session"""
    session = db.query(ReadingSession).filter(ReadingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    responses = db.query(QuizResponse).filter(
        QuizResponse.session_id == session_id
    ).all()

    total_questions = len(responses)
    correct_answers = len([r for r in responses if r.is_correct])
    accuracy = (correct_answers / total_questions * 100) if total_questions > 0 else 0

    quiz_ids = [r.quiz_id for r in responses]
    quizzes = {}
    if quiz_ids:
        for quiz in db.query(Quiz).filter(Quiz.id.in_(quiz_ids)).all():
            quizzes[quiz.id] = quiz

    breakdown = {}
    for response in responses:
        quiz = quizzes.get(response.quiz_id)
        if not quiz:
            continue
        q_type = quiz.question_type
        if q_type not in breakdown:
            breakdown[q_type] = {"correct": 0, "total": 0}
        breakdown[q_type]["total"] += 1
        if response.is_correct:
            breakdown[q_type]["correct"] += 1

    question_breakdown = [
        QuizTypeAccuracy(
            question_type=q_type,
            correct=stats["correct"],
            total=stats["total"],
            accuracy=(stats["correct"] / stats["total"] * 100) if stats["total"] > 0 else 0
        )
        for q_type, stats in breakdown.items()
    ]

    return QuizSessionResult(
        session_id=session_id,
        total_questions=total_questions,
        correct_answers=correct_answers,
        accuracy=accuracy,
        question_breakdown=question_breakdown
    )

@router.post("/{session_id}/retake", response_model=QuizBatch)
def retake_quiz(session_id: int, db: Session = Depends(get_db)):
    """Create a new session for the same story and generate a new quiz set."""
    session = db.query(ReadingSession).filter(ReadingSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    new_session = ReadingSession(
        user_id=session.user_id,
        story_content=session.story_content,
        story_title=session.story_title,
        story_difficulty=session.story_difficulty
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    return _build_quiz_batch(new_session, db)


@router.post("/analyze-pronunciation")
async def analyze_pronunciation_words(request: dict):
    """Analyze word confidence scores and determine genuinely difficult words using AI agent."""
    try:
        word_confidences = request.get("word_confidences", [])
        story_context = request.get("story_context", "")
        
        # Use intelligent AI agent to filter difficult words
        from ai_service import analyze_pronunciation_difficulties
        
        difficult_words = analyze_pronunciation_difficulties(
            word_confidences=word_confidences,
            story_context=story_context
        )
        
        return {
            "analyzed_words": difficult_words,
            "count": len(difficult_words),
            "confidence": "ai_analyzed"
        }
    except Exception as e:
        print(f"Error analyzing pronunciation: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback: simple filtering
        word_confidences = request.get("word_confidences", [])
        fallback_words = [
            item['word'].lower()
            for item in word_confidences
            if item.get('confidence', 1.0) < 0.5 and 
               item['word'].lower() not in ['um', 'uh', 'like', 'and', 'but', 'the', 'a', 'an', 'or']
        ]
        
        return {
            "analyzed_words": fallback_words,
            "count": len(fallback_words),
            "confidence": "fallback"
        }
