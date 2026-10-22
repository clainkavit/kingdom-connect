# Wayfinding on this repo

The tracker for the `wayfinder` skill (in `.claude/skills/`). The map and its tickets are GitHub Issues on `clainkavit/kingdom-connect`.

## Wayfinding operations

| Operation | How |
|---|---|
| The map | The issue labelled `wayfinder:map`: [Kingdom Connect Phase 1: build-ready spec](https://github.com/clainkavit/kingdom-connect/issues/1) |
| Ticket types | Labels `wayfinder:task`, `wayfinder:research`, `wayfinder:grilling`, `wayfinder:prototype` |
| Child tickets | GitHub sub-issues of the map |
| Blocking | GitHub's native "blocked by" relationship |
| Claim a ticket | Assign it to yourself, first, before any work: `gh issue edit <n> --add-assignee @me` |
| Resolve a ticket | Post a resolution comment, close the issue, add one line to the map's "Decisions so far" |

**Create a ticket under the map**

```sh
gh issue create --title "<question as a title>" --label "wayfinder:grilling" --body "## Question

<the decision this ticket resolves>"
```

Then attach it to the map and wire blocking (GraphQL needs node ids):

```sh
nid(){ gh api repos/clainkavit/kingdom-connect/issues/$1 --jq .node_id; }
gh api graphql -f query='mutation($p:ID!,$c:ID!){addSubIssue(input:{issueId:$p,subIssueId:$c}){issue{number}}}' -f p=$(nid 1) -f c=$(nid <new>)
gh api graphql -f query='mutation($i:ID!,$b:ID!){addBlockedBy(input:{issueId:$i,blockingIssueId:$b}){issue{number}}}' -f i=$(nid <blocked>) -f b=$(nid <blocker>)
```

**Find the frontier** (open, unblocked, unclaimed tickets)

```sh
for n in $(gh api repos/clainkavit/kingdom-connect/issues/1/sub_issues --jq '.[] | select(.state=="open" and (.assignees|length)==0) | .number'); do
  open=$(gh api repos/clainkavit/kingdom-connect/issues/$n/dependencies/blocked_by --jq '[.[] | select(.state=="open")] | length')
  [ "$open" = 0 ] && gh issue view $n --json number,title --jq '"\(.number)  \(.title)"'
done
```

## Where outputs go

- Decisions: the resolving ticket's comment, then `docs/prd.md`.
- Research findings: `context/memory/<slug>.md`, indexed in `context/memory.md`.
- New terms: `context/GLOSSARY.md`.
