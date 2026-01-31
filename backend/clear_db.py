#!/usr/bin/env python3
"""
Clear database - removes all users and related data
Run this script whenever you want to start fresh
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'reading_app.db')

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Delete all data from tables (in order due to foreign keys)
    tables = [
        'quiz_responses',
        'quizzes',
        'reading_sessions',
        'word_knowledge',
        'initial_assessments',
        'users'
    ]
    
    deleted_counts = {}
    for table in tables:
        try:
            cursor.execute(f"DELETE FROM {table}")
            deleted_counts[table] = cursor.rowcount
        except sqlite3.OperationalError:
            # Table might not exist yet
            deleted_counts[table] = 0
    
    conn.commit()
    conn.close()
    
    print("✅ Database cleared successfully!")
    print("\nDeleted records:")
    for table, count in deleted_counts.items():
        if count > 0:
            print(f"  - {table}: {count} record(s)")
    
    print("\n💡 Remember to also clear localStorage in your browser:")
    print("   1. Press F12 to open DevTools")
    print("   2. Go to Console tab")
    print("   3. Type: localStorage.clear()")
    print("   4. Refresh the page")
    
except Exception as e:
    print(f"❌ Error clearing database: {e}")
