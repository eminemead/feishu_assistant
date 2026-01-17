# Review Recent Commit

Cross-model code review: thoroughly review the most recent commit (or specified range) for bugs, logic errors, and improvements.

## Context Gathering

First, gather context about what was changed:

```bash
# Get last commit info
git log -1 --format='%H%n%s%n%b' HEAD

# Get the full diff
git diff HEAD~1..HEAD

# If this is a feature branch, also show commits since diverging from main
git log main..HEAD --oneline 2>/dev/null || echo "(on main branch)"
```

## Review Checklist

Analyze the diff with a critical eye. For each changed file, check:

### 🐛 Bug Detection
- **Logic errors**: Off-by-one, wrong comparisons, inverted conditions
- **Null/undefined**: Missing null checks, optional chaining needed
- **Async issues**: Race conditions, missing awaits, unhandled promises
- **Edge cases**: Empty arrays, empty strings, zero values, negative numbers
- **Type mismatches**: Wrong types passed, unsafe casts, any-typed escapes

### 🔒 Security
- **Injection**: SQL, command, template injection risks
- **Secrets**: Hardcoded keys, tokens, passwords
- **Input validation**: Unsanitized user input
- **Auth/authz**: Missing permission checks

### 🏗️ Design
- **Breaking changes**: API contracts, function signatures
- **Error handling**: Swallowed errors, missing try/catch, unclear error messages
- **Resource leaks**: Unclosed connections, missing cleanup
- **Performance**: N+1 queries, unnecessary re-renders, missing memoization

### 📝 Code Quality
- **Naming**: Unclear variable/function names
- **Duplication**: Copy-paste code that should be extracted
- **Dead code**: Unused imports, unreachable branches
- **Comments**: Missing context for complex logic, outdated comments

## Output Format

```markdown
## Commit Review: [commit hash short]

**Summary**: [one-line description of what was changed]

### 🔴 Bugs Found (if any)
1. **[severity: critical/high/medium/low]** `file:line` — [description]
   - Why it's a bug: ...
   - Suggested fix: ...

### 🟡 Potential Issues
1. `file:line` — [description]
   - Risk: ...
   - Recommendation: ...

### 🟢 Good Patterns Observed
- [positive feedback on good practices]

### 💡 Suggestions
1. [optional improvements, not bugs]

### Verdict
[ ] ✅ LGTM — Ship it
[ ] 🟡 Minor issues — Fix and ship
[ ] 🔴 Blocking issues — Needs revision
```

## Usage Tips

- Run this command right after completing a feature/fix with another model
- For reviewing a specific commit: `git show <commit-hash>` instead
- For reviewing PR range: `git diff main...HEAD`
- Pair with `/devtools` to also check for runtime errors
