import json

with open("context_store/context.json", "r", encoding="utf-8") as f:
    d = json.load(f)

s = d.get("structured", {})
print("STRUCTURED KEYS:", list(s.keys()))
print("---")
print("EXPERIENCE:")
for e in s.get("experience", []):
    print(f"  - {e.get('company','?')} | {e.get('role','?')}")
print("PROJECTS:")
for p in s.get("projects", []):
    print(f"  - {p.get('name','?')}")
print("QA_BANK count:", len(s.get("qa_bank", [])))
print("---")
print("ASSIGNMENT:", json.dumps(d.get("assignment", {}), indent=2)[:500])
print("---")
print("RESUME keys:", list(d.get("resume", {}).keys()))
print("GITHUB username:", d.get("github", {}).get("username", "N/A"))
