# AWS Deployment Pipeline (CodePipeline + CloudFront + S3) — Design

## Purpose

Deploy the complaint-app Next.js 14 App Router app to AWS on every merge to
`main`, using CodePipeline with CloudFront + S3 as the delivery mechanism —
chosen over AWS Amplify's built-in CI/CD by explicit user preference.

## Why not plain S3 static hosting

This app is not a static site: `/api/admin/*` and `/api/owner/*` routes call
Google Sheets and Claude server-side, and both owner and admin login use
cookie-based sessions set from server code (`src/lib/auth.ts`). Plain S3
static website hosting cannot execute any of that. The only way to keep S3
in the picture while still running the real app is the OpenNext pattern:
static assets served from S3, everything dynamic (pages + API routes)
running as a Lambda function, both fronted by CloudFront.

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
  Playwright suite runs pre-deploy, against a local server, inside
  CodeBuild — see Testing below).

## Architecture & Data Flow

- **Build tool**: `@opennextjs/aws` (the maintained OpenNext adapter)
  transforms the Next.js production build into: a directory of static
  assets (JS/CSS/fonts/etc.) and a single Lambda-ready "server function"
  bundle that handles every page render and every API route.
- **Static assets** → uploaded to a private S3 bucket, accessed by
  CloudFront only via Origin Access Control (no public bucket policy).
- **Dynamic requests** (pages, `/api/*`) → a single Lambda function (Node
  20.x runtime) running the OpenNext server bundle, exposed via a Lambda
  Function URL with `AuthType: AWS_IAM`, invoked only by CloudFront via
  Origin Access Control for Lambda Function URLs (not public).
- **CloudFront distribution**: default cache behavior routes to the Lambda
  Function URL origin with caching disabled and cookies/headers forwarded
  (the app is entirely session-based, nothing here is cacheable); a
  path-pattern behavior for `/_next/static/*` and other OpenNext-emitted
  static asset paths routes to the S3 origin with a long cache TTL.
- **Secrets**: `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `ANTHROPIC_API_KEY`,
  `ADMIN_PASSWORD`, `SESSION_SECRET` live in SSM Parameter Store as
  `SecureString` parameters under a fixed path prefix (e.g.
  `/complaint-app/prod/...`), created once out-of-band (not part of the
  CloudFormation stack, since secret values should never live in a
  template). The Lambda's execution role gets `ssm:GetParameter` scoped to
  exactly those four parameter ARNs; the function reads them at cold start.

## Pipeline Stages

1. **Source** — CodePipeline's CodeCommit source action, triggered on push
   to `main` (repo `apartment-complaint-registration`, us-east-1).
2. **Build** — one CodeBuild project:
   - `npm ci`
   - `npm run lint`
   - `npx playwright test` (build fails the pipeline if any test fails —
     this is the real quality gate, since there's no pre-build approval
     step). CodeBuild's role reads the same four SSM parameters to populate
     test-time env vars, matching local `.env.local` usage today.
   - `npx @opennextjs/aws build`
   - Package the SAM template together with the built Lambda artifact and
     static assets into CloudFormation deploy artifacts.
3. **Manual Approval** — pipeline pauses; a human clicks Approve in the
   CodePipeline console (or via `aws codepipeline put-approval-result`)
   before anything reaches production. Chosen explicitly over auto-deploy:
   this is a real production app now serving actual resident/admin data.
4. **Deploy** — a CloudFormation deploy action applies the SAM template
   (uploads static assets to S3, updates the Lambda function code, updates
   CloudFront if its config changed), followed by a small CodeBuild
   "post-deploy" step that invalidates the CloudFront cache (`/*`) so new
   static assets serve immediately instead of waiting out the old TTL.

## Infrastructure (SAM template)

- **S3 bucket** — private, static assets only, Origin Access Control for
  CloudFront read access.
- **Lambda function** — Node 20.x, runs the OpenNext server bundle, Function
  URL with `AWS_IAM` auth restricted to CloudFront via Origin Access
  Control.
- **Lambda execution role** — CloudWatch Logs write access, plus
  `ssm:GetParameter` scoped to exactly the four SSM parameter ARNs. No
  broader AWS permissions of any kind (this app makes only outbound HTTPS
  calls to Google Sheets and Anthropic; it never touches other AWS
  services at runtime).
- **CloudFront distribution** — two behaviors as described above (default →
  Lambda Function URL, static-asset path patterns → S3), both HTTPS-only,
  on the default `*.cloudfront.net` domain (no ACM certificate needed).
- **Two separate templates**, deployed at different times by different
  actors:
  - `pipeline-stack.yaml` — CodePipeline, the CodeBuild project, and their
    IAM roles. Deployed once, manually, to bootstrap the pipeline itself
    (a pipeline can't deploy its own definition on its first run).
    CodeBuild's role gets read access to the four SSM parameters plus
    whatever's needed to run `aws cloudformation deploy` against the app
    stack during the Deploy stage.
  - `app-stack.yaml` — the S3 bucket, Lambda function, and CloudFront
    distribution described above. This is what the pipeline's Deploy stage
    applies on every run; it is never deployed by hand after the first
    time.
- **SSM Parameters** — the four `SecureString` values, created once
  out-of-band (manual `aws ssm put-parameter` calls or a one-time setup
  script), not managed by the CloudFormation stack itself.

## Testing & Verification

- Before writing the final SAM template: run `npx @opennextjs/aws build`
  locally against this app and inspect the actual output directory
  structure, to confirm (rather than assume) which Lambda functions are
  actually produced and to get exact asset path patterns for the
  CloudFront static-asset behavior — this replaces guesswork with a
  verified build artifact before infrastructure is finalized.
- The existing Playwright suite (`e2e/`) runs inside CodeBuild during the
  Build stage, against a locally-started server in that CodeBuild
  environment — not against the deployed CloudFront URL. This keeps the
  pipeline from hitting production with test traffic and matches how the
  suite already runs today.
- After the first real deploy: manually smoke-test the CloudFront URL
  end-to-end (owner login/PIN setup, complaint submission, admin
  login/dashboard, owner CRUD, AI insights report) — the Lambda runtime
  (cold starts, SSM-sourced secrets instead of `.env.local`, no persistent
  process) is different enough from local dev that this needs a real,
  manual pass once, the same way local dev-server changes were smoke-tested
  earlier in this project.

## Cost

Per the earlier research this session: CodePipeline is $1/month per active
pipeline (first one free), CodeBuild bills per build-minute (a few cents
per build at this app's size), Lambda/CloudFront/S3 all have free tiers
that comfortably cover a single ~156-unit apartment complex's traffic
(low thousands of requests/month, well under any free-tier ceiling), and
SSM Parameter Store standard `SecureString` parameters are free. Realistic
total: at most a few dollars/month, likely near $0.
