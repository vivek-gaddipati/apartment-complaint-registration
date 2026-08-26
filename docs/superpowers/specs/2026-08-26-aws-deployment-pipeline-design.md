# GitHub + GitHub Actions Deployment to AWS (Lambda + S3 + CloudFront) — Design

## Purpose

Move the repository from AWS CodeCommit to GitHub, and deploy the
complaint-app Next.js 14 App Router app to AWS on every merge to `main`
using GitHub Actions — replacing the CodePipeline/CodeBuild approach from
the prior revision of this design by explicit user preference. The target
AWS architecture (S3 + Lambda + CloudFront) is unchanged; only the repo
host and CI/CD engine change.

## Why not plain S3 static hosting

This app is not a static site: `/api/admin/*` and `/api/owner/*` routes
call Google Sheets and Claude server-side, and both owner and admin login
use cookie-based sessions set from server code (`src/lib/auth.ts`). Plain
S3 static website hosting cannot execute any of that. The only way to keep
S3 in the picture while still running the real app is the OpenNext
pattern: static assets served from S3, everything dynamic (pages + API
routes) running as a Lambda function, both fronted by CloudFront — a plain
Lambda Function URL and a plain S3 endpoint would be two separate URLs
with no clean way to unify them under one domain with HTTPS, so CloudFront
stays in the architecture.

## Non-goals (explicitly out of scope for this plan)

- Custom domain / ACM certificate — ships on the default `*.cloudfront.net`
  URL for now; can be added later without rearchitecting anything here.
- A second (dev) environment/stack — single production environment only,
  deployed from `main`. `dev` stays local-only, not auto-deployed anywhere.
- `next/image` optimization and ISR/revalidation Lambdas — this app uses
  `dynamic = "force-dynamic"` everywhere and has no `next/image` usage, so
  OpenNext's optional image-optimization and revalidation functions are not
  deployed even if the build tool emits them.
- CloudFront WAF.
- Automated post-deploy smoke tests against the live CloudFront URL (the
  Playwright suite runs pre-deploy, against a local server, inside the
  GitHub Actions runner — see Testing below).
- OIDC federation between GitHub and AWS — deliberately using a long-lived
  IAM user + access keys stored as GitHub Actions secrets instead, by
  explicit user choice (simpler to set up now; OIDC can replace this later
  without changing the AWS-side application architecture).
- Migrating GitHub issues/PR history from CodeCommit — CodeCommit doesn't
  have issues, and the one merged PR's history stays in CodeCommit; only
  the git commit history and the code move to GitHub.

## Repository Migration

- A new GitHub repository, `vivek-gaddipati/apartment-complaint-registration`
  (matching the CodeCommit repo's name for continuity), becomes the
  **only** source of truth going forward. The CodeCommit repo
  (`apartment-complaint-registration`, us-east-1) is left in place but
  abandoned — not deleted, not force-pushed to again.
- The GitHub repository is **public**, not private. It was created private
  initially, then switched to public partway through implementation:
  GitHub's environment protection rules (the required-reviewer manual
  approval gate the `production` environment relies on, see GitHub Actions
  Workflow below) are not available for private repositories on GitHub's
  Free plan — only for public repositories, or for private ones on a paid
  plan. Making the repo public was the lower-cost way to keep the manual
  approval gate without adding a paid GitHub plan.
- Full git history (all branches, all commits) is pushed to GitHub via
  `git push --mirror` (or an equivalent that preserves `main`, `dev`, and
  the now-merged `infra/aws-deploy-pipeline` branch history) from the
  existing local clone, which already has both remotes reachable.
- Local `origin` remote is repointed to GitHub after the migration; the
  CodeCommit remote can be kept as a secondary remote name (e.g.
  `codecommit`) purely for reference, or removed — implementation detail,
  not a design decision.

## Architecture & Data Flow

(Unchanged from the prior revision of this design — only how it gets
deployed changes, not what gets deployed.)

- **Build tool**: `@opennextjs/aws` (the maintained OpenNext adapter)
  transforms the Next.js production build into: a directory of static
  assets (JS/CSS/fonts/etc.) and a single Lambda-ready "server function"
  bundle that handles every page render and every API route.
- **Static assets** → uploaded to a private S3 bucket, accessed by
  CloudFront only via Origin Access Control (no public bucket policy).
- **Dynamic requests** (pages, `/api/*`) → a single Lambda function (Node
  20.x runtime) running the OpenNext server bundle, exposed via a Lambda
  Function URL with `AuthType: NONE` — publicly invokable, no Origin
  Access Control for Lambda Function URLs in front of it. This is a
  deliberate decision made during a later review round, not an oversight:
  CloudFront's OAC for Lambda Function URLs SigV4-signs the *request*, but
  cannot sign a browser's raw POST body in transit, so an IAM-gated
  Function URL would return 403 on every form submission this app makes
  (complaint creation, PIN setup, admin login, etc.) — the very core of
  the app. The Function URL is therefore public at the transport level;
  the app's own PIN-based owner auth and shared admin password
  (`src/lib/auth.ts`) still gate every sensitive action regardless of how
  the request arrived, and (as noted in Non-goals) there is no WAF in
  this architecture either way, so the public Function URL does not
  change the app's exposure to unauthenticated actions — only to
  unauthenticated *transport*, which the app was never relying on IAM to
  protect against in the first place.
- **CloudFront distribution**: default cache behavior routes to the Lambda
  Function URL origin with caching disabled and cookies/headers forwarded
  (the app is entirely session-based, nothing here is cacheable); a
  path-pattern behavior for `/_next/static/*` and other OpenNext-emitted
  static asset paths routes to the S3 origin with a long cache TTL.
- **Secrets**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
  `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEET_ID`,
  `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET` — six values in
  total — live in SSM Parameter Store as `SecureString` parameters under a
  fixed path prefix (e.g. `/complaint-app/prod/...`), created once
  out-of-band (not part of the CloudFormation stack, since secret values
  should never live in a template). The Lambda's execution role gets
  `ssm:GetParameter` scoped to exactly those six parameter ARNs; the
  function reads them on first *invoke*, not at cold start/INIT — the AWS
  Parameters and Secrets Lambda Extension can only be called during
  Lambda's INVOKE phase, not during INIT, so the handler is wrapped
  (`deploy/lambda-bootstrap.mjs`) to fetch config from inside the handler
  body itself (guarded so it only runs once per warm container) rather
  than at module top level, which would run during INIT and fail.

## AWS Authentication from GitHub Actions

- A dedicated IAM user (e.g. `complaint-app-github-deploy`) is created with
  an attached policy scoped to exactly what the workflow needs: deploying
  the CloudFormation stack (`cloudformation:*` on the one named stack),
  managing that stack's S3 bucket/Lambda function/CloudFront distribution,
  creating a CloudFront invalidation, and `ssm:GetParameter` on the six
  parameter ARNs (needed both by the workflow's test step and to confirm
  the Lambda's own role is correctly scoped). No broader account access —
  this user cannot touch any other AWS resource.
- Its access key ID and secret access key are stored as **GitHub Actions
  repository secrets** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`),
  consumed only by the deploy job via `aws-actions/configure-aws-credentials`.
  Chosen over OIDC federation by explicit user preference — simpler to set
  up, at the cost of a long-lived credential that should be rotated
  periodically (a manual operational task, not automated by this plan).

## GitHub Actions Workflow

Single workflow file, `.github/workflows/deploy.yml`, triggered on push to
`main`:

1. **Build & test job** (runs unconditionally on every push to `main`):
   - `npm ci`
   - `npm run lint`
   - `npx playwright test` — the workflow fails here if any test fails.
     Test-time env vars are populated by having this job also assume the
     deploy IAM user's credentials (read-only in practice, since the job
     only calls `ssm:GetParameter`) to fetch the six SSM parameters,
     matching local `.env.local` usage today.
   - `npx @opennextjs/aws build`
   - Upload the build output (static assets + Lambda bundle) as a workflow
     artifact for the deploy job to consume.
2. **Deploy job** (`needs: build-and-test`, `environment: production`):
   - Targets the GitHub **environment** named `production`, configured
     with you as a required reviewer — the job pauses here and waits for
     approval in the GitHub UI before proceeding, preserving the same
     manual gate the prior CodePipeline design had.
   - On approval: configures AWS credentials from the repository secrets,
     downloads the build artifact, runs `aws cloudformation deploy` against
     `app-stack.yaml` (uploads static assets to S3, updates the Lambda
     function code, updates CloudFront if its config changed), then creates
     a CloudFront invalidation (`/*`) so new static assets serve
     immediately instead of waiting out the old cache TTL.

## Infrastructure (CloudFormation/SAM template)

- **S3 bucket** — private, static assets only, Origin Access Control for
  CloudFront read access.
- **Lambda function** — Node 20.x, runs the OpenNext server bundle, Function
  URL with `AuthType: NONE` (publicly invokable — see the Architecture &
  Data Flow section above for why IAM-gated Function URLs are not
  compatible with this app's POST-body form submissions).
- **Lambda execution role** — CloudWatch Logs write access, plus
  `ssm:GetParameter` scoped to exactly the six SSM parameter ARNs. No
  broader AWS permissions of any kind (this app makes only outbound HTTPS
  calls to Google Sheets and Anthropic; it never touches other AWS
  services at runtime).
- **CloudFront distribution** — two behaviors as described above (default →
  Lambda Function URL, static-asset path patterns → S3), both HTTPS-only,
  on the default `*.cloudfront.net` domain (no ACM certificate needed).
- **One template**, `app-stack.yaml`, defining the S3 bucket, Lambda
  function + execution role, and CloudFront distribution. Unlike the prior
  CodePipeline-based revision, there is no separate "pipeline stack" to
  bootstrap — GitHub Actions itself is the pipeline, defined as a workflow
  file in the repo rather than AWS resources, so the only CloudFormation
  stack is the application infrastructure.
- **SSM Parameters** — the six `SecureString` values, created once
  out-of-band (manual `aws ssm put-parameter` calls or a one-time setup
  script), not managed by the CloudFormation stack itself.
- **IAM user + policy** for GitHub Actions (described above) — created
  once, out-of-band, not managed by the CloudFormation stack itself (a
  deploy credential shouldn't be provisioned by the thing it deploys).

## Testing & Verification

- Before writing the final CloudFormation template: run
  `npx @opennextjs/aws build` locally against this app and inspect the
  actual output directory structure, to confirm (rather than assume) which
  Lambda functions are actually produced and to get exact asset path
  patterns for the CloudFront static-asset behavior — this replaces
  guesswork with a verified build artifact before infrastructure is
  finalized.
- The existing Playwright suite (`e2e/`) runs inside the GitHub Actions
  runner during the build-and-test job, against a locally-started server in
  that runner — not against the deployed CloudFront URL. This keeps the
  workflow from hitting production with test traffic and matches how the
  suite already runs today.
- After the first real deploy: manually smoke-test the CloudFront URL
  end-to-end (owner login/PIN setup, complaint submission, admin
  login/dashboard, owner CRUD, AI insights report) — the Lambda runtime
  (cold starts, SSM-sourced secrets instead of `.env.local`, no persistent
  process) is different enough from local dev that this needs a real,
  manual pass once, the same way local dev-server changes were smoke-tested
  earlier in this project.

## Cost

- **GitHub Actions**: free and unlimited minutes for public repos (this
  repo is public — see Repository Migration above), so the 2,000
  free-minutes/month private-repo cap on GitHub's Free plan doesn't apply
  here at all. No AWS CodePipeline/CodeBuild charges at all with this
  approach — this is strictly cheaper than the prior CodePipeline design's
  ~$1/month pipeline fee (on top of any other pipeline already running in
  the account).
- **Lambda/CloudFront/S3**: free tiers comfortably cover a single
  ~156-unit apartment complex's traffic (low thousands of requests/month),
  as established in the prior cost research this session.
- **SSM Parameter Store**: standard `SecureString` parameters are free.
- **IAM user**: no cost.
- Realistic total: **$0/month**, strictly cheaper than the CodePipeline
  revision of this design since the $1/month-per-pipeline charge no longer
  applies.
