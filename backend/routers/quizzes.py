from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

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
    elif quiz.question_type == "pronunciation":  # Pronunciation: user_answer is JSON string of missed words
        import json
        try:
            missed_words = json.loads(answer.user_answer) if answer.user_answer else []
            is_correct = len(missed_words) == 0
            
            # Record pronunciation difficulties
            from models import WordDifficulty
            for word in missed_words:
                difficulty_record = WordDifficulty(
                    user_id=session.user_id,
                    word=word,
                    difficulty_type="pronunciation",
                    session_id=session_id,
                    description=f"Missed during read-aloud exercise"
                )
                db.add(difficulty_record)
            
            if is_correct:
                explanation = "Great job! You read the passage perfectly."
            else:
                explanation = f"Good effort! Practice these words: {', '.join(missed_words)}"
        except:
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
    """Analyze word confidence scores and determine likely missed words using AI."""
    try:
        word_list = request.get("word_list", [])
        missed_words = request.get("missed_words", [])
        
        # Use AI to analyze and filter words
        analyzed_words = validate_open_ended_answer(
            user_answer=json.dumps({
                "word_list": word_list,
                "missed_words": missed_words
            }),
            correct_answer="Analyze the word list and return only the words that are most likely to have been mispronounced based on confidence scores. Filter out any words that might have false positives.",
            question_type="pronunciation_analysis"
        )
        
        # Parse the result back
        import ast
        try:
            # Try to extract list from AI response
            result_text = str(analyzed_words).strip()
            # Look for a list pattern in the response
            if '[' in result_text:
                start = result_text.find('[')
                end = result_text.rfind(']') + 1
                result_text = result_text[start:end]
                final_words = ast.literal_eval(result_text)
            else:
                final_words = missed_words
        except:
            final_words = missed_words
        
        return {
            "analyzed_words": final_words,
            "confidence": "analyzed"
        }
    except Exception as e:
        print(f"Error analyzing pronunciation: {e}")
        return {
            "analyzed_words": request.get("missed_words", []),
            "confidence": "fallback"
        }
