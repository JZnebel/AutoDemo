#!/usr/bin/env node

/**
 * One-command Lambda deployment.
 *
 * Bundles the Remotion project, uploads to S3, and deploys the Lambda function.
 * After running this, you can render via:
 *   node cli.mjs render <dir> --renderer lambda
 *
 * Usage:
 *   node scripts/lambda-deploy.mjs
 *   node scripts/lambda-deploy.mjs --region eu-central-1
 *   node scripts/lambda-deploy.mjs --memory 3009 --verbose
 *
 * Prerequisites:
 *   1. Set REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY in .env
 *   2. Attach the IAM user policy (run: node scripts/lambda-deploy.mjs --policies)
 */

import { deploy, printPolicies, listFunctions } from "../lib/lambda.mjs";

const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (idx === -1) return undefined;
  if (args[idx].includes("=")) return args[idx].split("=")[1];
  return args[idx + 1];
}

const hasFlag = (name) => args.includes(`--${name}`);

if (hasFlag("policies")) {
  await printPolicies();
  process.exit(0);
}

if (hasFlag("list")) {
  const region = getFlag("region") || process.env.AWS_REGION || "us-east-1";
  const fns = await listFunctions({ region });
  console.log(`\nDeployed functions in ${region}:`);
  for (const fn of fns) {
    console.log(`  ${fn.functionName} (${fn.memorySizeInMb}MB, ${fn.timeoutInSeconds}s timeout)`);
  }
  if (fns.length === 0) console.log("  (none)");
  process.exit(0);
}

if (hasFlag("help") || hasFlag("h")) {
  console.log(`
Lambda Deploy — Deploy Remotion to AWS Lambda

Usage:
  node scripts/lambda-deploy.mjs              Deploy site + function
  node scripts/lambda-deploy.mjs --policies   Print required IAM policies
  node scripts/lambda-deploy.mjs --list       List deployed functions

Flags:
  --region <region>     AWS region (default: us-east-1)
  --memory <mb>         Lambda memory in MB (default: 2048)
  --timeout <sec>       Lambda timeout in seconds (default: 120)
  --disk <mb>           Ephemeral disk in MB (default: 2048)
  --verbose             Show upload progress
`);
  process.exit(0);
}

try {
  const result = await deploy({
    region: getFlag("region"),
    memory: getFlag("memory") ? parseInt(getFlag("memory")) : undefined,
    timeout: getFlag("timeout") ? parseInt(getFlag("timeout")) : undefined,
    disk: getFlag("disk") ? parseInt(getFlag("disk")) : undefined,
    verbose: hasFlag("verbose"),
  });

  console.log(`\n=== DEPLOY COMPLETE ===`);
  console.log(`  Region: ${result.region}`);
  console.log(`  Bucket: ${result.bucketName}`);
  console.log(`  Serve URL: ${result.serveUrl}`);
  console.log(`  Function: ${result.functionName}`);
  console.log(`\nYou can now render with:`);
  console.log(`  node cli.mjs render <dir> --renderer lambda`);
} catch (err) {
  console.error(`\nDeploy failed: ${err.message}`);
  if (err.message.includes("credentials")) {
    console.error("\nSet these in your .env file:");
    console.error("  REMOTION_AWS_ACCESS_KEY_ID=...");
    console.error("  REMOTION_AWS_SECRET_ACCESS_KEY=...");
  }
  process.exit(1);
}
