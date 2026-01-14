# Reference Data

Small, stable lookup tables for agent use. **Size limit: <1K rows, <100KB per file.**

## Guidelines

- ✅ Business unit codes, region mappings, department hierarchies
- ✅ Enum values, status codes, category definitions
- ✅ Rarely changing dimension tables (monthly or less)
- ❌ Fact tables or transactional data
- ❌ Anything >100KB — use `execute_sql` instead

## Files

| File | Description | Last Updated |
|------|-------------|--------------|
| (none yet) | Add reference files as needed | - |

## Adding Reference Data

1. Ensure data is <100KB and changes infrequently
2. Use CSV for tabular data, JSON for hierarchical
3. Add entry to this README
4. Update `_index.yaml` if creating one
