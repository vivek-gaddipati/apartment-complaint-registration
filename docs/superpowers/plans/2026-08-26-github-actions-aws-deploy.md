# GitHub + GitHub Actions AWS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the repo to GitHub and stand up a GitHub Actions pipeline that deploys complaint-app to AWS (S3 static assets + Lambda running the app via OpenNext + CloudFront routing between them), with app secrets pulled from SSM Parameter Store at runtime and a manual-approval gate before every production deploy.

**Architecture:** `@opennextjs/aws` (already installed, pinned to `3.9.12` — the last version compatible with this app's Next.js 14.2.35) transforms the Next.js build into static assets + a Lambda bundle. A small wrapper handler fetches the app's 6 config values from SSM Parameter Store via the AWS Parameters and Secrets Lambda Extension before delegating to the real OpenNext handler. One CloudFormation/SAM template defines the S3 bucket, Lambda function + role, and CloudFront distribution (two Origin Access Controls, one per origin). GitHub Actions runs lint + Playwright on every push to `main`, then — after a required manual approval on a `production` environment — deploys via the SAM CLI using a dedicated IAM user's access keys stored as repo secrets.

**Tech Stack:** Next.js 14 (App Router), `@opennextjs/aws` 3.9.12, AWS SAM CLI, CloudFormation, S3, Lambda (Node 20.x), CloudFront, SSM Parameter Store, GitHub Actions, GitHub CLI (`gh`), AWS CLI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-aws-deployment-pipeline-design.md` — every requirement in it applies to every task below.
- **No custom domain / ACM certificate** — ships on the default `*.cloudfront.net` URL.
- **Single production environment only**, deployed from `main`. No second (dev) stack.
- **No `next/image` optimization, no ISR/revalidation infrastructure, no CloudFront WAF, no Lambda warmer** — this app uses `dynamic = "force-dynamic"` everywhere, has no `next/image` usage, and is low-traffic. Already verified: `open-next.config.ts` (committed) disables the incremental cache, tag cache, and revalidation queue; confirmed via a real build that this drops S3-cache-bucket/DynamoDB/SQS from the output manifest entirely.
- **`@opennextjs/aws` must stay pinned to exactly `3.9.12`** (no `^` or `~` range) — `3.9.13` and all `4.x` releases require Next.js ≥15, which this app cannot use. This is already fixed in `package.json`.
- **AWS auth for GitHub Actions is a dedicated IAM user's access keys stored as GitHub repository secrets** (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) — not OIDC, by explicit user choice.
- **Manual approval required before every deploy** — a GitHub `production` environment with a required reviewer, not auto-deploy.
- **Secrets never appear in the CloudFormation template, in git, or as plaintext Lambda environment variables** — they live in SSM Parameter Store as `SecureString` and are fetched by the Lambda at invocation time via the AWS Parameters and Secrets Lambda Extension (verified: this extension cannot be invoked during Lambda's INIT phase, only during INVOKE — the fetch must happen inside the handler body, not at module top level).
- AWS account: `227912367863`, region `us-east-1` (same account/region as the existing CodeCommit repo and IAM user already used in this project this session).
- GitHub: authenticated as `vivek-gaddipati` (confirmed via `gh auth status` — token has `repo` and `workflow` scopes).
- This project has **no unit test framework** — only Playwright e2e (`npm run test:e2e` / `npx playwright test`) and manual verification. Every task below verifies with real commands, not invented test files.

---

### Task 1: Migrate the repository to GitHub

**Files:** none (git/GitHub operations only).

**Interfaces:**
- Produces: a GitHub repository `vivek-gaddipati/apartment-complaint-registration` containing the full history of `main`, `dev`, and `infra/aws-deploy-pipeline`. Local `origin` remote repointed to GitHub (CodeCommit remote renamed to `codecommit`, kept for reference, never pushed to again). All later tasks in this plan commit and push to GitHub.

- [ ] **Step 1: Create the GitHub repository**

```bash
cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app
gh repo create vivek-gaddipati/apartment-complaint-registration --private \
  --description "Apartment complaint registration app (Next.js + Google Sheets), deployed to AWS via GitHub Actions"
```

Expected: prints the new repo's URL (`https://github.com/vivek-gaddipati/apartment-complaint-registration`). No `--source`/`--push` flags — the repo is created empty; Step 3 pushes the existing history explicitly so every branch (not just the current one) is included.

- [ ] **Step 2: Repoint remotes**

```bash
git remote rename origin codecommit
git remote add origin https://github.com/vivek-gaddipati/apartment-complaint-registration.git
git remote -v
```

Expected: `origin` now points at the GitHub URL (fetch and push), `codecommit` points at the old `codecommit::us-east-1://apartment-complaint-registration` URL.

- [ ] **Step 3: Push full history**

```bash
git push origin --mirror
```

Expected: pushes `main`, `dev`, and `infra/aws-deploy-pipeline` (and any other local refs) to GitHub in one shot, preserving full commit history.

- [ ] **Step 4: Set upstream tracking for the branches in use**

```bash
git checkout main && git branch --set-upstream-to=origin/main main
git checkout infra/aws-deploy-pipeline && git branch --set-upstream-to=origin/infra/aws-deploy-pipeline infra/aws-deploy-pipeline
```

`--mirror` doesn't set up tracking branches, so a plain `git push`/`git pull` after this would otherwise error or target the wrong thing. Confirm you end this step back on `infra/aws-deploy-pipeline`, since that's where the rest of this plan's work happens.

- [ ] **Step 5: Verify**

```bash
gh repo view vivek-gaddipati/apartment-complaint-registration --json defaultBranchRef,pushedAt
git ls-remote origin
```

Expected: the repo view shows a recent `pushedAt` timestamp; `git ls-remote origin` lists `refs/heads/main`, `refs/heads/dev`, `refs/heads/infra/aws-deploy-pipeline` with SHAs matching `git rev-parse main dev infra/aws-deploy-pipeline` locally.

- [ ] **Step 6: Commit**

Nothing to commit — this task is pure git/GitHub operations, no file changes. Mark the task checkbox complete once Step 5's verification passes.

---

### Task 2: Lambda bootstrap wrapper for SSM-sourced config

**Files:**
- Create: `deploy/lambda-bootstrap.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure new file). At runtime, consumes the AWS Parameters and Secrets Lambda Extension's local HTTP API (`http://localhost:2773/systemsmanager/parameters/get`) and the `SSM_PARAMETER_PREFIX` environment variable (set by the CloudFormation template in Task 3).
- Produces: `export const handler` — an AWS Lambda handler function with the exact same signature OpenNext's own generated `index.mjs` handler has (`(event, context) => Promise<result>`), which Task 3's CloudFormation template references as the Lambda's `Handler` property (`bootstrap-handler.handler`, once the build step in Task 4 copies this file next to `index.mjs` in the OpenNext output and it's referenced under that filename — see Task 4 Step 2 for the exact copy step).

- [ ] **Step 1: Write the wrapper**

Create `deploy/lambda-bootstrap.mjs`:

```js
// Wraps OpenNext's generated Lambda handler (index.mjs, sitting alongside
// this file once copied into .open-next/server-functions/default/ by the
// build — see .github/workflows/deploy.yml) to load this app's 6 required
// env vars from SSM Parameter Store before the first real request is
// served.
//
// This can't run at module top level: the AWS Parameters and Secrets
// Lambda Extension can only be called during Lambda's INVOKE phase, not
// during INIT (verified against AWS's own docs) — so the fetch happens
// inside the handler, guarded by a flag so it only runs once per warm
// container, not on every invocation.
const EXTENSION_PORT = 2773;
const REQUIRED_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_SHEET_ID",
  "ANTHROPIC_API_KEY",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
];

let configLoaded = false;

async function loadConfigFromSsm() {
  if (configLoaded) return;

  const prefix = process.env.SSM_PARAMETER_PREFIX;
  if (!prefix) {
    throw new Error("SSM_PARAMETER_PREFIX environment variable is not set.");
  }

  // Read fresh on every cold start rather than caching at module scope, so
  // this stays correct regardless of how Lambda resolved the session
  // credentials for this particular init.
  const token = process.env.AWS_SESSION_TOKEN;
  if (!token) {
    throw new Error("AWS_SESSION_TOKEN environment variable is not set.");
  }

  for (const key of REQUIRED_KEYS) {
    const paramName = encodeURIComponent(`${prefix}${key}`);
    const url = `http://localhost:${EXTENSION_PORT}/systemsmanager/parameters/get?name=${paramName}&withDecryption=true`;
    const res = await fetch(url, {
      headers: { "X-Aws-Parameters-Secrets-Token": token },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to load SSM parameter "${prefix}${key}": HTTP ${res.status}`
      );
    }
    const body = await res.json();
    process.env[key] = body.Parameter.Value;
  }

  configLoaded = true;
}

export const handler = async (event, context) => {
  await loadConfigFromSsm();
  // Deferred until after config is loaded: if the real handler's module
  // does any top-level work that reads process.env (Next.js server
  // singletons, etc.), it must not run before the env vars above are set.
  // Dynamic import is cached by Node after the first call, so this is a
  // no-op re-import (not a re-evaluation) on every subsequent invocation
  // in the same warm container.
  const { handler: openNextHandler } = await import("./index.mjs");
  return openNextHandler(event, context);
};
```

- [ ] **Step 2: Lint**

```bash
cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app
npm run lint
```

Expected: `✔ No ESLint warnings or errors`. (This file lives under `deploy/`, outside `src/`, but the project's ESLint config lints the whole repo by default — confirm it's actually picked up; if lint reports it as unlinted/ignored, that's fine too, just note it in the report.)

- [ ] **Step 3: Verify it can't be evaluated standalone (sanity check only, not a real test)**

There's no way to invoke this against a real Lambda extension locally, and no unit test framework in this project to mock one. Instead, verify by reading: confirm the file has no top-level `await` or top-level code that touches `process.env.GOOGLE_...`/`ANTHROPIC_API_KEY`/etc. before `loadConfigFromSsm()` is called — a `grep` for those variable names outside the `REQUIRED_KEYS` array and the function bodies above should return nothing.

```bash
grep -n "process\.env\.\(GOOGLE_\|ANTHROPIC_\|ADMIN_PASSWORD\|SESSION_SECRET\)" deploy/lambda-bootstrap.mjs
```

Expected: no output (these names only appear inside the `REQUIRED_KEYS` array as strings, never as direct `process.env.X` reads in this file — the real reads happen in the imported OpenNext bundle, after config is loaded).

- [ ] **Step 4: Commit**

```bash
git add deploy/lambda-bootstrap.mjs
git commit -m "Add Lambda wrapper that loads app config from SSM before serving requests"
git push origin infra/aws-deploy-pipeline
```

---

### Task 3: CloudFormation/SAM template for the AWS infrastructure

**Files:**
- Create: `deploy/app-stack.yaml`

**Interfaces:**
- Consumes: `deploy/lambda-bootstrap.mjs` (Task 2) as the Lambda's handler entrypoint (referenced by name, `bootstrap-handler.handler` — the actual file is copied and renamed into the build output by Task 4's workflow, not by this template). Consumes the real OpenNext output structure verified this session: static assets copy from `.open-next/assets` to an S3 prefix `_assets/` (with `_next/` as the long-cache subdirectory); the server Lambda bundle lives at `.open-next/server-functions/default/`; CloudFront behavior precedence must route `_next/data/*` to the Lambda origin with *higher* precedence than the broader `_next/*` → S3 behavior, exactly matching the order OpenNext's own `open-next.output.json` manifest lists them in (verified this session).
- Produces: a CloudFormation template with `Parameters: [SsmParameterPrefix]` and `Outputs: [DistributionDomainName, FunctionName, AssetsBucketName]` — Task 4's workflow reads these via `aws cloudformation describe-stacks` after deploy (the domain name for the smoke test, the other two for the asset-sync and cache-invalidation steps).

- [ ] **Step 1: Write the template**

Create `deploy/app-stack.yaml`:

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: >
  complaint-app production infrastructure: S3 (static assets) + Lambda
  (OpenNext server, via the SSM-sourced-config wrapper) + CloudFront
  (routes between them). No custom domain, single environment.

Parameters:
  SsmParameterPrefix:
    Type: String
    Default: /complaint-app/prod/
    Description: >
      Path prefix under which the app's 6 config values live in SSM
      Parameter Store (all SecureString). Must end with a trailing slash.

Resources:
  # ---------------------------------------------------------------------
  # Static assets
  # ---------------------------------------------------------------------
  AssetsBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Sub "complaint-app-assets-${AWS::AccountId}"
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  AssetsBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref AssetsBucket
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Sid: AllowCloudFrontReadViaOAC
            Effect: Allow
            Principal:
              Service: cloudfront.amazonaws.com
            Action: s3:GetObject
            Resource: !Sub "${AssetsBucket.Arn}/*"
            Condition:
              StringEquals:
                AWS:SourceArn: !Sub "arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}"

  S3OriginAccessControl:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub "complaint-app-s3-oac-${AWS::AccountId}"
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  # ---------------------------------------------------------------------
  # Server Lambda
  # ---------------------------------------------------------------------
  ServerFunctionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "complaint-app-server-role-${AWS::AccountId}"
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: complaint-app-server-policy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Sid: Logs
                Effect: Allow
                Action:
                  - logs:CreateLogGroup
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource: !Sub "arn:aws:logs:${AWS::Region}:${AWS::AccountId}:*"
              - Sid: ReadAppConfigFromSsm
                Effect: Allow
                Action: ssm:GetParameter
                Resource: !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter${SsmParameterPrefix}*"
              - Sid: DecryptAppConfig
                Effect: Allow
                Action: kms:Decrypt
                Resource: !Sub "arn:aws:kms:${AWS::Region}:${AWS::AccountId}:alias/aws/ssm"

  ServerFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub "complaint-app-server-${AWS::AccountId}"
      Runtime: nodejs20.x
      Handler: bootstrap-handler.handler
      MemorySize: 512
      Timeout: 15
      Role: !GetAtt ServerFunctionRole.Arn
      Code:
        # Placeholder — GitHub Actions overwrites this function's code via
        # `sam deploy` packaging on every real deploy (Task 4). This
        # minimal inline stub only exists so the template is valid and
        # deployable in isolation (e.g. for `sam validate`); it is never
        # what actually serves traffic once Task 4's workflow has run once.
        ZipFile: |
          exports.handler = async () => ({
            statusCode: 200,
            body: "placeholder — deploy via GitHub Actions to replace this",
          });
      Environment:
        Variables:
          SSM_PARAMETER_PREFIX: !Ref SsmParameterPrefix
      Layers:
        - !Sub "{{resolve:ssm:/aws/service/aws-parameters-and-secrets-lambda-extension/x86/latest}}"

  ServerFunctionUrl:
    Type: AWS::Lambda::Url
    Properties:
      TargetFunctionArn: !GetAtt ServerFunction.Arn
      AuthType: AWS_IAM

  ServerFunctionUrlPermission:
    Type: AWS::Lambda::Permission
    Properties:
      Action: lambda:InvokeFunctionUrl
      FunctionName: !Ref ServerFunction
      Principal: cloudfront.amazonaws.com
      FunctionUrlAuthType: AWS_IAM
      SourceArn: !Sub "arn:aws:cloudfront::${AWS::AccountId}:distribution/${Distribution}"

  LambdaOriginAccessControl:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub "complaint-app-lambda-oac-${AWS::AccountId}"
        OriginAccessControlOriginType: lambda
        SigningBehavior: always
        SigningProtocol: sigv4

  # ---------------------------------------------------------------------
  # CloudFront
  # ---------------------------------------------------------------------
  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        HttpVersion: http2
        Origins:
          - Id: s3-assets
            DomainName: !GetAtt AssetsBucket.RegionalDomainName
            OriginPath: /_assets
            OriginAccessControlId: !GetAtt S3OriginAccessControl.Id
            S3OriginConfig:
              OriginAccessIdentity: ""
          - Id: lambda-server
            # Function URLs are exposed as HTTPS hostnames of the form
            # <url-id>.lambda-url.<region>.on.aws — strip the leading
            # "https://" and trailing "/" that FunctionUrl returns.
            DomainName: !Select
              - 2
              - !Split
                - "/"
                - !GetAtt ServerFunctionUrl.FunctionUrl
            OriginAccessControlId: !GetAtt LambdaOriginAccessControl.Id
            CustomOriginConfig:
              OriginProtocolPolicy: https-only
              OriginSSLProtocols:
                - TLSv1.2
        DefaultCacheBehavior:
          TargetOriginId: lambda-server
          ViewerProtocolPolicy: redirect-to-https
          AllowedMethods: [GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE]
          CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad # AWS Managed-CachingDisabled
          OriginRequestPolicyId: 216adef6-5c7f-47e4-b989-5492eafa07d3 # AWS Managed-AllViewer
        CacheBehaviors:
          # Order matters: CloudFront evaluates behaviors top-to-bottom and
          # uses the first match. _next/data/* must be listed before the
          # broader _next/* pattern below, exactly matching the order
          # OpenNext's own build manifest lists them in (verified this
          # session) — otherwise data-fetch requests would incorrectly
          # fall through to the S3 origin, which doesn't have them.
          - PathPattern: _next/data/*
            TargetOriginId: lambda-server
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods: [GET, HEAD, OPTIONS]
            CachePolicyId: 4135ea2d-6df8-44a3-9df3-4b5a84be39ad # CachingDisabled
            OriginRequestPolicyId: 216adef6-5c7f-47e4-b989-5492eafa07d3 # AllViewer
          - PathPattern: BUILD_ID
            TargetOriginId: s3-assets
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods: [GET, HEAD]
            CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6 # AWS Managed-CachingOptimized
          - PathPattern: _next/*
            TargetOriginId: s3-assets
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods: [GET, HEAD]
            CachePolicyId: 658327ea-f89d-4fab-a63d-7e88639e58f6 # CachingOptimized

Outputs:
  DistributionDomainName:
    Description: The CloudFront URL the app is reachable at.
    Value: !GetAtt Distribution.DomainName
  FunctionName:
    Description: The Lambda function name, for post-deploy code updates.
    Value: !Ref ServerFunction
  AssetsBucketName:
    Description: The S3 bucket static assets sync to.
    Value: !Ref AssetsBucket
```

**Notes for the implementer, not part of the template file itself:**
- The CloudFront-managed cache policy IDs above (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad` for CachingDisabled, `216adef6-5c7f-47e4-b989-5492eafa07d3` for AllViewer, `658327ea-f89d-4fab-a63d-7e88639e58f6` for CachingOptimized) are AWS's fixed, publicly documented managed policy IDs — the same in every AWS account and region. Do not treat these as placeholders to fill in; they're real, stable values.
- The `ServerFunction`'s inline `ZipFile` stub exists only so `sam validate`/a from-scratch `sam deploy` doesn't fail on a missing `CodeUri`. Task 4's workflow always deploys real code over it immediately.
- `AWS::Lambda::Url`'s `FunctionUrl` output is a full URL string (e.g. `https://abc123.lambda-url.us-east-1.on.aws/`) — there is no built-in CloudFormation function to extract just the hostname, hence the `!Select`/`!Split` on `/`.

- [ ] **Step 2: Install the SAM CLI locally and validate**

```bash
brew install aws-sam-cli 2>&1 | tail -20
sam --version
cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app
sam validate --template deploy/app-stack.yaml --region us-east-1
```

Expected: `sam --version` prints a version; `sam validate` prints `deploy/app-stack.yaml is a valid SAM Template`. If `brew install` fails (e.g. SAM CLI already present via a different method), confirm with `which sam` first — don't reinstall if it's already on PATH.

- [ ] **Step 3: Commit**

```bash
git add deploy/app-stack.yaml
git commit -m "Add CloudFormation/SAM template for S3 + Lambda + CloudFront"
git push origin infra/aws-deploy-pipeline
```

---

### Task 4: One-time AWS setup — SSM parameters and the GitHub Actions IAM user

**Files:** none (AWS CLI operations only).

**Interfaces:**
- Consumes: the 6 real config values, already present locally in `complaint-app/.env.local` (created earlier this session) — `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, `GOOGLE_SHEET_ID`, `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`.
- Produces: 6 SSM `SecureString` parameters under `/complaint-app/prod/` (consumed by Task 3's Lambda role and Task 2's wrapper at runtime); one IAM user `complaint-app-github-deploy` with an access key pair (consumed by Task 5's GitHub Actions workflow, stored as GitHub repo secrets `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`).

**This task must be run directly by you, not dispatched to a subagent** — it handles real secret plaintext (reading `.env.local` and an IAM access key), and that material shouldn't pass through a subagent's dispatch prompt or get written into its report file on disk.

- [ ] **Step 1: Create the 6 SSM parameters**

Run each of these from `complaint-app/`, substituting the real value from `.env.local` for `<value>` (do not paste them into any file — run directly in your shell):

```bash
aws ssm put-parameter --name "/complaint-app/prod/GOOGLE_SERVICE_ACCOUNT_EMAIL" --type SecureString --value "<value>" --region us-east-1
aws ssm put-parameter --name "/complaint-app/prod/GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY" --type SecureString --value "<value>" --region us-east-1
aws ssm put-parameter --name "/complaint-app/prod/GOOGLE_SHEET_ID" --type SecureString --value "<value>" --region us-east-1
aws ssm put-parameter --name "/complaint-app/prod/ANTHROPIC_API_KEY" --type SecureString --value "<value>" --region us-east-1
aws ssm put-parameter --name "/complaint-app/prod/ADMIN_PASSWORD" --type SecureString --value "<value>" --region us-east-1
aws ssm put-parameter --name "/complaint-app/prod/SESSION_SECRET" --type SecureString --value "<value>" --region us-east-1
```

For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` specifically: pass the value with literal `\n` sequences intact exactly as they appear in `.env.local` (the app's existing code in `src/lib/sheets.ts` already converts `\n` to real newlines at runtime — don't pre-convert them here).

- [ ] **Step 2: Verify the parameters**

```bash
aws ssm get-parameters-by-path --path "/complaint-app/prod/" --region us-east-1 --query "Parameters[].Name" --output table
```

Expected: a table listing all 6 parameter names (values not shown by this command, which is correct — you're only confirming names/count here).

- [ ] **Step 3: Create the IAM user**

```bash
aws iam create-user --user-name complaint-app-github-deploy
```

- [ ] **Step 4: Attach a scoped inline policy**

Save this to a temporary local file (not committed anywhere) and attach it:

```bash
cat > /tmp/complaint-app-deploy-policy.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationStack",
      "Effect": "Allow",
      "Action": "cloudformation:*",
      "Resource": "arn:aws:cloudformation:us-east-1:227912367863:stack/complaint-app-prod/*"
    },
    {
      "Sid": "SamManagedBucket",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::aws-sam-cli-managed-*",
        "arn:aws:s3:::aws-sam-cli-managed-*/*"
      ]
    },
    {
      "Sid": "AppAssetsBucket",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::complaint-app-assets-227912367863",
        "arn:aws:s3:::complaint-app-assets-227912367863/*"
      ]
    },
    {
      "Sid": "LambdaFunction",
      "Effect": "Allow",
      "Action": "lambda:*",
      "Resource": "arn:aws:lambda:us-east-1:227912367863:function:complaint-app-server-227912367863"
    },
    {
      "Sid": "CloudFrontDistributions",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:TagResource",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:GetOriginAccessControl",
        "cloudfront:UpdateOriginAccessControl"
      ],
      "Resource": "*"
    },
    {
      "Sid": "LambdaExecutionRole",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:GetRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy",
        "iam:PassRole",
        "iam:TagRole"
      ],
      "Resource": "arn:aws:iam::227912367863:role/complaint-app-server-role-227912367863"
    },
    {
      "Sid": "ReadOwnSsmParams",
      "Effect": "Allow",
      "Action": ["ssm:GetParameter", "ssm:GetParametersByPath"],
      "Resource": "arn:aws:ssm:us-east-1:227912367863:parameter/complaint-app/prod/*"
    }
  ]
}
EOF

aws iam put-user-policy \
  --user-name complaint-app-github-deploy \
  --policy-name complaint-app-deploy-policy \
  --policy-document file:///tmp/complaint-app-deploy-policy.json

rm /tmp/complaint-app-deploy-policy.json
```

- [ ] **Step 5: Generate an access key**

```bash
aws iam create-access-key --user-name complaint-app-github-deploy
```

This prints `AccessKeyId` and `SecretAccessKey` **once** — copy both immediately; AWS does not show the secret again. Do not save this output to any file in the repo or in your shell history in a way that persists.

- [ ] **Step 6: Store the key pair as GitHub repository secrets**

```bash
cd /Users/vivekgaddipati/projects/apartment_complaint_registration/complaint-app
gh secret set AWS_ACCESS_KEY_ID --repo vivek-gaddipati/apartment-complaint-registration
# paste the AccessKeyId when prompted
gh secret set AWS_SECRET_ACCESS_KEY --repo vivek-gaddipati/apartment-complaint-registration
# paste the SecretAccessKey when prompted
```

- [ ] **Step 7: Verify**

```bash
gh secret list --repo vivek-gaddipati/apartment-complaint-registration
```

Expected: lists `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (values never shown, only names + update timestamps — that's correct).

- [ ] **Step 8: Create the GitHub `production` environment with a required reviewer**

```bash
gh api repos/vivek-gaddipati/apartment-complaint-registration/environments/production -X PUT
```

Then, since `gh api` alone doesn't set required reviewers in one call, open the repo's Settings → Environments → `production` in a browser and add yourself as a required reviewer (this specific sub-setting isn't exposed via a simple `gh` CLI flag as of this writing — confirm by checking `gh api repos/vivek-gaddipati/apartment-complaint-registration/environments/production` afterward for a `protection_rules` entry of type `required_reviewers`; if the CLI environment does support setting this directly in your installed `gh` version, use that instead of the browser).

- [ ] **Step 9: Mark this task complete**

No files to commit for this task — verification in Steps 2, 7, and 8 is the completion evidence.

---

### Task 5: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `deploy/app-stack.yaml` (Task 3), `deploy/lambda-bootstrap.mjs` (Task 2), the GitHub repo secrets `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` and the `production` environment (Task 4), and the SSM parameters at path `/complaint-app/prod/` (Task 4, used to populate `ADMIN_PASSWORD` for the Playwright test run, matching how the existing `playwright.config.ts` already reads it from `.env.local` locally).
- Produces: on every push to `main`, a workflow run with a `build-and-test` job followed by a `deploy` job gated on the `production` environment's required approval.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  STACK_NAME: complaint-app-prod
  SSM_PREFIX: /complaint-app/prod/

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Configure AWS credentials (for SSM-sourced test env vars)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Load app config from SSM for the test run
        run: |
          for key in GOOGLE_SERVICE_ACCOUNT_EMAIL GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY GOOGLE_SHEET_ID ANTHROPIC_API_KEY ADMIN_PASSWORD SESSION_SECRET; do
            value=$(aws ssm get-parameter --name "${SSM_PREFIX}${key}" --with-decryption --query "Parameter.Value" --output text --region "${AWS_REGION}")
            echo "${key}=${value}" >> "$GITHUB_ENV"
            echo "::add-mask::${value}"
          done

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run Playwright e2e suite
        run: npx playwright test

      - name: Build with OpenNext
        run: npx open-next build --dangerously-use-unsupported-next-version

      - name: Copy Lambda bootstrap wrapper into the server function bundle
        run: cp deploy/lambda-bootstrap.mjs .open-next/server-functions/default/bootstrap-handler.mjs

      - name: Upload build output
        uses: actions/upload-artifact@v4
        with:
          name: open-next-build
          path: .open-next/
          retention-days: 1

  deploy:
    needs: build-and-test
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Download build output
        uses: actions/download-artifact@v4
        with:
          name: open-next-build
          path: .open-next/

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - uses: aws-actions/setup-sam@v2

      - name: Deploy infrastructure (S3 bucket, Lambda role, CloudFront)
        run: |
          sam deploy \
            --template-file deploy/app-stack.yaml \
            --stack-name "${STACK_NAME}" \
            --resolve-s3 \
            --capabilities CAPABILITY_NAMED_IAM \
            --no-confirm-changeset \
            --no-fail-on-empty-changeset \
            --parameter-overrides SsmParameterPrefix="${SSM_PREFIX}"

      - name: Sync static assets to S3
        run: |
          BUCKET=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
            --query "Stacks[0].Outputs[?OutputKey=='AssetsBucketName'].OutputValue" --output text)
          aws s3 sync .open-next/assets "s3://${BUCKET}/_assets" --delete

      - name: Update Lambda function code
        run: |
          FUNCTION=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
            --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue" --output text)
          cd .open-next/server-functions/default
          zip -qr /tmp/server-function.zip .
          aws lambda update-function-code --function-name "${FUNCTION}" --zip-file fileb:///tmp/server-function.zip
          aws lambda wait function-updated --function-name "${FUNCTION}"

      - name: Invalidate CloudFront cache
        run: |
          DIST_DOMAIN=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
            --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text)
          DIST_ID=$(aws cloudfront list-distributions \
            --query "DistributionList.Items[?DomainName=='${DIST_DOMAIN}'].Id" --output text)
          aws cloudfront create-invalidation --distribution-id "${DIST_ID}" --paths "/*"

      - name: Print the app URL
        run: |
          aws cloudformation describe-stacks --stack-name "${STACK_NAME}" \
            --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text
```

**Notes for the implementer, not part of the workflow file itself:**
- `sam deploy --resolve-s3` auto-creates and manages its own artifact-staging S3 bucket the first time it runs — this is separate from `AssetsBucket` in the template (that one holds the app's static JS/CSS, this one only holds the packaged Lambda zip/template temporarily during deploy). The IAM policy in Task 4 Step 4 already grants access to both.
- The Lambda code update happens as a *separate* step after `sam deploy`, rather than having SAM package the real Lambda code directly, because `deploy/app-stack.yaml`'s `ServerFunction.Code` is a placeholder stub (see Task 3's note) — `sam deploy` only needs to succeed at creating/updating the *infrastructure* (bucket, role, distribution); the *real* code always comes from the explicit `aws lambda update-function-code` step, which is simpler to reason about than getting SAM's own code-packaging to pick up the right directory on every run.
- `::add-mask::` in the "Load app config from SSM" step tells GitHub Actions to redact that value from all subsequent log output for the rest of the job — necessary since these values get echoed into `$GITHUB_ENV` from a shell variable.

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Actions workflow: lint + Playwright + deploy to AWS"
git push origin infra/aws-deploy-pipeline
```

- [ ] **Step 3: Merge to main and watch the first run**

This workflow only triggers on push to `main`, so it won't run on this feature branch. Once this whole plan's tasks are complete and reviewed (see the plan's execution handoff), merging `infra/aws-deploy-pipeline` into `main` (via a GitHub PR, matching how the previous feature branch was merged) triggers the first real run. Watch it with:

```bash
gh run watch --repo vivek-gaddipati/apartment-complaint-registration
```

Expected: `build-and-test` passes, then the run pauses waiting for approval on `production` — approve it via `gh run watch`'s prompt or the GitHub UI, then `deploy` runs to completion.

---

### Task 6: End-to-end verification of the first deploy

**Files:** none.

**Interfaces:**
- Consumes: the live CloudFront URL from Task 5's deploy job output.

- [ ] **Step 1: Get the app URL**

```bash
aws cloudformation describe-stacks --stack-name complaint-app-prod \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" \
  --output text --region us-east-1
```

- [ ] **Step 2: Smoke-test the owner flow**

Open `https://<the domain from Step 1>/owner` in a browser. Enter a real flat number from the Owners sheet (e.g. `F-301`, used earlier this session), complete PIN entry/verification, confirm the dashboard loads with real complaint data from the Google Sheet.

- [ ] **Step 3: Smoke-test the admin flow**

Open `https://<the domain>/admin`, log in with the real `ADMIN_PASSWORD` (the same one stored in SSM), confirm the dashboard loads, confirm `/admin/owners` loads and shows the full owner list, confirm the "Manage Owners" add/edit flow works against the real Sheet.

- [ ] **Step 4: Confirm the AI insights report path, via CloudWatch Logs, not the UI**

`ANTHROPIC_API_KEY` is a placeholder (`"not-configured"`) — `src/lib/claude.ts`'s `generateInsightsReport` catches any Anthropic API failure and silently falls back to a locally-computed report, returning a normal 200 with a plausible-looking summary. So clicking "Generate Report" in the UI and seeing *any* report — even one that reads like real prose — proves nothing about whether the SSM-sourced key loaded correctly; it will look identical whether the key is real, wrong, or missing.

Instead: from `/admin/report`, generate a report, then check CloudWatch Logs for the `ServerFunction` (`aws logs tail /aws/lambda/complaint-app-server-227912367863 --since 5m --region us-east-1` or via the console) for the line `Claude API call failed, using local analytics calculation:` — its presence confirms the fallback fired (expected, given the placeholder key) and that this code path executes without crashing the request. When a real `ANTHROPIC_API_KEY` is installed later, re-run this step and confirm that log line does *not* appear — that's the actual proof the real key loaded and was used.

- [ ] **Step 5: Confirm cold-start config loading works**

Since Lambda cold starts are the real-world equivalent of "first request after idle," and CloudFront/Lambda don't expose a simple way to force one on demand, this step is: if all of Steps 2-4 passed on what was likely this deployment's *first* invocation (no prior warm containers exist right after a fresh deploy), that already proves cold-start SSM loading works. Note in your final report whether this was in fact the first request post-deploy (it will be, unless you'd already hit the URL before Step 2).

- [ ] **Step 6: Mark this task, and the plan, complete**

No files to commit. This is the plan's final verification gate.
