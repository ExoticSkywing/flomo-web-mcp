## Summary

- 

## Checks Run

```bash
npm run typecheck
npm run typecheck:test
npm test
npm run test:python
npm run build
npm run smoke:stdio
```

## flomo Web Endpoint Assumptions

Describe any endpoint, payload, signature, pagination, or response-shape assumptions changed by this PR. Write `None` if not applicable.

## Security Review

- [ ] No `.env` file is committed.
- [ ] No `FLOMO_AUTHORIZATION` or `FLOMO_COOKIE` value is included.
- [ ] No private memo content, raw flomo response, or sensitive debug log is included.
- [ ] New fixtures are deterministic and sanitized.
