# Issue tracker: GitHub

Issues for this repo live as GitHub issues on `clainkavit/kingdom-connect`. Use the `gh` CLI for all operations. This is the one document that describes how we use the tracker, for the planning skills (`wayfinder`) and the build skills (`implement`, `code-review`).

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with `--label` and `--state` filters as needed.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94 or newer). With an older `gh`, use the GraphQL command under **Create a ticket under the map** below. Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically inside a clone. GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

**PRs as a request surface: no.** External pull requests are not treated as feature requests here.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations (decision tickets)

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

| Operation | How |
|---|---|
| The map | The issue labelled `wayfinder:map`: [Kingdom Connect Phase 1: build-ready spec](https://github.com/clainkavit/kingdom-connect/issues/1) |
| Ticket types | Labels `wayfinder:task`, `wayfinder:research`, `wayfinder:grilling`, `wayfinder:prototype` |
| Child tickets | GitHub sub-issues of the map |
| Blocking | GitHub's native "blocked by" relationship |
| Claim a ticket | Assign it to yourself first, before any work: `gh issue edit <n> --add-assignee @me` |
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

**Find the frontier** (open, unblocked, unclaimed decision tickets)

```sh
for n in $(gh api repos/clainkavit/kingdom-connect/issues/1/sub_issues --jq '.[] | select(.state=="open" and (.assignees|length)==0) | .number'); do
  open=$(gh api repos/clainkavit/kingdom-connect/issues/$n/dependencies/blocked_by --jq '[.[] | select(.state=="open")] | length')
  [ "$open" = 0 ] && gh issue view $n --json number,title --jq '"\(.number)  \(.title)"'
done
```

## Build issues

The build is cut into issues labelled `build`, in three milestones: **Release 1: Core**, **Release 2: Extended** and **Mobile apps**. There is no parent spec issue. Each issue is a separate ticket linked to the others by native "blocked by" links.

- **Title and key.** Every title starts with a key such as `F01` or `R10`. Labels give the area (`area:*`), the size (`size:S`, `size:M`, `size:L`) and `foundation` or `launch` where they apply.
- **What an issue holds.** What it is, what it covers (PRD stories and sections, screens, schema tables, notifications), what to build, and what "done" means, including the tests.
- **The spec is the documents.** For code review, the spec for a build issue is [docs/prd.md](../prd.md), [docs/schema.md](../schema.md), [docs/screens.md](../screens.md) and [docs/notifications.md](../notifications.md), at the parts the issue names.
- **Claim it.** Assign it to yourself before starting: `gh issue edit <n> --add-assignee @me`. Pick only an issue with no open blocker.
- **Branch.** `build/<key>-<slug>`, for example `build/f03-local-supabase`. One issue per branch.
- **Build it.** Run `/implement #<n>` in a fresh session. It commits to the current branch. It does not push or open a pull request.
- **Pull request.** Push the branch and open a pull request with `Closes #<n>` in the description, written in the `/pr` format. The other person reviews and merges.
- **Close.** Merging closes the issue.

**Find the next build issue** (open, unblocked, unclaimed)

```sh
for n in $(gh issue list --repo clainkavit/kingdom-connect --label build --state open --limit 200 --json number,assignees --jq '.[] | select(.assignees|length==0) | .number'); do
  open=$(gh api repos/clainkavit/kingdom-connect/issues/$n/dependencies/blocked_by --jq '[.[] | select(.state=="open")] | length')
  [ "$open" = 0 ] && gh issue view $n --repo clainkavit/kingdom-connect --json number,title --jq '"\(.number)  \(.title)"'
done
```

## Where outputs go

- Decisions: the resolving ticket's comment, then `docs/prd.md`.
- Research findings: `context/memory/<slug>.md`, indexed in `context/memory.md`.
- New terms: `context/GLOSSARY.md`.
