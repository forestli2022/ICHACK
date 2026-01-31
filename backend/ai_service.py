import os
from dotenv import load_dotenv
import openai
from typing import List, Dict

# Load environment variables from .env file
load_dotenv()

# Set OpenAI API key
openai.api_key = os.getenv("OPENAI_API_KEY")

def generate_story(reading_level: str, interests: List[str], age: int, known_words: List[str]) -> Dict:
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
    
    prompt = f"""Write a children's story for a {age}-year-old child at a {reading_level} reading level.

Requirements:
- Word count: {word_count} words
- Topics the child likes: {interests_str}
- Reading level: {reading_level}
- Use simple, age-appropriate language
- Include a clear beginning, middle, and end
- Make it engaging and fun

Please provide:
1. A catchy title (on the first line)
2. The story content (starting from the second line)

Format:
Title: [Your Title Here]
Story: [Your story here]
"""

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a creative children's story writer who creates age-appropriate, engaging stories."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=1000
        )
        
        content = response.choices[0].message.content
        
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

Create a mix of:
1. Reading comprehension questions (what happened in the story)
2. General knowledge questions (simple questions related to story themes)
3. Fill-in-the-blank questions (complete sentences from the story)

For each question, provide:
- type: "reading", "general", or "fill_blank"
- question: The question text
- answer: The correct answer
- options: (for reading and general questions) 4 multiple choice options including the correct answer

Format your response as a JSON array. Example:
[
  {{
    "type": "reading",
    "question": "What did the character do?",
    "answer": "flew in the sky",
    "options": ["flew in the sky", "swam in the ocean", "ran on the ground", "slept all day"]
  }},
  {{
    "type": "fill_blank",
    "question": "The bird loved to ____.",
    "answer": "fly",
    "options": ["fly", "swim", "run", "sleep"]
  }}
]
"""

    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an educational assessment creator for children. Create engaging, age-appropriate quiz questions. Always respond with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=1500
        )
        
        content = response.choices[0].message.content
        
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
