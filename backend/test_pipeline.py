import requests

# 1. Signup
print("1. Testing signup...")
r = requests.post('http://localhost:8000/api/auth/signup', json={
    'email': 'test@example.com',
    'password': 'testpassword123'
})
user_id = r.json()['user_id']
print(f"   Status: {r.status_code}, User ID: {user_id}")

# 2. Step 1 - Name
print("2. Testing profile step 1 (name)...")
r = requests.post(f'http://localhost:8000/api/auth/profile/setup/{user_id}?step=1', json={'value': 'John'})
print(f"   Status: {r.status_code}, Response: {r.json()}")

# 3. Step 2 - Age
print("3. Testing profile step 2 (age)...")
r = requests.post(f'http://localhost:8000/api/auth/profile/setup/{user_id}?step=2', json={'value': 8})
print(f"   Status: {r.status_code}, Response: {r.json()}")

# 4. Step 3 - Interests
print("4. Testing profile step 3 (interests)...")
r = requests.post(f'http://localhost:8000/api/auth/profile/setup/{user_id}?step=3', json={'value': ['Animals', 'Adventures']})
print(f"   Status: {r.status_code}, Response: {r.json()}")

# 5. Complete profile
print("5. Testing profile completion...")
r = requests.post(f'http://localhost:8000/api/auth/profile/complete/{user_id}')
print(f"   Status: {r.status_code}, Response: {r.json()}")

print("\nPipeline test completed successfully!")
