import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

// This app uses `dynamic = "force-dynamic"` on every route and has no ISR,
// no `next/image` usage, and no middleware — so the incremental cache
// (S3), tag cache (DynamoDB), and revalidation queue (SQS) that OpenNext
// wires up by default are all dead weight. Disabling them removes the need
// to provision or pay for any of that infrastructure.
const config: OpenNextConfig = {
  default: {
    override: {
      wrapper: "aws-lambda",
      converter: "aws-apigw-v2",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
  dangerous: {
    disableIncrementalCache: true,
    disableTagCache: true,
  },
};

export default config;
