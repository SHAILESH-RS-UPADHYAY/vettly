import json

d = json.load(open('context_store/context.json', 'r', encoding='utf-8'))
ip = d.get('structured', {}).get('interviewer_profile', {})

print('=== INTERVIEWER PROFILE CHECK ===')
print(f"Name: {ip.get('name', 'MISSING')}")
print(f"Role: {ip.get('role', 'MISSING')}")
print(f"Philosophy: {ip.get('philosophy', 'MISSING')}")
print(f"Certifications: {len(ip.get('certifications', []))} found")
print(f"Recent Interests: {len(ip.get('recent_interests', []))} topics")
print(f"Key Insights: {len(ip.get('key_insights', []))} items")
print(f"Response Strategies: {len(ip.get('response_strategy', {}))} mapped")

# Check experience
exp = d.get('structured', {}).get('experience', [])
print(f"\nExperience entries: {len(exp)}")
for e in exp:
    print(f"  - {e.get('role')} @ {e.get('company')}")

# Check assignment
assign = d.get('assignment', {})
print(f"\nAssignment: {assign.get('company')} - {assign.get('title')}")

print('\n=== ALL GOOD ===' if ip.get('name') else '\n=== MISSING ===')
