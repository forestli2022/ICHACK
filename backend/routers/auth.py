from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from database import get_db
from models import User, InitialAssessment
from schemas import (
    UserCreate, UserResponse, AssessmentQuestion, AssessmentAnswer, 
    AssessmentResult, UserLogin, UserSignUp, TokenResponse
)
from security import hash_password, verify_password, create_access_token, decode_access_token
from ai_service import determine_reading_level

router = APIRouter()

class ProfileQuestion(BaseModel):
    step: int  # 1: name, 2: age, 3: interests
    question_text: str
    question_type: str  # "text", "number", "select_multiple"
    options: Optional[List[str]] = None

# Hardcoded initial assessment questions
INITIAL_QUESTIONS = [
    {
        "question_number": 1,
        "question_text": "What is your favorite thing to read about?",
        "options": ["Animals", "Adventures", "Science", "Sports", "Fantasy"],
        "correct_answer": "none"  # No correct answer, just preference
    },
    {
        "question_number": 2,
        "question_text": "Read this word: CAT. What does it mean?",
        "options": ["A pet animal", "A vehicle", "A food", "A color"],
        "correct_answer": "A pet animal"
    },
    {
        "question_number": 3,
        "question_text": "Complete the sentence: The dog ____ in the park.",
        "options": ["runs", "run", "running", "ran"],
        "correct_answer": "runs"
    },
    {
        "question_number": 4,
        "question_text": "What is the opposite of 'big'?",
        "options": ["small", "large", "huge", "tall"],
        "correct_answer": "small"
    },
    {
        "question_number": 5,
        "question_text": "Read: 'The sun is bright.' What is bright?",
        "options": ["The sun", "The moon", "The star", "The cloud"],
        "correct_answer": "The sun"
    }
]

# ==================== LOGIN/SIGNUP ====================

@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login with email and password"""
    user = db.query(User).filter(User.email == credentials.email).first()
    
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    access_token = create_access_token(data={"sub": user.id})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=user.id
    )

@router.post("/signup", response_model=TokenResponse)
def signup(credentials: UserSignUp, db: Session = Depends(get_db)):
    """Create a new user account with email and password"""
    print(f"=== SIGNUP DEBUG ===")
    print(f"Email received: {credentials.email}")
    print(f"Password received: {credentials.password}")
    print(f"Password length: {len(credentials.password)}")
    print(f"Password bytes length: {len(credentials.password.encode('utf-8'))}")
    print(f"===================")
    
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == credentials.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user (profile data will be filled later)
    db_user = User(
        email=credentials.email,
        password_hash=hash_password(credentials.password),
        name="",  # Will be filled during profile setup
        age=0,     # Will be filled during profile setup
        interests=[],
        reading_level="beginner"
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    access_token = create_access_token(data={"sub": db_user.id})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user_id=db_user.id
    )

# ==================== PROFILE SETUP (Quiz-style) ====================

@router.get("/profile/setup/{user_id}")
def get_profile_setup_question(step: int, user_id: int, db: Session = Depends(get_db)):
    """Get profile setup question for a specific step"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    questions = {
        1: {
            "step": 1,
            "question_text": "What's your name?",
            "question_type": "text",
            "options": None
        },
        2: {
            "step": 2,
            "question_text": "How old are you?",
            "question_type": "number",
            "options": None
        },
        3: {
            "step": 3,
            "question_text": "What do you like to read about? (Select all that apply)",
            "question_type": "select_multiple",
            "options": ["Animals", "Adventures", "Science", "Sports", "Fantasy", "Space", "Nature", "Music"]
        }
    }
    
    return questions.get(step, {"error": "Invalid step"})

@router.post("/profile/setup/{user_id}")
def update_profile_step(
    user_id: int,
    step: int = Query(...),
    answer: dict = None,
    db: Session = Depends(get_db)
):
    """Update user profile with answer to a setup question"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if answer is None:
        answer = {}
    
    if step == 1:
        user.name = answer.get("value", "")
    elif step == 2:
        user.age = int(answer.get("value", 0))
    elif step == 3:
        user.interests = answer.get("value", [])
    
    db.commit()
    
    return {"status": "success", "step": step}

@router.post("/profile/complete/{user_id}")
def complete_profile(user_id: int, db: Session = Depends(get_db)):
    """Mark profile setup as complete"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not user.name or user.age == 0 or not user.interests:
        raise HTTPException(status_code=400, detail="Please complete all profile fields")
    
    return {"status": "profile_complete"}

# ==================== EXISTING ENDPOINTS ====================

@router.get("/assessment/questions", response_model=List[AssessmentQuestion])
def get_assessment_questions():
    """Get initial assessment questions"""
    return INITIAL_QUESTIONS

@router.post("/assessment/submit", response_model=AssessmentResult)
def submit_assessment(
    user_id: int,
    answers: List[AssessmentAnswer],
    db: Session = Depends(get_db)
):
    """Submit assessment answers and determine reading level"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Calculate score
    correct_count = 0
    for answer in answers:
        question = INITIAL_QUESTIONS[answer.question_number - 1]
        is_correct = answer.user_answer == question["correct_answer"]
        
        # Store assessment response
        assessment = InitialAssessment(
            user_id=user_id,
            question_number=answer.question_number,
            question_text=question["question_text"],
            user_answer=answer.user_answer,
            is_correct=is_correct
        )
        db.add(assessment)
        
        if is_correct and question["correct_answer"] != "none":
            correct_count += 1
    
    # Determine reading level based on score
    total_graded = len([q for q in INITIAL_QUESTIONS if q["correct_answer"] != "none"])
    score = correct_count / total_graded if total_graded > 0 else 0
    
    if score >= 0.8:
        reading_level = "advanced"
        recommendations = ["Complex stories", "Chapter books", "Vocabulary challenges"]
    elif score >= 0.5:
        reading_level = "intermediate"
        recommendations = ["Short stories", "Simple paragraphs", "Basic comprehension"]
    else:
        reading_level = "beginner"
        recommendations = ["Picture books", "Simple words", "Letter recognition"]
    
    # Update user's reading level
    user.reading_level = reading_level
    db.commit()
    
    return AssessmentResult(
        reading_level=reading_level,
        score=score,
        recommendations=recommendations
    )

@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(user_id: int, db: Session = Depends(get_db)):
    """Get user by ID"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

