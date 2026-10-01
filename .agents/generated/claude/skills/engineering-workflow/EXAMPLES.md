# engineering-workflow Examples — Anti-patterns vs ContextOS Standard

## Example 1: Handling a New Feature Request

### Anti-pattern: Jumping Straight to Code

```text
User: "Add a user referral system."
Agent: Immediately creates src/referral.js, starts writing database queries, guesses schema,
and misses requirements like rate limiting, expiry dates, and fraud prevention.
```

### Best practice: ContextOS Standard (DEFINE -> PLAN -> BUILD)

```markdown
[DOMAIN: Full-Stack] [PHASE: Define] [ROLE: Product Manager]
Skills loaded: engineering-workflow, interview-me

## Feature Spec: User Referral System
### Why (Problem)
Increase user acquisition through organic word-of-mouth incentives.

### Scope
In-Scope:
- Unique referral code generation per registered user
- Referral code attribution on signup
- Credit reward trigger after first completed purchase
Out-of-Scope:
- Multi-tier MLM rewards
- Cash payout integrations

### Acceptance Criteria
- [ ] Given a registered user, when visiting /referrals, then unique code is displayed.
- [ ] Given a new user with code, when signing up, then referrer_id is stored with status 'pending'.
```

---

## Example 2: Atomic Task Execution in PLAN Phase

### Anti-pattern: Monolithic Mega-Task

```text
Task: "Implement entire referral system end-to-end in one shot."
Result: 15 files modified simultaneously, uncompilable intermediate state, untestable diff.
```

### Best practice: ContextOS Standard (Atomic Tasks with Test Gate)

```markdown
[DOMAIN: Full-Stack] [PHASE: Plan] [ROLE: Architect]
Atomic Tasks:
1. Database migration: referrals and referral_rewards tables + indexes. (Test: Migration rollback & apply)
2. Domain service: ReferralService.createCode() and ReferralService.claimCode(). (Test: Unit tests)
3. API route: POST /api/referrals/claim with Zod validation. (Test: Supertest integration)
4. UI component: <ReferralCard /> with copy button. (Test: RTL component test)
```
