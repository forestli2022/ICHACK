import os
from dotenv import load_dotenv
from typing import List, Dict, Optional

from google import genai

# Load environment variables from .env file
load_dotenv()

# Set OpenAI/OpenRouter API config
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")

def _get_gemini_client():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=GEMINI_API_KEY)

def generate_story(
    reading_level: str,
    interests: List[str],
    age: int,
    known_words: List[str],
    focus_words: Optional[List[str]] = None,
    style_hint: Optional[str] = None,
    avoid_titles: Optional[List[str]] = None,
    recent_story_context: Optional[str] = None
) -> Dict:
    """
    Generate a story using OpenAI GPT based on user's reading level and interests.
    
    API: OpenAI GPT-4 or GPT-3.5-turbo
    API Key Required: Yes - set OPENAI_API_KEY environment variable
    Sign up at: https://platform.openai.com/
    """
    
    # Create prompt based on reading level
    word_count = {
        "beginner": "50-100",
        "intermediate": "150-250",
        "advanced": "300-500"
    }.get(reading_level, "100-150")
    
    interests_str = ", ".join(interests) if interests else "animals and adventures"
    
    focus_words = focus_words or []
    focus_words_str = ", ".join(focus_words)

    focus_requirement = (
        f"- Include and naturally use these focus words: {focus_words_str}"
        if focus_words
        else "- No required focus words"
    )
    
    avoid_titles = avoid_titles or []
    avoid_requirement = (
        f"\n- Avoid these recent title themes: {', '.join(avoid_titles)}"
        if avoid_titles
        else ""
    )
    
    style_hint_text = (
        f"\n- Additional style requirements: {style_hint}"
        if style_hint
        else ""
    )

    # Build context about recent stories to avoid duplicates
    recent_context_text = ""
    if recent_story_context:
        recent_context_text = f"\n- Do NOT create stories similar to these recent stories the user has already read:\n{recent_story_context}"

    prompt = f"""Write a children's story for a {age}-year-old child at a {reading_level} reading level.

Requirements:
- Word count: {word_count} words
- Topics the child likes: {interests_str}
- Reading level: {reading_level}
- {focus_requirement}{avoid_requirement}{style_hint_text}{recent_context_text}
- Use simple, age-appropriate language
- Include a clear beginning, middle, and end
- Make it engaging and fun
- Do NOT use markdown formatting (no **, __, *, _, #, etc.)
- Write in plain text only

Please provide:
1. A catchy title (on the first line)
2. The story content (starting from the second line)

Format:
Title: [Your Title Here]
Story: [Your story here]
"""

    try:
        client = _get_gemini_client()
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        content = (response.text or "").strip()
        if not content:
            raise RuntimeError(f"Gemini response missing text: {response}")
        
        # Parse title and story
        lines = content.strip().split('\n')
        title = "A Wonderful Story"
        story_content = content
        
        for i, line in enumerate(lines):
            if line.startswith("Title:"):
                title = line.replace("Title:", "").strip()
                story_content = '\n'.join(lines[i+1:]).replace("Story:", "").strip()
                break
        
        return {
            "title": title,
            "content": story_content
        }
    
    except Exception as e:
        # Fallback story if API fails
        print(f"Error generating story: {e}")
        return {
            "title": "The Little Bird",
            "content": "Once upon a time, there was a little bird. The bird loved to fly. Every day, the bird would fly high in the sky. One day, the bird met a friend. They flew together and had fun. The end."
        }

def generate_quizzes(story_content: str, reading_level: str, user_age: int, recent_performance: List[Dict]) -> List[Dict]:
    """
    Generate quizzes based on the story using OpenAI GPT.
    
    API: OpenAI GPT-4 or GPT-3.5-turbo
    API Key Required: Yes - set OPENAI_API_KEY environment variable
    """
    
    # Determine number of questions based on reading level
    num_questions = {
        "beginner": 3,
        "intermediate": 5,
        "advanced": 7
    }.get(reading_level, 4)
    
    prompt = f"""Based on the following story, create {num_questions} quiz questions for a {user_age}-year-old child at a {reading_level} reading level.

Story:
{story_content}

Create a mix of these question types:
1. Reading comprehension ("reading" type) - multiple choice: what happened in the story
2. General knowledge ("general" type) - open-ended: simple questions related to story themes
3. Fill-in-the-blank ("fill_blank" type) - open-ended: complete sentences from the story
4. Pronunciation practice ("pronunciation" type) - special: read a portion of the story aloud

IMPORTANT: 
- ALWAYS include ONE "pronunciation" type question
- Vary the other question types! Don't make them all the same type.

For each question, provide:
- type: "reading" (multiple choice), "general" (open-ended), "fill_blank" (open-ended), or "pronunciation" (read-aloud)
- question: The question text
- answer: The correct answer (key words/phrase for open-ended; full passage text for pronunciation)
- options: ONLY for "reading" type. 4 multiple choice options including the correct answer. Omit for other types.

Format your response as a JSON array. Examples:

Reading question (multiple choice):
{{
  "type": "reading",
  "question": "What did the character do?",
  "answer": "flew in the sky",
  "options": ["flew in the sky", "swam in the ocean", "ran on the ground", "slept all day"]
}}

Fill-in-the-blank (open-ended, NO options):
{{
  "type": "fill_blank",
  "question": "The bird loved to ____.",
  "answer": "fly"
}}

General knowledge (open-ended, NO options):
{{
  "type": "general",
  "question": "Why do you think the bird was happy?",
  "answer": "because it had a friend"
}}

Pronunciation (read-aloud, NO options):
{{
  "type": "pronunciation",
  "question": "Read this part of the story aloud clearly:",
  "answer": "Once upon a time, there was a little bird. The bird loved to fly."
}}

REMEMBER: 
- Always include ONE "pronunciation" question with a passage from the story
- Only include "options" field for "reading" type questions."""

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )

        content = (response.text or "").strip()
        if not content:
            raise RuntimeError(f"Gemini response missing text: {response}")
        
        # Try to parse JSON response
        import json
        # Remove markdown code blocks if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        quizzes = json.loads(content)
        return quizzes
    
    except Exception as e:
        # Fallback quizzes if API fails
        print(f"Error generating quizzes: {e}")
        return [
            {
                "type": "reading",
                "question": "What is the story about?",
                "answer": "A story about learning",
                "options": ["A story about learning", "A cooking recipe", "A math problem", "A song"]
            },
            {
                "type": "fill_blank",
                "question": "Complete this sentence: Reading is ____.",
                "answer": "fun",
                "options": ["fun", "boring", "hard", "scary"]
            }
        ]

def determine_reading_level(assessment_score: float, age: int) -> str:
    """Determine reading level based on assessment score and age"""
    if age < 6:
        return "beginner"
    elif age < 9:
        if assessment_score >= 0.7:
            return "intermediate"
        else:
            return "beginner"
    else:
        if assessment_score >= 0.8:
            return "advanced"
        elif assessment_score >= 0.5:
            return "intermediate"
        else:
            return "beginner"

def analyze_word_familiarity(words: List[str], user_responses: List[Dict]) -> Dict[str, float]:
    """Analyze which words the user is familiar with based on their responses"""
    word_scores = {}
    
    for word in words:
        # Simple heuristic: if word appears in correct answers, increase familiarity
        score = 0.5  # neutral starting point
        for response in user_responses:
            if word.lower() in response.get("answer", "").lower():
                if response.get("correct", False):
                    score += 0.1
                else:
                    score -= 0.05
        
        word_scores[word] = max(0.0, min(1.0, score))
    
    return word_scores

def validate_open_ended_answer(story_content: str, question_text: str, user_answer: str) -> Dict:
    """
    Use Gemini to validate open-ended answers (fill_blank, general) against the story.
    Returns whether the answer makes sense and a confidence score.
    """
    if not user_answer or not user_answer.strip():
        return {"is_valid": False, "confidence": 0.0, "reasoning": "Answer is empty"}
    
    validation_prompt = f"""You are grading a child's reading comprehension answer.

Story:
{story_content}

Question: {question_text}
Student's Answer: {user_answer}

Determine if the student's answer is reasonable/correct based on the story. Consider:
1. Does it match the story content?
2. Is it grammatically reasonable for the question type?
3. Does it show understanding of the story?

Respond ONLY with JSON in this exact format:
{{
  "is_valid": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}}

Do NOT include markdown code blocks, just raw JSON."""

    try:
        client = _get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=validation_prompt
        )
        
        content = (response.text or "").strip()
        if not content:
            return {"is_valid": False, "confidence": 0.5, "reasoning": "Validation failed"}
        
        import json
        # Remove markdown if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        result = json.loads(content)
        return result
    except Exception as e:
        print(f"Error validating answer: {e}")
        # Conservative default: mark as invalid on error
        return {"is_valid": False, "confidence": 0.5, "reasoning": f"Validation error: {str(e)}"}

